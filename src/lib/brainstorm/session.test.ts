import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { readProject } from '../store/workspace';
import { fillSections } from './fill';
import {
  applyAction, applyEdits, changeSetup, counts, EXPLORE_FILE, exploreFromIntent, fingerprint, LEGACY_FILE, loadContext,
  needsReview, readExplore, requiredFilled, sectionOf, sectionText, startIdea, templateLabel, writeExplore, type Context,
} from './session';

const idea = { title: 'Expense tracker', idea: 'Track team expenses.', author: 'Ada', template: 'standard-intent@4', style: 'challenger@1' };

async function started() {
  const store = tempStore();
  const made = await startIdea(store, idea);
  if (!made.ok) throw new Error(made.message);
  return store;
}

function context(store: ReturnType<typeof tempStore>): Context {
  const loaded = loadContext(store);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.value;
}

describe('startIdea', () => {
  it('initialises the folder with every section of Standard intent v4 empty, in one commit', async () => {
    const store = await started();
    const ctx = context(store);
    expect(ctx.sections.map((s) => [s.heading, s.required, s.list])).toEqual([
      ['Problem', true, false], ['Who it is for', true, false], ['Desired outcome', true, false], ['Scope', false, false],
      ['Requirements', true, true], ['Constraints', false, false], ['Open questions', false, false],
    ]);
    expect(sectionOf(ctx.state, 'Requirements', true).rows).toEqual([]);
    expect(execFileSync('git', ['log', '--format=%s', '--', EXPLORE_FILE], { cwd: store.root, encoding: 'utf8' }).trim()).toBe('Keel: Initialise project');
    expect(readProject(store.root)).toMatchObject({ ok: true, value: { templates: { intent: 'standard-intent@4' }, style: 'challenger@1' } });
    expect(await startIdea(store, idea)).toMatchObject({ error: 'invalid-input' });
    expect(await startIdea(tempStore(), { ...idea, template: 'roadmap@1' })).toMatchObject({ error: 'unknown-template' });
    expect(templateLabel('standard-intent@4')).toBe('Standard intent v4');
  });
});

describe('edits and the gate', () => {
  it('counts only text the user wrote or accepted, and needs every required section with a requirement row', async () => {
    const store = await started();
    expect(requiredFilled(context(store))).toBe(false);
    fillSections(store, { Problem: 'Receipts get lost.', 'Who it is for': 'Small teams.', 'Desired outcome': 'Every expense recorded.' });
    expect(requiredFilled(context(store))).toBe(false);
    fillSections(store, { Requirements: ['Record an expense'] });
    expect(requiredFilled(context(store))).toBe(true);
    const state = context(store).state;
    expect(counts({ key: 'x', value: 'Suggested', origin: 'suggested', thread: [] })).toBe(false);
    expect(counts({ key: 'x', value: '', rows: [{ text: 'a', origin: 'suggested' }], origin: 'user', thread: [] })).toBe(false);
    expect(sectionText(sectionOf(state, 'Requirements', true))).toBe('- Record an expense');
    // Saved on every change, but not committed: that happens at Draft intent.md.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: store.root, encoding: 'utf8' }).trim()).toBe(`M ${EXPLORE_FILE}`);
  });

  it('marks changed sections for review with a fingerprint', async () => {
    const store = await started();
    const ctx = context(store);
    expect(needsReview(ctx)).toBe(true);
    const reviewed = { ...ctx, state: { ...ctx.state, sections: ctx.state.sections.map((s) => ({ ...s, reviewedHash: fingerprint(s) })) } };
    expect(needsReview(reviewed)).toBe(false);
    const edited = applyEdits(reviewed, [{ key: 'Problem', value: 'Changed.' }]);
    expect(edited.ok && needsReview({ ...reviewed, state: edited.value })).toBe(true);
    expect(applyEdits(ctx, [{ key: 'Nope', value: 'x' }])).toMatchObject({ error: 'unknown-section' });
  });
});

