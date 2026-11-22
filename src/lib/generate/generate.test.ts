import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { raiseScenarioChange } from '../changes/scenarios';
import { acceptAllSuggestions, suggestions, uncovered } from '../scenarios/store';
import { describe, expect, it } from 'vitest';
import { saveModelChoice } from '../settings/settings';
import { ensureSeed } from '../seed';
import { createDocument, readDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { buildTrace } from '../trace/index';
import { recordDecision, review } from '../gates/approvals';
import { generatePlan, orderOfWork, plannedTasks } from './plan';
import { handOverToBaseline } from '../readiness/accept';
import { runReadiness } from '../readiness/run';
import { featureFile, generateSpec, requirementsTable, scenarioFor } from './spec';
import { asSectionBody, notWritten, providerWriter, sectionPrompt, writeSection, type Writer } from './writer';

const INTENT = '# Intent: Approvals\n\n## Requirements\n\n- REQ-001 Record an approval\n- REQ-002 Export the log\n';

async function approvedIntent() {
  const store = tempStore();
  ensureSeed(store.root, join(process.cwd(), 'seed'));
  await initialiseProject(store, { title: 'Approvals', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Approvals', body: INTENT, template: 'standard-intent@3' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  return store;
}

const silent: Writer = async () => undefined;

describe('writer', () => {
  it('asks for one section without headings and only known IDs', () => {
    const [system, user] = sectionPrompt({ kind: 'spec', title: 'App', heading: 'Approach', guidance: 'At component level.', sources: 'Intent' });
    expect(system?.content).toBe('You write the "Approach" section of the spec for the project "App". At component level. Write plain markdown without headings. Use only the requirement IDs that appear in the sources; never invent new ones.');
    expect(user).toEqual({ role: 'user', content: 'Intent' });
    expect(notWritten('Risks', '')).toBe('_Not written yet: Risks. No model was available._');
    expect(asSectionBody('## Part\n# Top\n### Kept\nText ##\n')).toBe('### Part\n### Top\n### Kept\nText ##');
  });

  it('collects the reply of the model chosen for the task', async () => {
    const store = tempStore();
    saveModelChoice(store, 'documents', { provider: 'openai', model: 'm' });
    expect(await providerWriter(store, { KEEL_PROVIDER: 'fake' })('documents', [{ role: 'user', content: 'Hi' }])).toBe('Reply from OpenAI: I read "Hi".');
  });

  it('writes a section with the model for the task, demoting headings, or says it was not written', async () => {
    const request = { kind: 'spec', title: 'App', heading: 'Risks', guidance: 'What could go wrong.', sources: 'Intent' };
    const asked: string[] = [];
    const model: Writer = async (task) => { asked.push(task); return '## Risk\nOne'; };
    expect(await writeSection(model, 'feasibility', request)).toBe('### Risk\nOne');
    expect(asked).toEqual(['feasibility']);
    expect(await writeSection(silent, 'documents', request)).toBe('_Not written yet: What could go wrong. No model was available._');
  });
});

describe('spec parts', () => {
  it('lists requirements with their source', () => {
    expect(requirementsTable({ 'REQ-001': 'A | B' })).toBe('| ID | Requirement | Source |\n| --- | --- | --- |\n| REQ-001 | A \\| B | Intent |');
  });

  it('tags a scenario with its requirement, using the model only when it is well formed', () => {
    expect(scenarioFor('REQ-001', 'Record an approval', '```gherkin\nScenario: Approve\nGiven a draft\nWhen I approve it\nThen it is approved\n```'))
      .toBe('  @REQ-001\n  Scenario: Approve\n    Given a draft\n    When I approve it\n    Then it is approved');
    expect(scenarioFor('REQ-002', 'Export the log', 'Sure! Here you go.')).toBe(
      '  @REQ-002\n  Scenario: Export the log\n    Given the situation REQ-002 is about\n    When the behaviour in REQ-002 is used\n    Then export the log',
    );
    expect(featureFile('App', ['  @REQ-001\n  Scenario: X'])).toBe('Feature: App\n\n  @REQ-001\n  Scenario: X\n');
  });
});

describe('generateSpec', () => {
  it('is locked until the intent is approved, then fills the template once', async () => {
    const store = tempStore();
    ensureSeed(store.root, join(process.cwd(), 'seed'));
    await initialiseProject(store, { title: 'Approvals', author: 'Ada' });
    await createDocument(store, { kind: 'intent', title: 'Approvals', body: INTENT, template: 'standard-intent@3' });
    expect(await generateSpec(store, 'requirements-and-design-spec@2', silent)).toMatchObject({ error: 'locked', message: 'Needs an approved intent' });
  });

  it('writes spec.md, and proposes one scenario per requirement as a suggestion that traces once accepted', async () => {
    const store = await approvedIntent();
    const calls: string[] = [];
    const writer: Writer = async (task, messages) => {
      calls.push(task);
      return messages[0]?.content.includes('Gherkin') ? undefined : `Text for ${task}.`;
    };
    expect(await generateSpec(store, 'roadmap@1', writer)).toMatchObject({ error: 'unknown-template' });
    const spec = await generateSpec(store, 'requirements-and-design-spec@2', writer);
    if (!spec.ok) throw new Error(spec.message);
    expect(spec.value.header).toMatchObject({ id: 'SPC-0001', status: 'draft', template: 'requirements-and-design-spec@2', from_intent: 'INT-0001@1' });
    expect(spec.value.body).toContain('## Requirements\n\n| ID | Requirement | Source |\n| --- | --- | --- |\n| REQ-001 | Record an approval | Intent |');
    expect(spec.value.body).toContain('## Feasibility review\n\nText for feasibility.');
    expect(spec.value.body).toContain('## Standards applied\n\nNone selected for this project.');
    expect(calls.filter((c) => c === 'feasibility')).toHaveLength(1);
    // Suggestions only: nothing in features/ until accepted (CR-0006).
    expect(buildTrace(store.root).requirements['REQ-002']?.scenarios).toEqual([]);
    expect(suggestions(store.root).map((s) => [s.req, s.name])).toEqual([['REQ-001', 'Record an approval'], ['REQ-002', 'Export the log']]);
    expect(uncovered(store.root)).toEqual(['REQ-001', 'REQ-002']);
    await acceptAllSuggestions(store, raiseScenarioChange);
    expect(buildTrace(store.root).requirements['REQ-002']?.scenarios).toEqual(['features/export-the-log.feature › Export the log']);
    expect(uncovered(store.root)).toEqual([]);
    expect(await generateSpec(store, 'requirements-and-design-spec@2', writer)).toMatchObject({ error: 'already-exists' });
  });

  it('marks sections no model wrote', async () => {
    const store = await approvedIntent();
    const spec = await generateSpec(store, 'short-spec@1', silent);
    expect(spec.ok && spec.value.body).toContain('## Approach\n\n_Not written yet: A few paragraphs. No model was available._');
  });
});

describe('plan parts', () => {
  const statements = { 'REQ-001': 'Record an approval', 'REQ-002': 'Export the log', 'REQ-003': 'Revoke' };

  it('reads tasks from the agreed format, drops unknown IDs, and covers every requirement', () => {
    expect(plannedTasks('T1 | Approvals | REQ-001, REQ-009\n- T2 | Nothing known | REQ-777\nchatter', statements)).toEqual([
      { title: 'Approvals', requirements: ['REQ-001'] },
      { title: 'Export the log', requirements: ['REQ-002'] },
      { title: 'Revoke', requirements: ['REQ-003'] },
    ]);
    expect(plannedTasks(undefined, { 'REQ-001': 'x'.repeat(100) })[0]?.title).toHaveLength(78);
  });

  it('builds the order of work with scenarios', () => {
    const table = orderOfWork([{ title: 'A', requirements: ['REQ-001'] }, { title: 'B', requirements: ['REQ-002'] }],
      [{ feature: 'features/approvals.feature', scenario: 'S', requirements: ['REQ-001'] }]);
    expect(table).toBe('| Task | Title | Requirements | Scenarios |\n| --- | --- | --- | --- |\n| T1 | A | REQ-001 | approvals |\n| T2 | B | REQ-002 | — |');
  });
});

describe('generatePlan', () => {
  it('needs a Go decision, then writes plan.md and one task file per task, all traceable', async () => {
    const store = await approvedIntent();
    expect(await generatePlan(store, silent)).toMatchObject({ error: 'locked', message: 'Needs a Go decision' });
    await generateSpec(store, 'requirements-and-design-spec@2', silent);
    await acceptAllSuggestions(store, raiseScenarioChange);   // the first draft's scenarios, accepted (CR-0006)
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Worth it.', consequences: '' });
    const writer: Writer = async (_task, messages) => (messages[0]?.content.startsWith('Split') ? 'T1 | Approval flow | REQ-001, REQ-002' : undefined);
    const plan = await generatePlan(store, writer);
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.value.header).toMatchObject({ id: 'PLN-0001', from_spec: 'SPC-0001@1', template: 'implementation-plan@2' });
    expect(plan.value.body).toContain('| T1 | Approval flow | REQ-001, REQ-002 | export-the-log, record-an-approval |');
    const task = readDocument(store, 'tasks/T1.md');
    expect(task).toMatchObject({ ok: true, value: { header: { id: 'T1', status: 'todo', plan: 'PLN-0001@1', requirements: ['REQ-001', 'REQ-002'] } } });
    const text = readFileSync(join(store.root, 'tasks/T1.md'), 'utf8');
    expect(text).toContain('# T1 · Approval flow');
    expect(text).toContain('- `features/record-an-approval.feature` › Record an approval');
    const trace = buildTrace(store.root);
    expect(trace.tasks.T1).toMatchObject({ requirements: ['REQ-001', 'REQ-002'], features: ['features/export-the-log.feature', 'features/record-an-approval.feature'] });
    expect(await generatePlan(store, writer)).toMatchObject({ error: 'already-exists' });
  });

  it('adds the readiness advice handed to the baseline as tasks after the planned ones (CR-0015)', async () => {
    const store = await approvedIntent();
    const run = await runReadiness(store, { ticked: [] }, silent);
    if (!run.ok) throw new Error(run.message);
    const keep = run.value.report.advice.find((a) => a.id === 'VE-01');
    expect(keep).toBeDefined();
    await handOverToBaseline(store, run.value.report.id, Object.fromEntries(run.value.report.advice.map((a) => [a.id, a.id === 'VE-01' ? 'add' : 'ignore'])));
    await generateSpec(store, 'requirements-and-design-spec@2', silent);
    await acceptAllSuggestions(store, raiseScenarioChange);
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Worth it.', consequences: '' });
    const writer: Writer = async (_task, messages) => (messages[0]?.content.startsWith('Split') ? 'T1 | Approval flow | REQ-001, REQ-002' : undefined);
    const plan = await generatePlan(store, writer);
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.value.body).toContain('## From the readiness report');
    expect(plan.value.body).toContain(`| T2 | ${keep?.title} | Verification | High |`);
    expect(readFileSync(join(store.root, 'tasks/T2.md'), 'utf8')).toContain(`From the AI readiness report \`${run.value.report.id}\``);
  });
});
