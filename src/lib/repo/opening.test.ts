import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASELINE_MARKER, draftBaseline } from '../baseline/draft';
import { importSpecs } from '../baseline/import-specs';
import { readExplore, startIdea } from '../brainstorm/session';
import { configFormat, pendingUpgrade, upgradeConfig } from '../config/migrate';
import type { Writer } from '../generate/writer';
import { mergeKeelBlock, withClaudePointer } from '../handoff/write';
import { checkKeelFolder, needsAttention } from '../keel/checks';
import { fakeReply } from '../providers/fake';
import { listStandards, readStandard } from '../standards/library';
import { conventionsStandard, CONVENTIONS_FILE, CONVENTIONS_REF, rulesFromAgentFiles, rulesIn } from '../standards/from-agent-files';
import { openIndex } from '../store/db';
import { tempStore } from '../store/test-store';
import { initialiseProject, readConfig, writeConfig } from '../store/workspace';
import { scanFolder } from './scan';

function folder(files: Record<string, string>, git = false): string {
  const root = mkdtempSync(join(tmpdir(), 'keel-scan-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  if (git) {
    const run = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd: root, stdio: 'ignore' });
    run('init', '-q');
    run('add', '-A');
    run('commit', '-qm', 'Start');
  }
  return root;
}

describe('scanFolder', () => {
  it('tells the four cases apart from file names only', () => {
    expect(scanFolder(folder({})).kase).toBe('new');
    expect(scanFolder(folder({ 'notes.txt': 'hi' })).kase).toBe('new');
    const existing = scanFolder(folder({ 'package.json': '{"dependencies":{"next":"16"}}', 'README.md': '# App\n', 'src/app.ts': 'x', 'src/app.test.ts': 'x', 'node_modules/x/index.js': 'x' }, true));
    expect(existing).toMatchObject({ kase: 'existing', manifests: ['package.json'], codeFiles: 2, tests: 1, git: { repo: true, commits: 1, contributors: 1 }, agentFiles: [] });
    expect(existing.shareable.map((f) => [f.path, f.why])).toEqual([['README.md', 'What the project is'], ['package.json', 'Stack and dependencies']]);
    expect(existing.shareable[0]?.size).toBe(6);
    const ai = scanFolder(folder({ 'go.mod': 'module x', 'AGENTS.md': '- Use gofmt', '.cursor/rules/style.mdc': 'x', 'docs/notes.md': 'x', 'specs/001-login/spec.md': 'x' }));
    expect(ai).toMatchObject({ kase: 'existing-ai', agentFiles: ['AGENTS.md', '.cursor/rules/'], specTools: ['specs/ (Spec Kit)'], usedFolders: ['docs'] });
    const keel = folder({ '.keel/config.yml': 'id: PRJ-0001\n' });
    expect(scanFolder(keel).kase).toBe('keel');
  });
});

describe('rules from agent files', () => {
  it('finds short instructions, skipping headings, code and prose, and writes them as a standard Keel can read', () => {
    expect(rulesIn('# Our rules\n\n- Use pnpm, never npm or yarn.\n- **Always** run the linter\nThis repo is old and the build is slow, sorry about that.\n```\nnpm install\n```\n')).toEqual(['Use pnpm, never npm or yarn', 'Always run the linter']);
    const root = folder({ 'AGENTS.md': '- Use pnpm, never npm or yarn\n', 'CLAUDE.md': '- Use pnpm, never npm or yarn\n- Prefer small pull requests\n' });
    expect(rulesFromAgentFiles(root)).toEqual([{ rule: 'Use pnpm, never npm or yarn', source: 'AGENTS.md' }, { rule: 'Prefer small pull requests', source: 'CLAUDE.md' }]);
    mkdirSync(join(root, '.keel/standards/project-conventions'), { recursive: true });
    writeFileSync(join(root, CONVENTIONS_FILE), conventionsStandard(['Use pnpm, never npm or yarn'], ['AGENTS.md']));
    expect(readStandard(root, CONVENTIONS_REF)).toMatchObject({ ok: true, value: { name: 'Project conventions', version: 1 } });
    expect(listStandards(root).map((s) => s.ref)).toEqual([CONVENTIONS_REF]);
  });
});

describe('importSpecs', () => {
  it('reads Spec Kit and Kiro requirements with their original IDs', () => {
    const root = folder({
      'specs/001-login/spec.md': '## Requirements\n\n- **FR-001**: System MUST let users sign in\n- **FR-002**: System MUST lock after 5 tries\n',
      '.kiro/specs/export/requirements.md': '### Requirement 1\n\n**User Story:** As a user, I want to export, so that I can share\n',
    });
    expect(importSpecs(root)).toEqual([
      { alias: 'FR-001', text: 'System MUST let users sign in', source: 'specs/001-login/spec.md' },
      { alias: 'FR-002', text: 'System MUST lock after 5 tries', source: 'specs/001-login/spec.md' },
      { alias: 'Requirement 1', text: 'As a user, I want to export, so that I can share', source: '.kiro/specs/export/requirements.md' },
    ]);
  });
});