describe('suggestions, rewrites and comments', () => {
  function withSuggestion(store: ReturnType<typeof tempStore>): Context {
    const ctx = context(store);
    const state = structuredClone(ctx.state);
    Object.assign(state.sections.find((s) => s.key === 'Desired outcome') ?? {}, { value: 'Expenses recorded within a day.', origin: 'suggested', comment: { kind: 'suggest', text: 'Try this.' } });
    Object.assign(state.sections.find((s) => s.key === 'Requirements') ?? {}, {
      rows: [{ text: 'Record an expense', origin: 'suggested' }, { text: 'Export to CSV', origin: 'suggested' }],
      comment: { kind: 'ok', text: 'Fine.', addRow: 'Keep a history' },
    });
    Object.assign(state.sections.find((s) => s.key === 'Problem') ?? {}, { value: 'Receipts get lost.', origin: 'user', comment: { kind: 'challenge', text: 'How often?', rewrite: 'Receipts get lost every week.' } });
    writeExplore(store, state);
    return context(store);
  }

  it('accepts or clears a suggestion; a cleared section stays cleared', async () => {
    const store = await started();
    const ctx = withSuggestion(store);
    const accepted = applyAction(ctx, { op: 'accept', key: 'Desired outcome' });
    expect(accepted.ok && sectionOf(accepted.value, 'Desired outcome')).toMatchObject({ origin: 'accepted', value: 'Expenses recorded within a day.' });
    const cleared = applyAction(ctx, { op: 'clear', key: 'Desired outcome' });
    expect(cleared.ok && sectionOf(cleared.value, 'Desired outcome')).toMatchObject({ origin: 'user', value: '', cleared: true });
    const oneRow = applyAction(ctx, { op: 'accept', key: 'Requirements', row: 1 });
    expect(oneRow.ok && sectionOf(oneRow.value, 'Requirements', true).rows?.map((r) => r.origin)).toEqual(['suggested', 'accepted']);
    const allRows = applyAction(ctx, { op: 'clear', key: 'Requirements' });
    expect(allRows.ok && sectionOf(allRows.value, 'Requirements', true)).toMatchObject({ rows: [], cleared: true });
    // Typing the suggestion's own words makes them the user's.
    const typed = applyEdits(ctx, [{ key: 'Desired outcome', value: 'Expenses recorded within a day.' }]);
    expect(typed.ok && sectionOf(typed.value, 'Desired outcome').origin).toBe('user');
    // Emptying a suggestion by hand counts as Clear.
    const emptied = applyEdits(ctx, [{ key: 'Desired outcome', value: '' }]);
    expect(emptied.ok && sectionOf(emptied.value, 'Desired outcome').cleared).toBe(true);
  });

  it('applies a rewrite only when the user asks, dismisses comments and adds an offered row', async () => {
    const store = await started();
    const ctx = withSuggestion(store);
    expect(sectionOf(ctx.state, 'Problem').value).toBe('Receipts get lost.');
    const applied = applyAction(ctx, { op: 'apply', key: 'Problem' });
    expect(applied.ok && sectionOf(applied.value, 'Problem')).toMatchObject({ value: 'Receipts get lost every week.', origin: 'accepted', comment: { applied: true } });
    const dismissed = applyAction(ctx, { op: 'dismiss', key: 'Problem' });
    expect(dismissed.ok && sectionOf(dismissed.value, 'Problem')).toMatchObject({ value: 'Receipts get lost.', comment: { dismissed: true } });
    const added = applyAction(ctx, { op: 'add-row', key: 'Requirements' });
    expect(added.ok && sectionOf(added.value, 'Requirements', true).rows?.at(-1)).toEqual({ text: 'Keep a history', origin: 'accepted' });
    expect(applyAction(ctx, { op: 'apply', key: 'Scope' })).toMatchObject({ error: 'no-change' });
  });

  it('keeps row IDs when rows are edited and moved, and an edited suggestion becomes the user\'s', async () => {
    const store = await started();
    const state = structuredClone(context(store).state);
    Object.assign(state.sections.find((s) => s.key === 'Requirements') ?? {}, { rows: [{ id: 'REQ-001', text: 'A', origin: 'user' }, { text: 'B', origin: 'suggested' }] });
    writeExplore(store, state);
    const edited = applyEdits(context(store), [{ key: 'Requirements', rows: [{ text: 'B2', origin: 'suggested' }, { id: 'REQ-001', text: 'A' }] }]);
    expect(edited.ok && sectionOf(edited.value, 'Requirements', true).rows).toEqual([{ text: 'B2', origin: 'user' }, { id: 'REQ-001', text: 'A', origin: 'user' }]);
  });
});

