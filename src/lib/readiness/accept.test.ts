import { cpSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readChange } from '../changes/store';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { createChangeFromAdvice, handOverToBaseline, readinessHandover } from './accept';
import { readReport, type Choice } from './report';
import { runReadiness } from './run';

const FIXTURES = join(process.cwd(), 'features', 'fixtures', 'folders');
const silent = async () => undefined;

describe('acting on the readiness advice', () => {
  it('in a Keel folder: two accepted items make a draft change request with two tasks', async () => {
    const store = tempStore('2026-11-22');
    cpSync(join(FIXTURES, 'existing'), store.root, { recursive: true });
    await initialiseProject(store, { title: 'Readme helper', author: 'Ada' });
    const run = await runReadiness(store, { ticked: [] }, silent);
    if (!run.ok) throw new Error(run.message);
    const [a, b, ...rest] = run.value.report.advice;
    const choices: Record<string, Choice> = Object.fromEntries([[a?.id, 'add'], [b?.id, 'adopt'], ...rest.map((r) => [r.id, 'ignore'])]);
    const made = await createChangeFromAdvice(store, run.value.report.id, choices);
    expect(made).toEqual({ ok: true, value: 'CR-0001' });
    expect(readChange(store.root, 'CR-0001')).toMatchObject({ status: 'draft', origin: 'keel', requirements: [] });
    const tasks = readdirSync(join(store.root, 'changes', 'CR-0001', 'tasks')).sort();
    expect(tasks).toHaveLength(2);
    expect(readFileSync(join(store.root, 'changes', 'CR-0001', 'tasks', tasks[1] as string), 'utf8')).toContain(`Adopt: ${b?.title}`);
    expect(readReport(store, run.value.report.id)).toMatchObject({ change: 'CR-0001' });
    expect(await createChangeFromAdvice(store, run.value.report.id, Object.fromEntries(run.value.report.advice.map((r) => [r.id, 'ignore'])))).toMatchObject({ ok: false, error: 'nothing' });
  });

  it('before Initialise: hands the accepted items to the baseline, split into what Initialise covers and plan tasks', async () => {
    const store = tempStore('2026-11-22');
    cpSync(join(FIXTURES, 'existing-ai'), store.root, { recursive: true });
    const run = await runReadiness(store, { ticked: [] }, silent);
    if (!run.ok) throw new Error(run.message);
    expect(readinessHandover(store)).toBeUndefined();
    expect(await handOverToBaseline(store, run.value.report.id, { 'CO-01': 'ignore' })).toEqual({ ok: true, value: run.value.report.advice.length - 1 });
    const handover = readinessHandover(store);
    expect(handover?.matched.map((m) => m.title)).toContain('Make AGENTS.md the single source');
    expect(handover?.standards).toEqual(['security-baseline@2']);
    expect(handover?.tasks.map((t) => t.id)).toEqual(expect.arrayContaining(['AI-04', 'SA-02', 'VE-01']));
    expect(handover?.tasks.map((t) => t.id)).not.toContain('CO-01');
  });
});
