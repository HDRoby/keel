import { describe, expect, it } from 'vitest';
import { createFakeProvider } from '../providers/fake';
import type { ChatProvider } from '../providers/types';
import { tempStore } from '../store/test-store';
import { fillSections } from './fill';
import { applyAnswer, parseAnswer, progress, REVIEW_MARKER, reviewAll, reviewMessages } from './review';
import { applyEdits, loadContext, needsReview, sectionOf, startIdea, writeExplore, type Context } from './session';

const fake = createFakeProvider('anthropic', {});

async function started(values: Record<string, string | string[]> = {}) {
  const store = tempStore();
  const made = await startIdea(store, { title: 'Expense tracker', idea: '', author: 'Ada', template: 'standard-intent@4', style: 'challenger@1' });
  if (!made.ok) throw new Error(made.message);
  if (Object.keys(values).length) fillSections(store, values);
  return store;
}

function context(store: ReturnType<typeof tempStore>): Context {
  const loaded = loadContext(store);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.value;
}

async function review(store: ReturnType<typeof tempStore>, reply?: { key: string; text: string }) {
  const ctx = context(store);
  const result = await reviewAll(ctx, fake, { model: 'm', now: '2026-11-22T10:00:00.000Z' }, reply);
  if (!result.ok) return result;
  const state = applyAnswer(context(store), result.value.answer, result.value.now, reply, result.value.reviewed);
  writeExplore(store, state);
  return { ok: true as const, value: state };
}

describe('reviewMessages and parseAnswer', () => {
  it('sends every section with who wrote it, the style and the rules, and asks for JSON', async () => {
    const store = await started({ Problem: 'Lost receipts.' });
    const [system, user] = reviewMessages(context(store));
    expect(system?.content).toContain(REVIEW_MARKER);
    expect(system?.content).toContain('Never change the user\'s text');
    expect(system?.content).toContain(context(store).style.instructions.slice(0, 40));
    const sent = JSON.parse(user?.content ?? '{}') as { sections: { section: string; text?: string; by?: string }[] };
    expect(sent.sections.map((s) => s.section)).toEqual(['Problem', 'Who it is for', 'Desired outcome', 'Scope', 'Requirements', 'Constraints', 'Open questions']);
    expect(sent.sections[0]).toMatchObject({ text: 'Lost receipts.', by: 'user', required: true });
  });

  it('reads the first JSON object and refuses anything else', () => {
    expect(parseAnswer('Here you go: {"comments": {"Problem": {"kind": "ok", "text": "Fine."}}} thanks')).toMatchObject({ ok: true, value: { comments: { Problem: { kind: 'ok' } }, suggestions: {} } });
    expect(parseAnswer('no json')).toMatchObject({ error: 'invalid-answer' });
    expect(parseAnswer('{"comments": {"Problem": {"kind": "rant", "text": "x"}}}')).toMatchObject({ error: 'invalid-answer', message: 'The assistant\'s review had no usable comment' });
  });

  it('puts right what small local models get loose, and keeps the rest of the review', () => {
    // As gemma4 answered: "ok" comments with null or empty text, next to a real challenge.
    expect(parseAnswer('{"comments": {"Problem": {"kind": "ok", "text": null}, "Constraints": {"kind": "ok", "text": ""}, "Scope": {"kind": "challenge", "text": "Too wide.", "linkTo": null}}}')).toMatchObject({
      ok: true, value: { comments: { Problem: { kind: 'ok', text: 'Looks good.' }, Constraints: { kind: 'ok', text: 'Looks good.' }, Scope: { kind: 'challenge', text: 'Too wide.' } } },
    });
    // As mistral:7b answered: no text at all for "ok", extra fields, a suggestion list.
    const mistral = parseAnswer('{"comments": {"Problem": {"kind": "ok"}, "Requirements": {"kind": "suggest", "rows": ["x"]}, "Desired outcome": {"kind": "Challenge", "text": "Measurable?"}}, "suggestions": {"Desired outcome": ["Cut the time to plan in half"], "Scope": null}}');
    expect(mistral).toMatchObject({ ok: true, value: { comments: { Problem: { kind: 'ok' }, 'Desired outcome': { kind: 'challenge' } }, suggestions: { 'Desired outcome': ['Cut the time to plan in half'] } } });
    expect(mistral.ok && Object.keys(mistral.value.comments)).not.toContain('Requirements');   // a suggest with nothing to say is dropped
    // As qwen2.5vl:7b answered a reply: the "field"?: notation copied from a format description.
    expect(parseAnswer('{"comments": {"Problem": {"kind": "ok", "text": "Fine."}},\n "reply"?: {"text": "Done."}}')).toMatchObject({ ok: true, value: { reply: { text: 'Done.' } } });
    // Other spellings, comments as a list, and a reasoning model's <think> block.
    expect(parseAnswer('<think>{maybe}</think>{"comments": [{"section": "Scope", "kind": "question", "text": "Who?"}, {"section": "Problem", "kind": "suggestion", "text": "Add numbers."}]}')).toMatchObject({
      ok: true, value: { comments: { Scope: { kind: 'ask' }, Problem: { kind: 'suggest' } } },
    });
  });
});

