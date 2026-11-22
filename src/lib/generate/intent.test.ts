import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillSections } from '../brainstorm/fill';
import { EXPLORE_FILE, loadContext, sectionOf, startIdea, writeExplore } from '../brainstorm/session';
import { review } from '../gates/approvals';
import { readDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { affectedRequirements, changedSections, draftIntent, intentMarkdown, saveChangeRequest } from './intent';

const filled = {
  Problem: 'Receipts get lost and expenses are recorded late.',
  'Who it is for': 'Small teams.',
  'Desired outcome': 'Every expense recorded within a day.',
  Requirements: ['Record an expense', 'See expenses by month', 'Export to CSV'],
};

async function project(log?: string) {
  const store = tempStore();
  const made = await startIdea(store, { title: 'Expense tracker', idea: '', author: 'Ada', template: 'standard-intent@4', style: 'coach@1' });
  if (!made.ok) throw new Error(made.message);
  if (log) writeFileSync(log, '');
  return store;
}

const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

describe('intentMarkdown', () => {
  it('puts each section into the template exactly as written, leaving out unaccepted suggestions', async () => {
    const store = await project();
    fillSections(store, { ...filled, Scope: 'Web only.' });
    const ctx = loadContext(store);
    if (!ctx.ok) throw new Error(ctx.message);
    const state = structuredClone(ctx.value.state);
    Object.assign(state.sections.find((s) => s.key === 'Constraints') ?? {}, { value: 'A suggestion.', origin: 'suggested' });
    const body = intentMarkdown({ ...ctx.value, state }, 'Expense tracker');
    expect(body).toBe([
      '# Intent: Expense tracker', '',
      '## Problem', '', 'Receipts get lost and expenses are recorded late.', '',
      '## Who it is for', '', 'Small teams.', '',
      '## Desired outcome', '', 'Every expense recorded within a day.', '',
      '## Scope', '', 'Web only.', '',
      '## Requirements', '', '- Record an expense', '- See expenses by month', '- Export to CSV', '',
      '## Constraints', '', '_Not written yet._', '',
      '## Open questions', '', '_Not written yet._', '',
    ].join('\n'));
  });
});

describe('draftIntent', () => {
  it('needs every required section, gives the rows IDs, and commits intent.md with Explore', async () => {
    const store = await project();
    expect(await draftIntent(store)).toMatchObject({ error: 'not-ready' });
    fillSections(store, filled);
    const drafted = await draftIntent(store);
    expect(drafted).toMatchObject({ ok: true, value: { header: { id: 'INT-0001', version: 1, status: 'draft', template: 'standard-intent@4', brainstorm_style: 'coach@1' } } });
    expect(drafted.ok && drafted.value.body).toContain('## Requirements\n\n- REQ-001 Record an expense\n- REQ-002 See expenses by month\n- REQ-003 Export to CSV\n');
    const ctx = loadContext(store);
    expect(ctx.ok && sectionOf(ctx.value.state, 'Requirements', true).rows?.map((r) => r.id)).toEqual(['REQ-001', 'REQ-002', 'REQ-003']);
    expect(git(store.root, 'status', '--porcelain')).toBe('');
    expect(git(store.root, 'log', '-1', '--format=%s')).toBe('Keel: Brainstorm: drafted intent v1');
  });

  it('drafts a new version while it is a draft, keeps IDs, never reuses a removed one, and refuses once approved', async () => {
    const store = await project();
    fillSections(store, filled);
    await draftIntent(store);
    expect(await draftIntent(store)).toMatchObject({ ok: true, value: { header: { version: 1 } } });
    const ctx = loadContext(store);
    if (!ctx.ok) throw new Error(ctx.message);
    const state = structuredClone(ctx.value.state);
    const reqs = state.sections.find((s) => s.key === 'Requirements');
    if (reqs?.rows) reqs.rows = [reqs.rows[0], reqs.rows[2]].flatMap((r) => (r ? [r] : [])).concat([{ text: 'Share with the accountant', origin: 'user' }]);
    writeExplore(store, state);
    const again = await draftIntent(store);
    expect(again.ok && again.value.header.version).toBe(2);
    expect(again.ok && again.value.body).toContain('- REQ-001 Record an expense\n- REQ-003 Export to CSV\n- REQ-004 Share with the accountant');
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    expect(await draftIntent(store)).toMatchObject({ error: 'intent-locked' });
  });
});

describe('saveChangeRequest', () => {
  it('saves edits after approval as a draft change request, and leaves the approved intent unchanged', async () => {
    const store = await project();
    fillSections(store, filled);
    await draftIntent(store);
    expect(await saveChangeRequest(store)).toMatchObject({ error: 'not-approved' });
    await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
    const before = readFileSync(join(store.root, 'docs/intent.md'), 'utf8');
    expect(await saveChangeRequest(store)).toMatchObject({ error: 'no-change' });
    fillSections(store, { 'Desired outcome': 'Every expense recorded the same day.' });
    const saved = await saveChangeRequest(store);
    expect(saved).toMatchObject({ ok: true, value: { kind: 'change', path: 'docs/changes/0001-intent-change.md', header: { id: 'CR-0001', status: 'draft', document: 'INT-0001@1' } } });
    expect(saved.ok && saved.value.body).toContain('### Desired outcome\n\nBefore:\n\n> Every expense recorded within a day.\n\nAfter:\n\n> Every expense recorded the same day.');
    expect(readFileSync(join(store.root, 'docs/intent.md'), 'utf8')).toBe(before);
    expect(readDocument(store, 'docs/intent.md')).toMatchObject({ ok: true, value: { header: { status: 'approved', version: 1 } } });
    // Saving again updates the same change request.
    fillSections(store, { Requirements: ['Record an expense quickly', 'See expenses by month', 'Export to CSV'] });
    const ctx = loadContext(store);
    if (!ctx.ok) throw new Error(ctx.message);
    const again = await saveChangeRequest(store);
    expect(again).toMatchObject({ ok: true, value: { path: 'docs/changes/0001-intent-change.md', header: { version: 2, requirements: ['REQ-001'] } } });
    expect(existsSync(join(store.root, 'docs/changes/0002-intent-change.md'))).toBe(false);
    expect(git(store.root, 'status', '--porcelain', '--', EXPLORE_FILE)).toBe('');
  });

  it('names the requirements a change touches', () => {
    expect(affectedRequirements([{ section: 'Requirements', before: '- REQ-001 A\n- REQ-002 B', after: '- REQ-001 A2\n- New row' }])).toEqual(['REQ-001', 'REQ-002']);
    expect(affectedRequirements([{ section: 'Scope', before: 'Covers REQ-004.', after: 'Covers REQ-004 and REQ-006.' }])).toEqual(['REQ-004', 'REQ-006']);
    expect(changedSections({ state: { title: 't', idea: '', template: 't@1', style: 's@1', sections: [], drafted: {} }, sections: [] })).toEqual([]);
  });
});
