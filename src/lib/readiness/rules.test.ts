import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adviceTitle, AREAS, areaRating, ruleById, namedCommands, namedManagers, readinessScan, runRules, type Rating, type RuleResult } from './rules';

const FIXTURES = join(process.cwd(), 'features', 'fixtures', 'folders');
const ratings = (results: RuleResult[]) => Object.fromEntries(AREAS.map((a) => [a, areaRating(results, a)])) as Record<(typeof AREAS)[number], Rating>;
const status = (results: RuleResult[]) => Object.fromEntries(results.map((r) => [r.rule, r.status]));
const run = (name: string) => runRules(readinessScan(join(FIXTURES, name)));

describe('readiness rules on the four fixture folders', () => {
  it('rates every area Missing in a new folder', () => {
    expect(Object.values(ratings(run('new')))).toEqual(AREAS.map(() => 'Missing'));
  });

  it('finds an existing project without AI files missing almost everything, with a CI workflow that runs no tests', () => {
    const results = run('existing');
    expect(ratings(results)).toEqual({
      'Agent instructions': 'Missing', 'Project knowledge': 'Missing', Verification: 'Missing', Conventions: 'Missing', 'Agent tooling': 'Missing', Safety: 'Partly',
    });
    expect(results.find((r) => r.rule === 'VE-02')).toMatchObject({ status: 'fail', evidence: [{ path: '.github/workflows/lint.yml' }] });
    expect(results.find((r) => r.rule === 'SA-01')).toMatchObject({ status: 'fail', params: { patterns: '.env, .env*.local, *.pem, *.key' } });
  });

  it('flags agent files that disagree, the wrong package manager and a key in a tracked config file', () => {
    const results = run('existing-ai');
    expect(ratings(results)).toMatchObject({ 'Agent instructions': 'Partly', Conventions: 'Partly', Safety: 'Missing' });
    expect(status(results)).toMatchObject({ 'AI-01': 'pass', 'AI-02': 'fail', 'AI-03': 'pass', 'AI-04': 'fail', 'CO-02': 'pass', 'SA-02': 'fail' });
    expect(results.find((r) => r.rule === 'AI-02')?.evidence).toEqual([{ path: 'CLAUDE.md' }, { path: '.github/copilot-instructions.md' }]);
    expect(results.find((r) => r.rule === 'AI-04')).toMatchObject({ params: { manager: 'pnpm' }, evidence: expect.arrayContaining([{ path: '.github/copilot-instructions.md', line: 3 }, { path: 'pnpm-lock.yaml' }]) });
    expect(results.find((r) => r.rule === 'SA-02')).toMatchObject({ evidence: [{ path: '.cursor/mcp.json' }], params: { file: '.cursor/mcp.json', field: 'apiKey' } });
    expect(JSON.stringify(results)).not.toContain('fixture-not-a-key');
  });

  it('reads a Keel folder, including what is in .keel', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-ready-'));
    cpSync(join(FIXTURES, 'keel'), root, { recursive: true });
    mkdirSync(join(root, '.keel', 'standards', 'security-baseline'), { recursive: true });
    writeFileSync(join(root, '.keel', 'standards', 'security-baseline', 'SKILL.md'), '# Security\n');
    const results = runRules(readinessScan(root));
    expect(status(results)).toMatchObject({ 'CO-02': 'pass', 'AI-01': 'fail', 'SA-02': 'pass' });
  });

  it('passes on a well set-up project', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-ready-'));
    const put = (path: string, text: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    put('package.json', JSON.stringify({ scripts: { test: 'vitest run', verify: 'npm test' }, devDependencies: { vitest: '5.0.0' } }));
    put('package-lock.json', '{}');
    put('AGENTS.md', '# Agents\n\nRun `npm run verify` before you commit.\n');
    put('CLAUDE.md', 'Read AGENTS.md.\n');
    put('README.md', '# App\n\n## Quick start\n\nnpm start\n');
    put('docs/spec.md', '# Spec\n');
    put('docs/decisions/0001-stack.md', '# Stack\n');
    put('src/app.test.ts', 'test');
    put('features/app.feature', 'Feature: App\n');
    put('.github/workflows/ci.yml', 'jobs:\n  t:\n    steps:\n      - run: npm run verify\n');
    put('eslint.config.mjs', 'export default []\n');
    put('.claude/skills/style/SKILL.md', '# Style\n');
    put('.claude/agents/verifier.md', '# Verifier\n');
    put('.gitignore', 'node_modules\n.env\n.env*.local\n*.pem\n*.key\n');
    put('.env.example', 'API_KEY=\n');
    expect(Object.values(ratings(runRules(readinessScan(root))))).toEqual(AREAS.map(() => 'Ready'));
  });
});

describe('advice titles', () => {
  it('fills the parameters, or uses the plain title when there are none', () => {
    const rule = ruleById('VE-03');
    expect(rule && adviceTitle(rule, { reqs: 'REQ-002, REQ-005' })).toBe('Add scenarios for REQ-002, REQ-005');
    expect(rule && adviceTitle(rule)).toBe('Add acceptance scenarios');
  });
});

describe('reading agent files', () => {
  it('finds commands, skipping package manager built-ins', () => {
    expect(namedCommands('Run `npm run verify`, then `pnpm lint` and `make check`.\nUse `pnpm install` and `yarn add x`. Never make a mess.')).toEqual([
      { tool: 'script', name: 'verify', line: 1 }, { tool: 'script', name: 'lint', line: 1 }, { tool: 'make', name: 'check', line: 1 },
    ]);
  });

  it('finds the package managers a file asks for, not the ones it rules out', () => {
    expect(namedManagers('- Use pnpm, never npm or yarn')).toEqual([{ manager: 'pnpm', line: 1 }]);
    expect(namedManagers('Run `npx vitest`')).toEqual([{ manager: 'npm', line: 1 }]);
  });
});