describe('reviewAll', () => {
  it('comments on every section, links sections that conflict, and never changes the user\'s text', async () => {
    const store = await started({ Problem: 'Lost receipts.', 'Who it is for': 'Engineers, later product managers.', Constraints: 'Single user first.' });
    const reviewed = await review(store);
    expect(reviewed.ok).toBe(true);
    const state = context(store).state;
    expect(state.sections.every((s) => s.comment)).toBe(true);
    expect(sectionOf(state, 'Problem')).toMatchObject({ value: 'Lost receipts.', origin: 'user', comment: { kind: 'challenge', rewrite: 'Lost receipts. It happens every week and costs the team hours.' } });
    expect(sectionOf(state, 'Constraints')).toMatchObject({ value: 'Single user first.', comment: { kind: 'link', linkTo: 'Who it is for' } });
    expect(sectionOf(state, 'Constraints').comment?.rewrite).toContain('A web UI');
  });

  it('fills an empty section only as a suggestion, which does not count, and never refills a cleared one', async () => {
    const store = await started({ Problem: 'Lost receipts.', 'Who it is for': 'Small teams.', Requirements: ['Record an expense'] });
    await review(store);
    const outcome = sectionOf(context(store).state, 'Desired outcome');
    expect(outcome).toMatchObject({ value: 'Every expense is recorded within a day of spending it.', origin: 'suggested' });
    expect(progress(context(store))).toEqual({ filled: 3, required: 4 });
    const cleared = applyEdits(context(store), [{ key: 'Desired outcome', value: '' }]);
    if (!cleared.ok) throw new Error(cleared.message);
    writeExplore(store, cleared.value);
    await review(store);
    expect(sectionOf(context(store).state, 'Desired outcome')).toMatchObject({ value: '', cleared: true });
  });

  it('proposes requirement rows from the outcome as suggestions', async () => {
    const store = await started({ 'Desired outcome': 'Every expense recorded within a day.' });
    await review(store);
    expect(sectionOf(context(store).state, 'Requirements', true).rows?.map((r) => r.origin)).toEqual(['suggested', 'suggested', 'suggested']);
  });

  it('skips an unchanged list, and keeps edits made while a review ran for the next one', async () => {
    const store = await started({ Problem: 'Lost receipts.' });
    await review(store);
    expect(needsReview(context(store))).toBe(false);
    expect(await reviewAll(context(store), fake, { model: 'm' })).toMatchObject({ error: 'no-change' });
    // A review starts, the user edits Problem, then the answer comes back.
    fillSections(store, { 'Who it is for': 'Small teams.' });
    const started2 = context(store);
    const running = await reviewAll(started2, fake, { model: 'm' });
    if (!running.ok) throw new Error(running.message);
    fillSections(store, { Problem: 'Receipts get lost every week.' });
    const state = applyAnswer(context(store), running.value.answer, running.value.now, undefined, running.value.reviewed);
    expect(sectionOf(state, 'Problem').value).toBe('Receipts get lost every week.');
    expect(needsReview({ ...context(store), state })).toBe(true);
  });

  it('answers a reply in that section\'s thread and comments on every section again', async () => {
    const store = await started({ Problem: 'Lost receipts.' });
    await review(store);
    const replied = await review(store, { key: 'Open questions', text: 'What about mobile?' });
    expect(replied.ok).toBe(true);
    expect(sectionOf(context(store).state, 'Open questions').thread).toEqual([
      { from: 'user', text: 'What about mobile?' },
      { from: 'assistant', text: 'Reply from Anthropic: I read "What about mobile?".' },
    ]);
    expect(await reviewAll(context(store), fake, { model: 'm' }, { key: 'Nope', text: 'x' })).toMatchObject({ error: 'unknown-section' });
  });

  it('reports a failing or cancelled model call and logs token use without content', async () => {
    const store = await started({ Problem: 'Lost receipts.' });
    const broken: ChatProvider = { id: 'fake', async *stream() { yield ''; throw new Error('HTTP 500\nsecret detail'); } };
    expect(await reviewAll(context(store), broken, { model: 'm', describeError: () => 'The model is unavailable' })).toMatchObject({ error: 'model-failed', message: 'The model is unavailable' });
    const controller = new AbortController();
    controller.abort();
    expect(await reviewAll(context(store), fake, { model: 'm', signal: controller.signal })).toMatchObject({ error: 'aborted' });
    const lines: string[] = [];
    await reviewAll(context(store), fake, { model: 'm', log: (l) => lines.push(l) });
    expect(lines[0]).toMatch(/^Explore review: about \d+ tokens in, \d+ out \(m\)$/);
    expect(lines.join()).not.toContain('Lost receipts');
  });
});
