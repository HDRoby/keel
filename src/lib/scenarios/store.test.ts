import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approveChange, rejectChange } from '../changes/flow';
import { raiseScenarioChange } from '../changes/scenarios';
import { gateFor } from '../gates/rules';
import { projectState, recordDecision } from '../gates/approvals';
import { suggestFailureCase } from '../generate/scenario';
import { createFakeProvider } from '../providers/fake';
import type { Writer } from '../generate/writer';
import { createDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import {
  acceptAllSuggestions, acceptedScenarios, acceptSuggestion, addSuggestions, clearSuggestion, coverage, deleteScenario,
  gherkinView, pendingChange, saveScenario, suggestions, uncovered,
} from './store';

const SPEC = '# Spec\n\n## Requirements\n\n| ID | Requirement |\n| --- | --- |\n| REQ-001 | Record an expense |\n| REQ-002 | Export to CSV |\n| REQ-003 | Share with the accountant |\n';
const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

async function withSpec(status: 'draft' | 'approved' = 'draft') {
  const store = tempStore();
  await initialiseProject(store, { title: 'Expenses', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Expenses', template: 'standard-intent@4', status: 'approved', body: '## Requirements\n\n- REQ-001 Record an expense\n- REQ-002 Export to CSV\n- REQ-003 Share with the accountant\n' });
  await createDocument(store, { kind: 'spec', title: 'Expenses', template: 'requirements-and-design-spec@2', status, body: SPEC });
  mkdirSync(join(store.root, 'features'), { recursive: true });
  writeFileSync(join(store.root, 'features', 'expenses.feature'), 'Feature: Expenses\n\n  A description stays.\n\n  @REQ-001\n  Scenario: Record an expense\n    Given a receipt\n    When I record it\n    Then it is in the list\n\n  @REQ-003\n  Scenario: Share\n    Given an expense\n    When I share it\n    Then the accountant sees it\n');
  await commitFiles(store.root, ['features/expenses.feature'], 'Scenarios');
  return store;
}

const fake = createFakeProvider('anthropic', {});
const writer: Writer = async (_task, messages) => {
  let text = '';
  for await (const chunk of fake.stream(messages, { model: 'm' })) text += chunk;
  return text;
};

describe('coverage', () => {
  it('lists every spec requirement with its scenarios, and the ones with none', async () => {
    const store = await withSpec();
    const groups = coverage(store.root);
    expect(groups.map((g) => [g.id, g.accepted.length])).toEqual([['REQ-001', 1], ['REQ-002', 0], ['REQ-003', 1]]);
    expect(uncovered(store.root)).toEqual(['REQ-002']);
  });

  it('locks the plan, naming the requirements without a scenario', async () => {
    const store = await withSpec('approved');
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
    expect(gateFor(projectState(store), 'plan')).toMatchObject({ available: false, reason: 'Needs at least one accepted scenario for REQ-002' });
  });
});

describe('editing while the spec is a draft', () => {
  it('adds a scenario to the requirement\'s feature file, edits and deletes it, and keeps the rest of the file', async () => {
    const store = await withSpec();
    expect(await saveScenario(store, { req: 'REQ-001', name: 'Reject an empty amount', steps: [{ keyword: 'Given', text: 'no amount' }, { keyword: 'When', text: 'I record it' }, { keyword: 'Then', text: 'I am asked for one' }, { keyword: 'And', text: ' ' }] }, raiseScenarioChange)).toEqual({ ok: true, value: { written: ['features/expenses.feature'] } });
    const text = readFileSync(join(store.root, 'features/expenses.feature'), 'utf8');
    expect(text).toContain('  A description stays.');
    expect(text).toContain('  @REQ-001\n  Scenario: Reject an empty amount\n    Given no amount\n    When I record it\n    Then I am asked for one\n');
    expect(coverage(store.root)[0]?.accepted.length).toBe(2);
    // REQ-002 has no scenario yet: a new file named after the requirement.
    await saveScenario(store, { req: 'REQ-002', name: 'CSV', steps: [{ keyword: 'Given', text: 'expenses' }, { keyword: 'When', text: 'I export' }, { keyword: 'Then', text: 'I get a CSV' }] }, raiseScenarioChange);
    expect(readFileSync(join(store.root, 'features/export-to-csv.feature'), 'utf8')).toBe('Feature: Export to CSV\n\n  @REQ-002\n  Scenario: CSV\n    Given expenses\n    When I export\n    Then I get a CSV\n');
    const added = acceptedScenarios(store.root).find((s) => s.name === 'Reject an empty amount');
    await saveScenario(store, { id: added?.id, req: 'REQ-001', name: 'Refuse an empty amount', steps: added?.steps ?? [] }, raiseScenarioChange);
    expect(acceptedScenarios(store.root).map((s) => s.name)).toContain('Refuse an empty amount');
    await deleteScenario(store, acceptedScenarios(store.root).find((s) => s.name === 'Refuse an empty amount')?.id ?? '', raiseScenarioChange);
    expect(acceptedScenarios(store.root).map((s) => s.name)).toEqual(['Record an expense', 'Share', 'CSV']);
    expect(await saveScenario(store, { req: 'REQ-001', name: ' ', steps: [] }, raiseScenarioChange)).toMatchObject({ error: 'invalid-input' });
    expect(git(store.root, 'status', '--porcelain')).toBe('');
    expect(git(store.root, 'log', '-1', '--format=%an|%s')).toBe('Keel|Keel: Scenarios: delete Refuse an empty amount');
  });

  it('counts a suggestion only once accepted; clears it on request', async () => {
    const store = await withSpec();
    const suggested = await suggestFailureCase(store, 'REQ-002', writer);
    expect(suggested).toMatchObject({ ok: true, value: { req: 'REQ-002', kind: 'failure', name: 'Export to CSV is refused when the input is not valid' } });
    expect(coverage(store.root)[1]).toMatchObject({ accepted: [], suggested: [{ origin: 'suggested' }] });
    expect(uncovered(store.root)).toEqual(['REQ-002']);
    if (!suggested.ok) throw new Error(suggested.message);
    await acceptSuggestion(store, suggested.value.id, raiseScenarioChange);
    expect(uncovered(store.root)).toEqual([]);
    expect(suggestions(store.root)).toEqual([]);
    const [other] = await addSuggestions(store, [{ req: 'REQ-003', name: 'Maybe', steps: [{ keyword: 'Given', text: 'x' }] }], 'Keel: test');
    await clearSuggestion(store, other?.id ?? '');
    expect(suggestions(store.root)).toEqual([]);
    expect(git(store.root, 'status', '--porcelain')).toBe('');
    expect(await suggestFailureCase(store, 'REQ-009', writer)).toMatchObject({ error: 'not-found' });
    expect(await suggestFailureCase(store, 'REQ-001', async () => 'not json')).toMatchObject({ error: 'invalid-answer' });
  });

  it('accepts every suggestion at once', async () => {
    const store = await withSpec();
    await addSuggestions(store, [{ req: 'REQ-002', name: 'A', steps: [{ keyword: 'Given', text: 'a' }, { keyword: 'Then', text: 'b' }] }, { req: 'REQ-002', name: 'B', steps: [{ keyword: 'Given', text: 'c' }, { keyword: 'Then', text: 'd' }] }]);
    expect(await acceptAllSuggestions(store, raiseScenarioChange)).toEqual({ ok: true, value: 2 });
    expect(coverage(store.root)[1]?.accepted.map((s) => s.name)).toEqual(['A', 'B']);
  });
});

describe('editing after the spec is approved', () => {
  it('holds the edit in a change request; approving writes the feature file, rejecting drops it', async () => {
    const store = await withSpec('approved');
    const before = readFileSync(join(store.root, 'features/expenses.feature'), 'utf8');
    const held = await saveScenario(store, { req: 'REQ-002', name: 'CSV', steps: [{ keyword: 'Given', text: 'expenses' }, { keyword: 'When', text: 'I export' }, { keyword: 'Then', text: 'I get a CSV' }] }, raiseScenarioChange);
    expect(held).toEqual({ ok: true, value: { held: 'CR-0001' } });
    expect(existsSync(join(store.root, 'features/export-to-csv.feature'))).toBe(false);
    expect(pendingChange(store.root)?.change).toBe('CR-0001');
    expect(gherkinView(store.root).find((f) => f.file === 'features/export-to-csv.feature')).toMatchObject({ held: true });
    expect(readFileSync(join(store.root, 'changes/CR-0001/CR-0001.md'), 'utf8')).toContain('### features/export-to-csv.feature');
    // A second edit goes into the same request.
    await deleteScenario(store, 'features/expenses.feature#1', raiseScenarioChange);
    expect(readFileSync(join(store.root, 'features/expenses.feature'), 'utf8')).toBe(before);
    expect(await approveChange(store, 'CR-0001', 'Ada')).toMatchObject({ ok: true });
    expect(existsSync(join(store.root, 'features/export-to-csv.feature'))).toBe(true);
    expect(acceptedScenarios(store.root).map((s) => s.name)).toEqual(['Record an expense', 'CSV']);
    expect(pendingChange(store.root)).toBeUndefined();

    await saveScenario(store, { req: 'REQ-003', name: 'Share again', steps: [{ keyword: 'Given', text: 'x' }, { keyword: 'Then', text: 'y' }] }, raiseScenarioChange);
    expect(pendingChange(store.root)?.change).toBe('CR-0002');
    await rejectChange(store, 'CR-0002');
    expect(pendingChange(store.root)).toBeUndefined();
    expect(acceptedScenarios(store.root).map((s) => s.name)).not.toContain('Share again');
    expect(git(store.root, 'status', '--porcelain')).toBe('');
  });
});
