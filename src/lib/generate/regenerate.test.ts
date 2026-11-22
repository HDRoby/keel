import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { raiseScenarioChange } from '../changes/scenarios';
import { acceptAllSuggestions, suggestions } from '../scenarios/store';
import { describe, expect, it } from 'vitest';
import { ensureSeed } from '../seed';
import { createDocument, readDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { recordDecision, review } from '../gates/approvals';
import { generatePlan, regeneratePlan } from './plan';
import { conflictsOf, resolveConflicts } from './resolve';
import { generateSpec, regenerateSpec, standardsApplied } from './spec';
import type { Writer } from './writer';

const INTENT = '# Intent: Approvals\n\n## Requirements\n\n- REQ-001 Record an approval\n- REQ-002 Export the log\n';

async function project(standards: string[] = []) {
  const store = tempStore();
  ensureSeed(store.root, join(process.cwd(), 'seed'));
  await initialiseProject(store, { title: 'Approvals', author: 'Ada', standards });
  await createDocument(store, { kind: 'intent', title: 'Approvals', body: INTENT, template: 'standard-intent@3' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  return store;
}

/** A writer whose wording can be changed between generations. */
function writer(state: { round: number }): Writer {
  return async (task, messages) => {
    const system = messages[0]?.content ?? '';
    if (system.includes('Gherkin')) return undefined;
    if (system.startsWith('Split')) return state.round === 1 ? 'T1 | Record | REQ-001\nT2 | Export | REQ-002' : 'T1 | Record approvals | REQ-001\nT2 | Export | REQ-002';
    const section = /the "([^"]+)" section/.exec(system)?.[1];
    return `${section} text, round ${state.round}${section === 'Risks' || section === 'Flagged concerns' ? '' : ' (stable)'}`.replace(`, round ${state.round} (stable)`, ' (stable)');
  };
}

describe('standards in the spec', () => {
  it('lists the project standards and passes the spec ones to the model', async () => {
    const store = await project(['security-baseline@2', 'small-steps@1']);
    const seen: string[] = [];
    const spy: Writer = async (_t, messages) => {
      seen.push(messages.at(-1)?.content ?? '');
      return undefined;
    };
    const spec = await generateSpec(store, 'requirements-and-design-spec@2', spy);
    expect(spec.ok && spec.value.header.standards).toEqual(['security-baseline@2', 'small-steps@1']);
    expect(spec.ok && spec.value.body).toContain('## Standards applied\n\n- Security baseline v2 (`security-baseline@2`, Security team)\n- Small steps, tests first v1');
    expect(seen.some((s) => s.includes('security-baseline@2:'))).toBe(true);
    expect(seen.some((s) => s.includes('small-steps@1:'))).toBe(false);
    expect(standardsApplied([])).toBe('None selected for this project.');
  });
});

describe('regenerateSpec', () => {
  it('keeps edits, takes new text, raises conflicts that block approval, and resolves them', async () => {
    const store = await project();
    const state = { round: 1 };
    const first = await generateSpec(store, 'requirements-and-design-spec@2', writer(state));
    if (!first.ok) throw new Error(first.message);
    // The proposer edits Approach (unchanged by the next generation) and Flagged concerns (changed by it).
    const edited = first.value.body.replace('Approach text (stable)', 'My approach').replace('Flagged concerns text, round 1', 'My concerns');
    await saveDocument(store, 'docs/spec.md', { reason: 'Edit', body: edited });

    state.round = 2;
    const again = await regenerateSpec(store, writer(state));
    if (!again.ok) throw new Error(again.message);
    expect(again.value.header.version).toBe(3);
    expect(again.value.body).toContain('My approach');
    expect(again.value.body).toContain('My concerns');
    expect(conflictsOf(again.value).map((c) => c.name)).toEqual(['Flagged concerns']);
    expect(conflictsOf(again.value)[0]?.theirs).toContain('Flagged concerns text, round 2');
    expect(await review(store, 'spec', { action: 'approve', by: 'Ada', comment: '' })).toMatchObject({ error: 'conflicts' });

    const resolved = await resolveConflicts(store, 'spec', [{ name: 'Flagged concerns', choice: 'merged', merged: 'Both concerns.' }]);
    if (!resolved.ok) throw new Error(resolved.message);
    expect(resolved.value.body).toContain('## Flagged concerns\n\nBoth concerns.\n');
    expect(conflictsOf(resolved.value)).toEqual([]);
    expect(await resolveConflicts(store, 'spec', [{ name: 'Nope', choice: 'mine' }])).toMatchObject({ error: 'invalid-input' });
    expect(await review(store, 'spec', { action: 'approve', by: 'Ada', comment: '' })).toMatchObject({ ok: true });
    expect(await regenerateSpec(store, writer(state))).toMatchObject({ error: 'not-draft' });
  });

  it('proposes scenarios only for requirements that have none, and never touches the accepted ones', async () => {
    const store = await project();
    await generateSpec(store, 'requirements-and-design-spec@2', async () => undefined);
    await acceptAllSuggestions(store, raiseScenarioChange);   // the first draft's scenarios, accepted (CR-0006)
    const short = await project();
    await generateSpec(short, 'short-spec@1', async () => undefined);
    expect(suggestions(short.root)).toEqual([]);
    const dir = store.root;
    const before = readFileSync(join(dir, 'features/record-an-approval.feature'), 'utf8');
    await saveDocument(store, 'docs/intent.md', { reason: 'More', body: `${INTENT}- REQ-003 Revoke\n` });
    const again = await regenerateSpec(store, async () => undefined);
    expect(again.ok && conflictsOf(again.value)).toEqual([]);
    expect(suggestions(dir).map((s) => s.req)).toEqual(['REQ-003']);
    expect(readFileSync(join(dir, 'features/record-an-approval.feature'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'features/revoke.feature'))).toBe(false);
  });

});

describe('gates on regeneration', () => {
  it('refuses to regenerate or resolve on a locked stage', async () => {
    // A spec next to a draft intent (as read-back could bring in): the Spec stage is locked.
    const store = tempStore();
    ensureSeed(store.root, join(process.cwd(), 'seed'));
    await initialiseProject(store, { title: 'Approvals', author: 'Ada' });
    await createDocument(store, { kind: 'intent', title: 'Approvals', body: INTENT, template: 'standard-intent@3' });
    await createDocument(store, { kind: 'spec', title: 'Approvals', body: '# Spec\n', template: 'short-spec@1' });
    expect(await regenerateSpec(store, async () => undefined)).toMatchObject({ error: 'locked', message: 'Needs an approved intent' });
    expect(await resolveConflicts(store, 'spec', [])).toMatchObject({ error: 'locked' });
    expect(await regeneratePlan(store, async () => undefined)).toMatchObject({ error: 'locked', message: 'Needs a Go decision' });
  });
});

describe('regeneratePlan', () => {
  it('updates unedited tasks, keeps edited ones as conflicts, and removes dropped unedited tasks', async () => {
    const store = await project();
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes.', consequences: '' });
    const state = { round: 1 };
    await generatePlan(store, writer(state));
    const t2 = readDocument(store, 'tasks/T2.md');
    if (!t2.ok) throw new Error(t2.message);
    await saveDocument(store, 'tasks/T2.md', { reason: 'Edit', body: `${t2.value.body}\nMy note.\n` });

    state.round = 2;
    await saveDocument(store, 'docs/intent.md', { reason: 'Drop export', body: INTENT.replace('- REQ-002 Export the log\n', '') });
    const again = await regeneratePlan(store, writer(state));
    if (!again.ok) throw new Error(again.message);
    expect(readDocument(store, 'tasks/T1.md')).toMatchObject({ ok: true, value: { header: { title: 'Record approvals', version: 2 } } });
    expect(conflictsOf(again.value).map((c) => [c.name, c.theirs])).toEqual([['tasks/T2.md', '']]);
    expect(existsSync(join(store.root, 'tasks/T2.md'))).toBe(true);

    const t1 = readDocument(store, 'tasks/T1.md');
    expect(t1.ok && t1.value.header.plan).toBe('PLN-0001@2');
    await resolveConflicts(store, 'plan', [{ name: 'tasks/T2.md', choice: 'theirs' }]);
    expect(existsSync(join(store.root, 'tasks/T2.md'))).toBe(false);
    expect(await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' })).toMatchObject({ ok: true });
  });
});