describe('older brainstorms and adopted intents', () => {
  it('converts CR-0004\'s explore.md once: its answers become the user\'s text', () => {
    const store = tempStore();
    mkdirSync(join(store.root, '.keel', 'brainstorm'), { recursive: true });
    writeFileSync(join(store.root, LEGACY_FILE), '---\ntitle: Old\nidea: An idea\ntemplate: standard-intent@3\nbrainstorm_style: coach@1\nanswers:\n  Problem: [Lost receipts]\n  Requirements: ["- Record an expense\\n- Export"]\ncurrent: null\ntranscript: []\n---\n');
    const state = readExplore(store);
    expect(state).toMatchObject({ ok: true, value: { title: 'Old', template: 'standard-intent@3', style: 'coach@1' } });
    expect(state.ok && sectionOf(state.value, 'Problem')).toMatchObject({ value: 'Lost receipts', origin: 'user' });
    expect(state.ok && sectionOf(state.value, 'Requirements', true).rows).toEqual([{ text: 'Record an expense', origin: 'user' }, { text: 'Export', origin: 'user' }]);
    expect(existsSync(join(store.root, EXPLORE_FILE))).toBe(true);
    expect(readExplore(tempStore())).toMatchObject({ error: 'not-found' });
  });

  it('makes the sections from an adopted intent, with the IDs it already has', () => {
    const template = readFileSync(join(process.cwd(), 'seed', 'templates', 'intent-standard-v4.md'), 'utf8');
    const state = exploreFromIntent({
      title: 'T', idea: '', template: 'standard-intent@4', style: 'coach@1', templateContent: template,
      intentBody: '# Intent: T\n\n## Problem\n\nLost receipts.\n\n## Scope\n\n_Not written yet._\n\n## Requirements\n\n- REQ-004 Record an expense\n- REQ-007 Export\n',
    });
    expect(sectionOf(state, 'Problem').value).toBe('Lost receipts.');
    expect(sectionOf(state, 'Scope').value).toBe('');
    expect(sectionOf(state, 'Requirements', true).rows).toEqual([{ id: 'REQ-004', text: 'Record an expense', origin: 'user' }, { id: 'REQ-007', text: 'Export', origin: 'user' }]);
    expect(state.drafted?.Requirements).toBe('- REQ-004 Record an expense\n- REQ-007 Export');
  });
});

describe('changeSetup', () => {
  it('changes template and style, keeping text by heading', async () => {
    const store = await started();
    fillSections(store, { Problem: 'Lost receipts.' });
    const changed = await changeSetup(store, { template: 'lightweight-intent@1', style: 'coach@1' });
    expect(changed).toMatchObject({ ok: true, value: { template: 'lightweight-intent@1', style: 'coach@1' } });
    expect(context(store).sections.map((s) => s.heading)).toEqual(['Problem', 'Outcome', 'Requirements']);
    expect(sectionOf(context(store).state, 'Problem').value).toBe('Lost receipts.');
    expect(readProject(store.root)).toMatchObject({ ok: true, value: { templates: { intent: 'lightweight-intent@1' }, style: 'coach@1' } });
    expect(await changeSetup(store, { template: 'nope@1', style: 'coach@1' })).toMatchObject({ error: 'unknown-template' });
  });
});
