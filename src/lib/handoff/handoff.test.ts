import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { raiseScenarioChange } from '../changes/scenarios';
import { acceptAllSuggestions } from '../scenarios/store';
import { describe, expect, it } from 'vitest';
import { recordDecision, review } from '../gates/approvals';
import { generatePlan } from '../generate/plan';
import { generateSpec } from '../generate/spec';
import { ensureSeed } from '../seed';
import { saveProvider } from '../settings/settings';
import { createDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { buildHandoff, DEFAULT_COMMANDS, handoffCommands, minimalSetup, saveHandoffCommands } from './scaffold';
import { scanForSecrets } from './secrets-scan';
import { featureSteps, stepExpression, stepStubs } from './stubs';
import { crc32, createZip, readZip } from './zip';

describe('zip', () => {
  it('round-trips files, compressing when it helps', () => {
    const big = new TextEncoder().encode('a'.repeat(5000));
    const zip = createZip([{ path: 'docs/a.md', data: big }, { path: 'b.bin', data: new Uint8Array([1, 2, 3]) }]);
    expect(zip.length).toBeLessThan(5000);
    expect(readZip(zip).map((e) => [e.path, e.data.length])).toEqual([['docs/a.md', 5000], ['b.bin', 3]]);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('can be listed by the system unzip and refuses unsafe paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-zip-'));
    const file = join(dir, 'p.zip');
    writeFileSync(file, createZip([{ path: 'x/y.txt', data: new TextEncoder().encode('hi') }]));
    try {
      expect(execFileSync('unzip', ['-p', file, 'x/y.txt']).toString()).toBe('hi');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    expect(() => createZip([{ path: '../evil', data: new Uint8Array() }])).toThrow();
    expect(() => readZip(Buffer.from('nope'))).toThrow();
  });
});

describe('scanForSecrets', () => {
  it('finds key and token patterns and stored credentials, without echoing them', () => {
    const findings = scanForSecrets([
      { path: 'a.md', text: 'ok\nANTHROPIC=sk-ant-api03-abcdefghijklmnopqrstuv' },
      { path: 'b.md', text: 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
      { path: 'c.pem', text: '-----BEGIN RSA PRIVATE KEY-----' },
      { path: 'd.txt', text: 'my-own-secret-value-here' },
      { path: 'e.md', text: 'REQ-001 Keys are stored encrypted; see the security baseline.' },
    ], ['my-own-secret-value-here']);
    expect(findings.map((f) => `${f.path}:${f.line}:${f.kind}`)).toEqual([
      'a.md:2:Anthropic API key', 'b.md:1:GitHub token', 'b.md:1:Key or token assignment', 'c.pem:1:Private key', 'd.txt:1:Stored credential',
    ]);
    expect(JSON.stringify(findings)).not.toContain('sk-ant');
  });
});

describe('step stubs', () => {
  const feature = 'Feature: X\n  @REQ-001\n  Scenario: A\n    Given a "quoted" thing\n    And docs/plan.md (v2) {x}\n    When it\'s used\n    Then it works\n    But nothing breaks\n';

  it('reads steps and resolves And and But', () => {
    expect(featureSteps(feature).map((s) => `${s.keyword} ${s.text}`)).toEqual([
      'Given a "quoted" thing', 'Given docs/plan.md (v2) {x}', "When it's used", 'Then it works', 'Then nothing breaks',
    ]);
    expect(stepExpression('docs/plan.md (v2) {x}')).toBe('docs\\\\/plan.md \\\\(v2\\\\) \\\\{x\\\\}');
  });

  it('writes one failing stub per step, defines a shared step once, and is valid TypeScript', () => {
    const [first, second] = stepStubs([{ path: 'features/a.feature', content: feature }, { path: 'features/b.feature', content: 'Feature: B\n  Scenario: B\n    Then it works\n' }]);
    expect(first?.path).toBe('features/steps/a.steps.ts');
    expect(first?.content).toContain("Given('docs\\\\/plan.md \\\\(v2\\\\) \\\\{x\\\\}', async () => {\n  throw new Error('Not implemented: docs/plan.md (v2) {x}');");
    expect(first?.content).toContain("When('it\\'s used'");
    expect(second?.content).toContain('defined in another steps file');
    for (const file of [first, second]) {
      const out = ts.transpileModule(file?.content ?? '', { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext } });
      expect(out.diagnostics).toEqual([]);
    }
  });
});

describe('minimalSetup', () => {
  it('adds package.json scripts for the npm commands, and nothing for other stacks', () => {
    const files = minimalSetup('My App!', DEFAULT_COMMANDS);
    expect(files.map((f) => f.path)).toEqual(['package.json', 'tsconfig.json', 'playwright.config.ts', '.gitignore']);
    const pkg = JSON.parse(files[0]?.content ?? '{}');
    expect(pkg.name).toBe('my-app');
    expect(Object.keys(pkg.scripts)).toEqual(['dev', 'test', 'test:bdd', 'verify']);
    expect(pkg.scripts.verify).toBe('npm test && npm run test:bdd');
    expect(minimalSetup('X', { ...DEFAULT_COMMANDS, verify: 'npm run check' })[0]?.content).toContain('"check": "npm test && npm run test:bdd"');
    expect(minimalSetup('X', { ...DEFAULT_COMMANDS, install: 'pip install -r requirements.txt' })).toEqual([]);
  });
});

describe('buildHandoff', () => {
  async function approvedPlan() {
    const store = tempStore();
    ensureSeed(store.root, join(process.cwd(), 'seed'));
    const silent = async () => undefined;
    await initialiseProject(store, { title: 'Demo', author: 'Ada', standards: ['security-baseline@2'] });
    await createDocument(store, { kind: 'intent', title: 'Demo', template: 'standard-intent@3', body: '## Requirements\n\n- REQ-001 Show the run command\n' });
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    expect(await buildHandoff(store)).toMatchObject({ error: 'locked' });
    await generateSpec(store, 'requirements-and-design-spec@2', silent);
    await acceptAllSuggestions(store, raiseScenarioChange);   // the first draft's scenarios, accepted (CR-0006)
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
    await generatePlan(store, silent);
    await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' });
    return store;
  }

  it('builds the scaffold from the project, with the commands, agent kit and standards', async () => {
    const store = await approvedPlan();
    await saveHandoffCommands(store, { ...DEFAULT_COMMANDS, verify: 'make check' });
    expect(handoffCommands(store).verify).toBe('make check');
    const built = await buildHandoff(store);
    if (!built.ok) throw new Error(built.message);
    const paths = built.value.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      'AGENTS.md', 'CLAUDE.md', 'REVIEW.md', 'README.md', 'docs/intent.md', 'docs/spec.md', 'docs/plan.md', 'docs/roadmap.md',
      'docs/decisions/0001-go.md', 'docs/traceability.json', 'tasks/T1.md', 'features/show-the-run-command.feature', 'features/steps/show-the-run-command.steps.ts',
      '.claude/agents/verifier.md', '.claude/skills/security-baseline/SKILL.md', '.github/workflows/ci.yml',
      'package.json', 'tsconfig.json', 'playwright.config.ts', '.gitignore',
    ]));
    expect(paths.some((p) => p.startsWith('.keel/') || p === 'brainstorm.md' || p === 'project.md')).toBe(false);
    const file = (p: string) => new TextDecoder().decode(built.value.find((f) => f.path === p)?.data);
    expect(file('AGENTS.md')).toContain('```\nmake check\n```');
    expect(file('AGENTS.md')).not.toContain('<!--');
    expect(file('.github/workflows/ci.yml')).toContain('- run: make check');
    expect(file('.github/workflows/ci.yml')).toContain('- run: npx playwright install --with-deps chromium');
    expect(file('.github/workflows/ci.yml')).toContain('          name: bdd-results\n          path: test-results/bdd.json');
    expect(file('.claude/agents/verifier.md')).toContain('`npm run test:bdd -- --grep "@REQ-xxx"`');
    expect(file('.claude/agents/verifier.md')).not.toContain('template_version');
    expect(file('.claude/agents/researcher.md')).toContain('`docs/traceability.json`');
    expect(file('.claude/agents/code-simplifier.md')).toContain('`make check`');
    expect(built.value.filter((f) => /\{\{\s*[a-z_]+\s*\}\}/.test(new TextDecoder().decode(f.data))).map((f) => f.path)).toEqual([]);
    expect(file('REVIEW.md')).toContain('## Do not report\n\n- Style the linter already checks.');
    expect(JSON.parse(file('docs/traceability.json')).requirements['REQ-001'].tasks).toEqual(['T1']);
  });

  it('refuses to write a package that would contain a key', async () => {
    const store = await approvedPlan();
    saveProvider(store, 'openai', { apiKey: 'a-stored-key-0123456789' });
    const plan = readFileSync(join(store.root, 'docs/plan.md'), 'utf8');
    expect(plan).not.toContain('a-stored-key');
    await saveDocument(store, 'tasks/T1.md', { reason: 'Oops', body: '# T1\n\nUse a-stored-key-0123456789 to log in.\n' });
    const built = await buildHandoff(store);
    expect(built).toMatchObject({ ok: false, error: 'secrets-found', message: expect.stringMatching(/^The package was not written: Stored credential in tasks\/T1\.md line \d+$/) });
    expect(built.ok ? '' : built.message).not.toContain('a-stored-key');
  });
});