describe('opening a Keel folder', () => {
  it('offers to upgrade an old config and changes nothing until asked', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    expect(configFormat(readConfig(store.root) ?? {})).toBe(2);
    expect(needsAttention(checkKeelFolder(store))).toBe(false);
    const old = { ...readConfig(store.root) };
    delete old.format;
    delete old.mock_gate;
    writeConfig(store.root, old);
    const before = readFileSync(join(store.root, '.keel/config.yml'), 'utf8');
    expect(pendingUpgrade(store.root)).toEqual({ from: 1, to: 2, changes: ['Adds `format: 2`, so later versions of Keel know the shape of this file.', 'Adds `mock_gate: recommended` (Clickable mock before the plan, CR-0009).'] });
    expect(checkKeelFolder(store)).toMatchObject({ upgrade: { from: 1 }, pending: 0, missing: [] });
    expect(readFileSync(join(store.root, '.keel/config.yml'), 'utf8')).toBe(before);
    expect((await upgradeConfig(store)).ok).toBe(true);
    expect(readConfig(store.root)).toMatchObject({ format: 2, mock_gate: 'recommended' });
    expect(pendingUpgrade(store.root)).toBeUndefined();
    writeConfig(store.root, { ...readConfig(store.root), standards: ['gone@3'] });
    expect(checkKeelFolder(store).missing).toEqual(['The standard gone@3']);
  });
});

describe('draftBaseline', () => {
  it('sends only the chosen files, and puts its suggestions in Explore marked as built', async () => {
    const root = folder({ 'README.md': '# Readme helper\n\nNewcomers cannot run a project.\n\n- Show the run command\n- Export the log\n', 'package.json': '{"name":"x"}', 'specs/001/spec.md': '- **FR-001**: System MUST print the version\n' });
    const store = { root, user: tempStore().user, index: openIndex(root) };
    await startIdea(store, { title: 'Readme helper', idea: '', author: 'Ada', template: 'standard-intent@4', style: 'challenger@1' });
    const sent: string[] = [];
    const write: Writer = async (_t, messages) => {
      sent.push(messages.at(-1)?.content ?? '');
      return messages[0]?.content.includes(BASELINE_MARKER) ? fakeReply('anthropic', messages) : undefined;
    };
    const offered = scanFolder(root).shareable;
    const drafted = await draftBaseline(store, { share: ['README.md', 'secret.txt'], offered, stack: 'Node.js with JavaScript' }, write);
    expect(drafted).toMatchObject({ ok: true, value: { sent: ['README.md'], stack: 'Node.js with JavaScript' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('README.md');
    expect(sent[0]).not.toContain('"name":"x"');
    const explore = readExplore(store);
    if (!explore.ok) throw new Error(explore.message);
    expect(explore.value.sections.find((s) => s.key === 'Problem')).toMatchObject({ value: 'Newcomers cannot run a project.', origin: 'suggested' });
    expect(explore.value.sections.find((s) => s.key === 'Requirements')?.rows?.map((r) => [r.text, r.origin])).toEqual([
      ['Show the run command (as built)', 'suggested'], ['Export the log (as built)', 'suggested'], ['System MUST print the version (as built; FR-001 in specs/001/spec.md)', 'suggested'],
    ]);
    expect(existsSync(join(root, '.keel/baseline.json'))).toBe(true);

    const none: string[] = [];
    const other = folder({ 'README.md': '# X\n\nY\n' });
    const store2 = { root: other, user: tempStore().user, index: openIndex(other) };
    await startIdea(store2, { title: 'X', idea: '', author: 'Ada', template: 'standard-intent@4', style: 'challenger@1' });
    await draftBaseline(store2, { share: [], offered: scanFolder(other).shareable }, async (_t, m) => { none.push(m[0]?.content ?? ''); return undefined; });
    expect(none).toEqual([]);
  });
});

describe('merging agent files found at opening', () => {
  it('puts Keel between markers and keeps the rest, and adds one pointer line to CLAUDE.md', () => {
    const mine = '# Our agents\n\nUse pnpm.\n';
    const once = mergeKeelBlock(mine, '# AGENTS.md\n\nRead docs/plan.md.');
    expect(once).toBe('# Our agents\n\nUse pnpm.\n\n<!-- keel:start -->\n# AGENTS.md\n\nRead docs/plan.md.\n<!-- keel:end -->\n');
    expect(mergeKeelBlock(`${once}More of mine.\n`, 'New Keel text')).toBe('# Our agents\n\nUse pnpm.\n\n<!-- keel:start -->\nNew Keel text\n<!-- keel:end -->\nMore of mine.\n');
    expect(withClaudePointer('# Claude\n')).toContain('Read `AGENTS.md`');
    expect(withClaudePointer('See AGENTS.md.\n')).toBe('See AGENTS.md.\n');
  });
});

describe('the fixture folders for the four cases', () => {
  const list = (dir: string): string[] => execFileSync('find', [dir, '-type', 'f'], { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
  it('scans each one as its case and writes nothing', () => {
    const base = join(process.cwd(), 'features', 'fixtures', 'folders');
    const expected = { new: 'new', keel: 'keel', existing: 'existing', 'existing-ai': 'existing-ai' } as const;
    for (const [name, kase] of Object.entries(expected)) {
      const before = list(join(base, name));
      expect(scanFolder(join(base, name)).kase, name).toBe(kase);
      expect(list(join(base, name)), name).toEqual(before);
    }
    expect(rulesFromAgentFiles(join(base, 'existing-ai')).map((r) => r.rule)).toEqual(['Use pnpm, never npm or yarn', 'Always run the tests before a commit', 'Keep pull requests small']);
  });
});
