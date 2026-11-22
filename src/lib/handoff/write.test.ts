import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordDecision, review } from '../gates/approvals';
import { generatePlan } from '../generate/plan';
import { generateSpec } from '../generate/spec';
import { saveProvider } from '../settings/settings';
import { createDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject, readConfig } from '../store/workspace';
import { besidePath, planHandoff, stateOf, writeHandoff } from './write';

async function approvedPlan() {
  const store = tempStore();
  const silent = async () => undefined;
  await initialiseProject(store, { title: 'Demo', author: 'Ada', standards: ['security-baseline@2'] });
  await createDocument(store, { kind: 'intent', title: 'Demo', template: 'standard-intent@3', body: '## Requirements\n\n- REQ-001 Show the run command\n' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  await generateSpec(store, 'requirements-and-design-spec@2', silent);
  await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
  await generatePlan(store, silent);
  await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd: store.root, encoding: 'utf8' }).trim();
  return { store, git };
}

describe('besidePath and stateOf', () => {
  it('names the copy next to a conflicting file and tells the states apart', async () => {
    expect(besidePath('AGENTS.md')).toBe('AGENTS.keel.md');
    expect(besidePath('.github/workflows/ci.yml')).toBe('.github/workflows/ci.keel.yml');
    expect(besidePath('Makefile')).toBe('Makefile.keel');
    const { store } = await approvedPlan();
    const data = new TextEncoder().encode('# Agents\n');
    expect(stateOf(store.root, { path: 'AGENTS.md', data }, {})).toBe('new');
    writeFileSync(join(store.root, 'AGENTS.md'), '# Agents\n');
    expect(stateOf(store.root, { path: 'AGENTS.md', data }, {})).toBe('unchanged');
    writeFileSync(join(store.root, 'AGENTS.md'), '# Mine\n');
    expect(stateOf(store.root, { path: 'AGENTS.md', data }, {})).toBe('conflict');
    expect(stateOf(store.root, { path: 'AGENTS.md', data }, {}, true)).toBe('kept');
  });
});

describe('writeHandoff', () => {
  it('writes the agent files into the folder as one Keel commit, and only those files', async () => {
    const { store, git } = await approvedPlan();
    writeFileSync(join(store.root, 'notes.txt'), 'mine');
    const planned = await planHandoff(store);
    expect(planned.ok && planned.value.map((f) => f.path)).not.toContain('docs/plan.md');
    const written = await writeHandoff(store);
    expect(written).toMatchObject({ ok: true, value: { conflicts: [] } });
    for (const path of ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md', '.claude/agents/verifier.md', '.claude/skills/security-baseline/SKILL.md', '.github/workflows/ci.yml', 'docs/traceability.json']) {
      expect(existsSync(join(store.root, path)), path).toBe(true);
    }
    expect(git('log', '-1', '--format=%an|%s')).toBe('Keel|Keel: Handoff for plan v1');
    const committed = git('show', '--name-only', '--format=', 'HEAD').split('\n');
    expect(committed).toContain('AGENTS.md');
    expect(committed).toContain('.keel/config.yml');
    expect(committed).not.toContain('notes.txt');
    expect(Object.keys((readConfig(store.root)?.handoff as { files: Record<string, string> }).files)).toContain('AGENTS.md');
    // Written again with nothing new: no commit.
    expect(await writeHandoff(store)).toMatchObject({ ok: true, value: { written: [], commit: '' } });
  });

  it('rewrites a file Keel wrote, but keeps a file the user changed until they choose', async () => {
    const { store } = await approvedPlan();
    writeFileSync(join(store.root, 'AGENTS.md'), '# My own agents file\n');
    const first = await writeHandoff(store);
    expect(first).toMatchObject({ ok: true, value: { conflicts: ['AGENTS.md'] } });
    expect(readFileSync(join(store.root, 'AGENTS.md'), 'utf8')).toBe('# My own agents file\n');

    expect(await writeHandoff(store, { 'AGENTS.md': 'beside' })).toMatchObject({ ok: true, value: { written: ['AGENTS.keel.md'] } });
    expect(readFileSync(join(store.root, 'AGENTS.keel.md'), 'utf8')).toContain('## Read first');
    expect(await writeHandoff(store, { 'AGENTS.md': 'mine' })).toMatchObject({ ok: true, value: { conflicts: [] } });
    expect(await writeHandoff(store, { 'AGENTS.md': 'keel' })).toMatchObject({ ok: true, value: { written: ['AGENTS.md'] } });
    expect(readFileSync(join(store.root, 'AGENTS.md'), 'utf8')).toContain('## Read first');

    // Keel wrote it now: a later change of the commands rewrites it without asking.
    const planned = await planHandoff(store);
    expect(planned.ok && planned.value.find((f) => f.path === 'AGENTS.md')?.state).toBe('unchanged');
  });

  it('keeps the user\'s own setup files, and refuses to write a key', async () => {
    const { store } = await approvedPlan();
    writeFileSync(join(store.root, 'package.json'), '{"name":"mine"}\n');
    const planned = await planHandoff(store);
    expect(planned.ok && planned.value.find((f) => f.path === 'package.json')?.state).toBe('kept');
    await writeHandoff(store);
    expect(readFileSync(join(store.root, 'package.json'), 'utf8')).toBe('{"name":"mine"}\n');

    const other = await approvedPlan();
    saveProvider(other.store, 'openai', { apiKey: 'a-stored-key-0123456789' });
    const task = join(other.store.root, 'features', 'demo.feature');
    writeFileSync(task, `${readFileSync(task, 'utf8')}\n  # key a-stored-key-0123456789\n`);
    const refused = await writeHandoff(other.store, { 'features/demo.feature': 'keel' });
    expect(refused.ok ? '' : refused.message).toMatch(/^(Nothing was written|The package was not written): Stored credential in features\/demo\.feature/);
    expect(existsSync(join(other.store.root, 'AGENTS.md'))).toBe(false);
  });
});
