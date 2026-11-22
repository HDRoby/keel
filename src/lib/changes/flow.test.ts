import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { raiseScenarioChange } from '../changes/scenarios';
import { acceptAllSuggestions } from '../scenarios/store';
import { describe, expect, it } from 'vitest';
import { fillSections } from '../brainstorm/fill';
import { loadContext, sectionOf, startIdea } from '../brainstorm/session';
import { recordDecision, review, stageSummaries } from '../gates/approvals';
import { draftIntent, saveChangeRequest } from '../generate/intent';
import { generatePlan } from '../generate/plan';
import { generateSpec } from '../generate/spec';
import { readDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { approveChange, decideImpact, rejectChange, setChangeSize, submitChange, writePackage } from './flow';
import { changeImpact, sizeOf } from './impact';
import { outOfDate } from './stale';
import { computeStatus, createChange, listChanges, readChange } from './store';

const silent = async () => undefined;
const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

/** An approved intent (REQ-001 to REQ-003), spec and plan, with task files and scenarios that trace to them. */
async function approvedPlan() {
  const store = tempStore();
  const made = await startIdea(store, { title: 'Expense tracker', idea: '', author: 'Ada', template: 'standard-intent@4', style: 'coach@1' });
  if (!made.ok) throw new Error(made.message);
  fillSections(store, {
    Problem: 'Receipts get lost.', 'Who it is for': 'Small teams.', 'Desired outcome': 'Every expense recorded within a day.',
    Requirements: ['Record an expense', 'See expenses by month', 'Export to CSV'],
  });
  await draftIntent(store);
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  await generateSpec(store, 'requirements-and-design-spec@2', silent);
  await acceptAllSuggestions(store, raiseScenarioChange);   // the first draft's scenarios, accepted (CR-0006)
  await review(store, 'spec', { action: 'approve', by: 'Ada', comment: '' });
  await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
  await generatePlan(store, silent);
  await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' });
  return store;
}

describe('impact by requirement', () => {
  it('lists the later documents with the tasks and scenarios a requirement reaches', async () => {
    const store = await approvedPlan();
    const { documents, impact } = changeImpact(store.root, 'docs/intent.md', ['REQ-003']);
    expect(documents.map((d) => d.document)).toEqual(['docs/spec.md', 'docs/plan.md']);
    expect(impact.tasks.length).toBeGreaterThan(0);
    expect(documents.find((d) => d.stage === 'plan')?.items[0]).toMatch(/^Task T\d+ · .* \(REQ-003\)$/);
    expect(documents.find((d) => d.stage === 'spec')?.items.some((i) => i.startsWith('Scenario features/'))).toBe(true);
    expect(changeImpact(store.root, 'docs/plan.md', ['REQ-003']).documents).toEqual([]);
    expect([sizeOf([], 0), sizeOf(['REQ-001'], 0), sizeOf([], 1)]).toEqual(['minor', 'significant', 'significant']);
  });
});

describe('a change to the approved intent, from Explore', () => {
  it('approving writes the next intent version with the change, and marks later documents out of date until resolved', async () => {
    const store = await approvedPlan();
    fillSections(store, { Requirements: ['Record an expense', 'See expenses by month', 'Export to CSV', 'Share with the accountant'] });
    const raised = await saveChangeRequest(store);
    expect(raised).toMatchObject({ ok: true, value: { id: 'CR-0001', status: 'waiting', size: 'significant' } });
    expect(raised.ok && raised.value.impact).toEqual([{ document: 'docs/spec.md', decision: 'pending' }, { document: 'docs/plan.md', decision: 'pending' }]);
    expect(outOfDate(store)).toEqual({});

    expect(await approveChange(store, 'CR-0001', 'Ada')).toMatchObject({ ok: true, value: { status: 'approved' } });
    expect(readDocument(store, 'docs/intent.md')).toMatchObject({ ok: true, value: { header: { version: 2, status: 'approved', change: 'CR-0001' } } });
    expect(readDocument(store, 'docs/intent.md').ok && readFileSync(join(store.root, 'docs/intent.md'), 'utf8')).toContain('- REQ-004 Share with the accountant');
    const ctx = loadContext(store);
    expect(ctx.ok && ctx.value.state.changeRequest).toBeUndefined();
    expect(ctx.ok && sectionOf(ctx.value.state, 'Requirements', true).rows?.at(-1)?.id).toBe('REQ-004');
    expect(outOfDate(store)).toEqual({ spec: ['CR-0001'], plan: ['CR-0001'], handoff: ['CR-0001'] });
    expect(stageSummaries(store).plan.outOfDate).toEqual(['CR-0001']);
    expect(await approveChange(store, 'CR-0001', 'Ada')).toMatchObject({ error: 'wrong-status' });

    // Still valid for the spec; Later for the plan keeps it open; Update drafts a new plan version.
    await decideImpact(store, 'CR-0001', 'docs/spec.md', 'valid', silent);
    await decideImpact(store, 'CR-0001', 'docs/plan.md', 'later', silent);
    expect(outOfDate(store)).toEqual({ plan: ['CR-0001'], handoff: ['CR-0001'] });
    const updated = await decideImpact(store, 'CR-0001', 'docs/plan.md', 'updated', silent);
    expect(updated.ok).toBe(true);
    expect(readDocument(store, 'docs/plan.md')).toMatchObject({ ok: true, value: { header: { status: 'draft', version: 2, change: 'CR-0001' } } });
    const all = listChanges(store.root);
    expect(computeStatus(all[0] as never, all).label).toBe('Applied');
    expect(outOfDate(store)).toEqual({});
    expect(git(store.root, 'status', '--porcelain')).toBe('');
  });

  it('rejecting puts Explore back to the approved intent, and leaves intent.md as it was', async () => {
    const store = await approvedPlan();
    const before = readFileSync(join(store.root, 'docs/intent.md'), 'utf8');
    fillSections(store, { 'Desired outcome': 'Every expense recorded the same day.' });
    await saveChangeRequest(store);
    expect(await rejectChange(store, 'CR-0001')).toMatchObject({ ok: true, value: { status: 'rejected' } });
    expect(readFileSync(join(store.root, 'docs/intent.md'), 'utf8')).toBe(before);
    const ctx = loadContext(store);
    expect(ctx.ok && sectionOf(ctx.value.state, 'Desired outcome').value).toBe('Every expense recorded within a day.');
  });

  it('a minor change is applied once approved: nothing later is out of date', async () => {
    const store = await approvedPlan();
    fillSections(store, { 'Desired outcome': 'Every expense recorded within one day.' });
    const raised = await saveChangeRequest(store);
    expect(raised).toMatchObject({ ok: true, value: { size: 'minor', impact: [] } });
    await approveChange(store, 'CR-0001', 'Ada');
    const all = listChanges(store.root);
    expect(computeStatus(all[0] as never, all).label).toBe('Applied');
    expect(outOfDate(store)).toEqual({});
  });
});

describe('other requests and the change package', () => {
  it('raises, submits and sizes a request by hand from the Changes page, and writes its package once approved', async () => {
    const store = await approvedPlan();
    const made = await createChange(store, { title: 'Change REQ-003', reason: 'CSV is not enough.', requirements: ['REQ-003'], source: 'docs/intent.md', size: 'significant', impact: [{ document: 'docs/plan.md', decision: 'pending' }] });
    if (!made.ok) throw new Error(made.message);
    expect(await submitChange(store, made.value.id)).toMatchObject({ ok: true, value: { status: 'waiting' } });
    expect(await submitChange(store, made.value.id)).toMatchObject({ error: 'wrong-status' });
    expect(await setChangeSize(store, made.value.id, 'minor')).toMatchObject({ ok: true, value: { size: 'minor' } });
    await setChangeSize(store, made.value.id, 'significant');
    expect(await writePackage(store, made.value.id)).toMatchObject({ error: 'wrong-status' });
    // Not raised from Explore: approving does not touch intent.md.
    const before = readFileSync(join(store.root, 'docs/intent.md'), 'utf8');
    await approveChange(store, made.value.id, 'Ada');
    expect(readFileSync(join(store.root, 'docs/intent.md'), 'utf8')).toBe(before);
    const written = await writePackage(store, made.value.id);
    expect(written.ok && written.value[0]).toBe('changes/CR-0001/PROMPT.md');
    expect(readFileSync(join(store.root, 'changes/CR-0001/PROMPT.md'), 'utf8')).toContain('Implement change request CR-0001');
    expect(written.ok && written.value.some((p) => p.startsWith('changes/CR-0001/tasks/T'))).toBe(true);
    expect(readChange(store.root, 'CR-0001')?.hasPrompt).toBe(true);
    expect(git(store.root, 'log', '-1', '--format=%s')).toBe('Keel: Change package for CR-0001');
  });

  it('marks out of date for a significant request written by hand, by the documents it affects, and never for one without a size', async () => {
    const store = await approvedPlan();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(store.root, 'changes', 'CR-0007'), { recursive: true });
    writeFileSync(join(store.root, 'changes/CR-0007/CR-0007.md'), '---\nid: CR-0007\ntitle: By hand\nstatus: approved\nsize: significant\naffects: [SPC-0001@1]\n---\n');
    mkdirSync(join(store.root, 'changes', 'CR-0008'), { recursive: true });
    writeFileSync(join(store.root, 'changes/CR-0008/CR-0008.md'), '---\nid: CR-0008\ntitle: No size\nstatus: approved\naffects: [PLN-0001@1]\n---\n');
    expect(outOfDate(store)).toEqual({ spec: ['CR-0007'], handoff: ['CR-0007'] });
    expect(await decideImpact(store, 'CR-0007', 'docs/spec.md', 'valid', silent)).toMatchObject({ error: 'not-keel' });
    expect(existsSync(join(store.root, 'changes/CR-0007/PROMPT.md'))).toBe(false);
  });
});
