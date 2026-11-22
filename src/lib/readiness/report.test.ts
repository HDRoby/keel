import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Writer } from '../generate/writer';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { clearUserReports, compareReports, listReports, parseReport, readReport, reportsDir, saveChoices, userReportFiles } from './report';
import { runReadiness } from './run';

const FIXTURES = join(process.cwd(), 'features', 'fixtures', 'folders');
const quiet: Writer = async (_task, messages) => {
  const area = /for one area: ([^.]+)\./.exec(messages[0]?.content ?? '')?.[1];
  return JSON.stringify(area === 'Project knowledge'
    ? { why: [], findings: [], advice: [{ title: 'Explain the folders', why: 'Nothing says what src holds.', evidence: [{ path: 'src/index.ts' }], impact: 'Low', effort: 'Small', action: 'add' }, { title: 'Made up', why: 'x', evidence: [{ path: 'docs/does-not-exist.md' }], impact: 'High', effort: 'Small', action: 'add' }] }
    : { why: [{ rule: 'AI-02', text: 'Copilot and Claude get different instructions here.' }], findings: [], advice: [] });
};

describe('the readiness report', () => {
  it('before Initialise: kept in the user config folder, never with file contents or secret values, and moved in by Initialise', async () => {
    const store = tempStore('2026-11-22');
    cpSync(join(FIXTURES, 'existing-ai'), store.root, { recursive: true });
    const run = await runReadiness(store, { ticked: ['AGENTS.md', '.cursor/mcp.json'] }, quiet);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const { report, path } = run.value;
    expect(path.startsWith(store.user)).toBe(true);
    expect(existsSync(join(store.root, '.keel'))).toBe(false);
    expect(report).toMatchObject({ id: 'readiness-2026-11-22', folderCase: 'existing-ai', read: ['AGENTS.md'] });
    expect(report.areas.find((a) => a.area === 'Safety')).toMatchObject({ rating: 'Missing' });
    expect(report.advice.map((a) => a.title)).toContain('Explain the folders');
    expect(report.advice.map((a) => a.title)).not.toContain('Made up');
    expect(report.advice.find((a) => a.id === 'AI-02')).toMatchObject({ why: 'Copilot and Claude get different instructions here.', source: 'Scan', evidence: [{ path: 'CLAUDE.md' }, { path: '.github/copilot-instructions.md' }] });
    expect(report.advice.find((a) => a.id === 'SA-02')).toMatchObject({ title: 'Remove the key from .cursor/mcp.json, move it to an environment variable and rotate it', impact: 'High' });
    expect(report.advice[0]?.impact).toBe('High');
    expect(report.mapping.map((m) => m.proposal)).toEqual(['Keep', 'Point to', 'Point to']);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('# AI readiness report:');
    expect(text).not.toContain('fixture-not-a-key');
    expect(text).not.toContain('Use pnpm, never npm or yarn');   // AGENTS.md was read, but its content is not kept
    expect(parseReport(text)).toEqual(report);

    const files = userReportFiles(store);
    expect(files.map((f) => f.path)).toEqual(['.keel/reports/readiness-2026-11-22.md']);
    await initialiseProject(store, { title: 'Expense tracker', author: 'Ada', files });
    clearUserReports(store);
    expect(readdirSync(join(store.user, 'reports'))).toEqual([]);
    expect(listReports(store).map((r) => r.id)).toEqual(['readiness-2026-11-22']);
  });

  it('in a Keel folder: a Keel commit; the next report hides ignored advice and compares with the earlier one', async () => {
    const store = tempStore('2026-11-21');
    cpSync(join(FIXTURES, 'existing'), store.root, { recursive: true });
    await initialiseProject(store, { title: 'Readme helper', author: 'Ada' });
    const first = await runReadiness(store, { ticked: [] }, quiet);
    expect(first.ok && first.value.path).toBe('.keel/reports/readiness-2026-11-21.md');
    expect(execFileSync('git', ['log', '-1', '--format=%an|%s'], { cwd: store.root, encoding: 'utf8' }).trim()).toBe('Keel|Keel: AI readiness report readiness-2026-11-21');
    expect(reportsDir(store).inProject).toBe(true);
    const saved = await saveChoices(store, 'readiness-2026-11-21', { 'CO-01': 'ignore' });
    expect(saved.ok && saved.value.advice.find((a) => a.id === 'CO-01')?.choice).toBe('ignore');

    store.now = () => new Date('2026-11-22T12:00:00Z');
    const second = await runReadiness(store, { ticked: [] }, quiet);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.report.advice.map((a) => a.id)).not.toContain('CO-01');
    expect(second.value.report.hidden).toEqual(['CO-01']);
    expect(listReports(store).map((r) => r.id)).toEqual(['readiness-2026-11-22', 'readiness-2026-11-21']);
    const earlier = readReport(store, 'readiness-2026-11-21');
    expect(earlier && compareReports(earlier, second.value.report)).toEqual({ ratings: expect.any(Array), added: [], gone: [] });
  });

  it('a new folder: every area Missing, one piece of advice, and no model call', async () => {
    const store = tempStore('2026-11-22');
    let calls = 0;
    const run = await runReadiness(store, { ticked: [] }, async () => { calls += 1; return undefined; });
    expect(calls).toBe(0);
    expect(run.ok && run.value.report.areas.every((a) => a.rating === 'Missing')).toBe(true);
    expect(run.ok && run.value.report.advice.map((a) => a.title)).toEqual(['Initialise the folder with Keel']);
  });

  it('with the model failing, still rates every area from the rules and says why the review stopped', async () => {
    const store = tempStore('2026-11-22');
    cpSync(join(FIXTURES, 'existing'), store.root, { recursive: true });
    const run = await runReadiness(store, { ticked: [] }, async () => undefined);
    expect(run.ok && run.value.report.modelError).toContain('did not answer');
    expect(run.ok && run.value.report.areas).toHaveLength(6);
    expect(run.ok && run.value.report.advice.find((a) => a.id === 'VE-02')?.why).toContain('CI runs the tests');
  });
});
