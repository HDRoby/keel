import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillSections } from '../brainstorm/fill';
import { startIdea } from '../brainstorm/session';
import { draftIntent } from '../generate/intent';
import { ensureSeed } from '../seed';
import { createDocument, readDocument } from '../store/documents';
import { fileHistory } from '../store/git';
import { tempStore } from '../store/test-store';
import { approvalsOf, decisionsOf, projectState, recordDecision, review, stageSummaries } from './approvals';

type TestStore = ReturnType<typeof tempStore>;

async function withDraftIntent(): Promise<{ store: TestStore }> {
  const store = tempStore();
  ensureSeed(store.root, join(process.cwd(), 'seed'));
  const started = await startIdea(store, { title: 'Gated', idea: '', author: 'Ada', template: 'lightweight-intent@1', style: 'coach@1' });
  if (!started.ok) throw new Error(started.message);
  const filled = fillSections(store, { Problem: 'Answer 0', Outcome: 'Answer 1', Requirements: ['Answer 2'] });
  if (!filled.ok || !(await draftIntent(store)).ok) throw new Error('draft failed');
  return { store };
}

describe('projectState', () => {
  it('reads the brainstorm, document statuses and decisions', async () => {
    const { store } = await withDraftIntent();
    expect(projectState(store)).toEqual({ requiredCaptured: true, intent: 'draft', spec: undefined, plan: undefined, decisions: [], uncovered: [], undecided: [], mock: { gate: 'recommended', ui: false, status: 'missing' } });
  });
});

describe('stageSummaries', () => {
  it('describes each stage for the stage bar', async () => {
    const { store } = await withDraftIntent();
    expect(stageSummaries(store)).toEqual({
      explore: { detail: 'Brainstorm · all required sections', done: true },
      intent: { detail: 'intent.md v1 · Draft', done: false },
      spec: { detail: 'No spec.md yet · no decision', done: false },
      plan: { detail: 'No plan.md yet', done: false },
      handoff: { detail: 'Ready to hand off', done: false },
    });
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    expect(stageSummaries(store).intent).toEqual({ detail: 'intent.md v1 · Approved', done: true });
  });
});

describe('review', () => {
  it('approves the intent in place (v1 stays v1) and records who, when and why', async () => {
    const { store } = await withDraftIntent();
    store.now = () => new Date('2026-11-21T10:00:00Z');
    const approved = await review(store, 'intent', { action: 'approve', by: 'Ada', comment: 'Clear.' });
    expect(approved).toMatchObject({ ok: true, value: { header: { status: 'approved', version: 1 } } });
    expect(approved.ok && approvalsOf(approved.value)).toEqual([{ action: 'approve', by: 'Ada', date: '2026-11-21', comment: 'Clear.', version: 1 }]);
    expect((await fileHistory(store.root, 'docs/intent.md')).at(-1)?.message).toBe('Keel: INT-0001 v1: Approved by Ada: Clear.');
    expect(projectState(store).intent).toBe('approved');
  });

  it('refuses any review of an approved document', async () => {
    const { store } = await withDraftIntent();
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    for (const action of ['request-changes', 'reject', 'approve'] as const) {
      expect(await review(store, 'intent', { action, by: 'Ada', comment: '' })).toMatchObject({
        error: 'not-reviewable', message: 'INT-0001 is approved; changes to it go through a change request',
      });
    }
  });

  it('sends back for changes, closes on reject, and refuses a closed document', async () => {
    const { store } = await withDraftIntent();
    expect(await review(store, 'intent', { action: 'request-changes', by: 'Ada', comment: 'More detail.' })).toMatchObject({ value: { header: { status: 'draft' } } });
    expect(await review(store, 'intent', { action: 'reject', by: 'Ada', comment: '' })).toMatchObject({ value: { header: { status: 'closed' } } });
    expect(await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' })).toMatchObject({ error: 'not-reviewable' });
    const intent = readDocument(store, 'docs/intent.md');
    expect(intent.ok && approvalsOf(intent.value).map((a) => a.action)).toEqual(['request-changes', 'reject']);
  });

  it('refuses a review on a locked stage, a missing document or without a name', async () => {
    const { store } = await withDraftIntent();
    expect(await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' })).toMatchObject({ error: 'locked', message: 'Needs a Go decision' });
    expect(await review(store, 'intent', { action: 'approve', by: ' ', comment: '' })).toMatchObject({ error: 'invalid-input' });
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    expect(await review(store, 'spec', { action: 'approve', by: 'Ada', comment: '' })).toMatchObject({ error: 'not-found' });
  });
});

describe('decisions', () => {
  it('saves a Go decision as docs/decisions/NNNN-go.md, which opens the Plan stage', async () => {
    const { store } = await withDraftIntent();
    expect(await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Worth it.', consequences: '' })).toMatchObject({ error: 'locked' });
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    const go = await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Worth it.', consequences: 'Ship v1.' });
    expect(go).toMatchObject({ ok: true, value: { path: 'docs/decisions/0001-go.md', header: { id: 'ADR-0001', status: 'approved', decision: 'go' } } });
    const text = readFileSync(join(store.root, 'docs/decisions/0001-go.md'), 'utf8');
    expect(text).toContain('# Go decision');
    expect(text).toContain('## Reason\n\nWorth it.');
    expect(text).toContain('## Consequences\n\nShip v1.');
    await recordDecision(store, { decision: 'park', by: 'Ada', reason: 'Wait.', consequences: '' });
    expect(decisionsOf(store.root)).toEqual(['go', 'park']);
    expect(await recordDecision(store, { decision: 'go', by: '', reason: 'x', consequences: '' })).toMatchObject({ error: 'invalid-input' });
  });

  it('ignores decision files without a decision field', async () => {
    const store = tempStore();
    const { initialiseProject } = await import('../store/workspace');
    await initialiseProject(store, { title: 'P', author: 'Ada' });
    await createDocument(store, { kind: 'decision', title: 'Use git', body: '# Use git\n', template: 'decision-record@1' });
    expect(decisionsOf(store.root)).toEqual([]);
  });
});
