import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureSeed } from '../seed';
import { saveDocument } from '../store/documents';
import { fileHistory } from '../store/git';
import { tempStore } from '../store/test-store';
import { projectDir } from '../store/workspace';
import {
  changeSetup, draftIntent, fallbackQuestion, loadContext, pendingQuestion, questionPrompt, readSession,
  recordAnswer, recordQuestion, slugFor, startIdea, templateLabel, type Context,
  brainstormCommitMessage, intentBody, intentUpdate, updateIntent, addToSection,
} from './session';

const SEED = join(process.cwd(), 'seed');
const idea = { title: 'Readme helper', idea: 'Help newcomers.', author: 'Ada', template: 'standard-intent@3', style: 'challenger@1' };

async function started() {
  const store = tempStore();
  ensureSeed(store.home, SEED);
  const session = await startIdea(store, idea);
  if (!session.ok) throw new Error(session.message);
  return { store, slug: session.value.slug };
}

function context(store: ReturnType<typeof tempStore>, slug: string): Context {
  const loaded = loadContext(store, slug);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.value;
}

async function turn(store: ReturnType<typeof tempStore>, slug: string, answer: string) {
  const ctx = context(store, slug);
  await recordQuestion(store, ctx.session, 'Q?');
  const answered = await recordAnswer(store, context(store, slug), answer);
  if (!answered.ok) throw new Error(answered.message);
  return answered.value;
}

describe('requirement IDs', () => {
  it('numbers requirement statements once, keeps them on later drafts and never reuses an ID', async () => {
    const { store, slug } = await started();
    await turn(store, slug, 'Problem.');
    await turn(store, slug, 'Probe.');
    await turn(store, slug, 'Outcome.');
    await turn(store, slug, 'Probe.');
    await turn(store, slug, '- Generate a README\n- Detect the language');
    await turn(store, slug, 'Checked with two teams.');
    await turn(store, slug, 'Contributors.');
    const drafted = await draftIntent(store, context(store, slug));
    if (!drafted.ok) throw new Error(drafted.message);
    expect(drafted.value.body).toContain('## Requirements\n\n- REQ-001 Generate a README\n- REQ-002 Detect the language\n\nChecked with two teams.');
    expect(readFileSync(join(projectDir(slug, store.home), 'project.md'), 'utf8')).toContain('next_req: 3');
    expect(context(store, slug).session.req_ids).toEqual({ 'Generate a README': 'REQ-001', 'Detect the language': 'REQ-002' });
  });
});

describe('slugFor', () => {
  it('makes a free, safe slug from a title', () => {
    expect(slugFor('Readme Helper!', [])).toBe('readme-helper');
    expect(slugFor('Readme helper', ['readme-helper', 'readme-helper-2'])).toBe('readme-helper-3');
    expect(slugFor('***', [])).toBe('idea');
  });
});

describe('brainstormCommitMessage', () => {
  it('names the captured sections', () => {
    const base = { slug: 's', title: 't', idea: '', template: 't@1', brainstorm_style: 's@1', current: null, transcript: [], req_ids: {}, in_intent: {} };
    expect(brainstormCommitMessage({ ...base, answers: {} })).toBe('Brainstorm: start');
    expect(brainstormCommitMessage({ ...base, answers: { Problem: ['x'], Outcome: [' '] } })).toBe('Brainstorm: captured Problem');
  });
});

describe('brainstorm session', () => {
  it('starts with the first required section pending and records template and style', async () => {
    const { store, slug } = await started();
    const session = readSession(store, slug);
    expect(session).toMatchObject({ ok: true, value: { template: 'standard-intent@3', brainstorm_style: 'challenger@1', current: { section: 'Problem', step: 'ask' } } });
    expect(session.ok && pendingQuestion(session.value)).toEqual({ section: 'Problem', step: 'ask' });
    expect(readFileSync(join(projectDir(slug, store.home), 'brainstorm.md'), 'utf8')).toContain('# Brainstorm: Readme helper');
  });

  it('refuses unknown templates, styles and missing names', async () => {
    const store = tempStore();
    ensureSeed(store.home, SEED);
    expect(await startIdea(store, { ...idea, template: 'roadmap@1' })).toMatchObject({ error: 'unknown-template' });
    expect(await startIdea(store, { ...idea, style: 'nope@1' })).toMatchObject({ error: 'unknown-style' });
    expect(await startIdea(store, { ...idea, author: ' ' })).toMatchObject({ error: 'invalid-input' });
    expect(await startIdea(store, { ...idea, standards: ['made-up@1'] })).toMatchObject({ error: 'invalid-input', message: 'Unknown standard made-up@1' });
    const withStandards = await startIdea(store, { ...idea, standards: ['bdd-style@1'] });
    expect(withStandards.ok && readFileSync(join(projectDir(withStandards.value.slug, store.home), 'project.md'), 'utf8')).toContain('- bdd-style@1');
  });

  it('asks, probes, then moves on; answers only an asked question', async () => {
    const { store, slug } = await started();
    expect(await recordAnswer(store, context(store, slug), 'too early')).toMatchObject({ error: 'no-question' });
    expect((await turn(store, slug, 'Newcomers are lost.')).current).toEqual({ section: 'Problem', step: 'probe' });
    const after = await turn(store, slug, 'Seen in five sessions.');
    expect(after.current).toEqual({ section: 'Desired outcome', step: 'ask' });
    expect(after.answers.Problem).toEqual(['Newcomers are lost.', 'Seen in five sessions.']);
    expect(after.transcript.map((e) => e.role)).toEqual(['assistant', 'user', 'assistant', 'user']);
    const log = (await fileHistory(projectDir(slug, store.home), 'brainstorm.md')).map((c) => c.message);
    expect(log).toEqual(['Brainstorm: captured Problem']);
  });

  it('builds the model prompt from the style, the section and the conversation', async () => {
    const { store, slug } = await started();
    const ctx = context(store, slug);
    const prompt = questionPrompt(ctx, { section: 'Problem', step: 'ask' });
    expect(prompt[0]).toMatchObject({ role: 'system', content: expect.stringContaining('# Challenger') });
    expect(prompt[1]?.content).toContain('fill the section "Problem"');
    expect(prompt[2]).toEqual({ role: 'user', content: 'My idea: Readme helper. Help newcomers.' });
    expect(questionPrompt(ctx, { section: 'Problem', step: 'probe' })[1]?.content).toContain('follow-up');
    expect(fallbackQuestion(ctx, { section: 'Problem', step: 'ask' })).toMatch(/^Problem: What the user cannot do today/);
    expect(templateLabel('standard-intent@3')).toBe('Standard intent v3');
  });

  it('drafts intent.md only when every required section is captured, once', async () => {
    const { store, slug } = await started();
    expect(await draftIntent(store, context(store, slug))).toMatchObject({ error: 'not-ready' });
    for (let i = 0; i < 8; i += 1) await turn(store, slug, `Answer ${i}.`);
    const drafted = await draftIntent(store, context(store, slug));
    expect(drafted).toMatchObject({ ok: true, value: { header: { template: 'standard-intent@3', brainstorm_style: 'challenger@1', status: 'draft' } } });
    expect(drafted.ok && drafted.value.body).toContain('## Problem\n\nAnswer 0.\n\nAnswer 1.');
    expect(drafted.ok && drafted.value.body).toContain('# Intent: Readme helper');
    expect(await draftIntent(store, context(store, slug))).toMatchObject({ error: 'already-drafted' });
  });

  it('keeps going after drafting and saves new answers as the next intent version, once', async () => {
    const { store, slug } = await started();
    expect(intentUpdate(store, context(store, slug))).toMatchObject({ error: 'not-drafted' });
    for (let i = 0; i < 8; i += 1) await turn(store, slug, `Answer ${i}.`);
    await draftIntent(store, context(store, slug));
    expect(intentUpdate(store, context(store, slug))).toEqual({ ok: true, value: { sections: [], status: 'draft' } });
    expect(await updateIntent(store, context(store, slug))).toMatchObject({ error: 'no-change' });
    await turn(store, slug, 'Only on weekdays.');
    expect(intentUpdate(store, context(store, slug))).toMatchObject({ value: { sections: ['Constraints'] } });
    const updated = await updateIntent(store, context(store, slug));
    expect(updated).toMatchObject({ ok: true, value: { header: { version: 2 } } });
    expect(updated.ok && updated.value.body).toBe(intentBody(context(store, slug)));
    expect(store.index.versions(slug, 'INT-0001').at(-1)?.reason).toBe('Brainstorm: add answers for Constraints');
    const log = (await fileHistory(projectDir(slug, store.home), 'brainstorm.md')).map((c) => c.message);
    // Turns are squashed; the ID reservation and each intent version end a run of brainstorm commits.
    expect(log).toEqual([
      'Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems',
      'Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems',
      'Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems, Constraints',
      'Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems, Constraints',
    ]);
  });

  it('adds only new answers on update and keeps hand edits to intent.md, including removed requirements', async () => {
    const { store, slug } = await started();
    for (const a of ['P.', 'P2.', 'O.', 'O2.', '- Export the log\n- Record an approval', 'Checked.', 'Users.']) await turn(store, slug, a);
    await draftIntent(store, context(store, slug));
    const edited = '# Intent: Readme helper\n\n## Requirements\n\n- REQ-001 Export the log as CSV\n\n## Affected users and systems\n\nUsers.\n';
    await saveDocument(store, slug, 'docs/intent.md', { reason: 'Hand edit', body: edited });
    expect(intentUpdate(store, context(store, slug))).toMatchObject({ value: { sections: [] } });
    await turn(store, slug, 'Auditors too.');
    expect(intentUpdate(store, context(store, slug))).toMatchObject({ value: { sections: ['Affected users and systems'] } });
    const updated = await updateIntent(store, context(store, slug));
    expect(updated.ok && updated.value.body).toBe(
      '# Intent: Readme helper\n\n## Requirements\n\n- REQ-001 Export the log as CSV\n\n## Affected users and systems\n\nUsers.\n\nAuditors too.\n',
    );
    expect(await updateIntent(store, context(store, slug))).toMatchObject({ error: 'no-change' });
  });

  it('adds to a chosen section after drafting, and new requirements get new IDs on update', async () => {
    const { store, slug } = await started();
    for (const a of ['P.', 'P2.', 'O.', 'O2.', '- Export the log', 'Checked.', 'Users.']) await turn(store, slug, a);
    await draftIntent(store, context(store, slug));
    expect(await addToSection(store, context(store, slug), 'Nope', 'x')).toMatchObject({ error: 'invalid-input' });
    const added = await addToSection(store, context(store, slug), 'Requirements', '- Record an approval');
    expect(added.ok && added.value.current).toEqual(context(store, slug).session.current);
    expect(intentUpdate(store, context(store, slug))).toMatchObject({ value: { sections: ['Requirements'] } });
    const updated = await updateIntent(store, context(store, slug));
    expect(updated.ok && updated.value.body).toContain('- REQ-001 Export the log\n\nChecked.\n\n- REQ-002 Record an approval');
  });

  it('moves past the open question when its section gets an answer this way', async () => {
    const { store, slug } = await started();
    const added = await addToSection(store, context(store, slug), 'Problem', 'Typed early.');
    expect(added.ok && added.value.current).toEqual({ section: 'Desired outcome', step: 'ask' });
  });

  it('refuses brainstorm updates once the intent is no longer a draft', async () => {
    const { store, slug } = await started();
    for (let i = 0; i < 8; i += 1) await turn(store, slug, `Answer ${i}.`);
    await draftIntent(store, context(store, slug));
    await saveDocument(store, slug, 'docs/intent.md', { reason: 'Approve', status: 'approved' });
    await turn(store, slug, 'Late answer.');
    expect(await updateIntent(store, context(store, slug))).toMatchObject({ error: 'intent-locked' });
  });

  it('changes template and style in Project setup', async () => {
    const { store, slug } = await started();
    const changed = await changeSetup(store, slug, { template: 'lightweight-intent@1', style: 'coach@1' });
    expect(changed).toMatchObject({ ok: true, value: { template: 'lightweight-intent@1', brainstorm_style: 'coach@1', current: { section: 'Problem' } } });
    expect(await changeSetup(store, slug, { template: 'nope@1', style: 'coach@1' })).toMatchObject({ error: 'unknown-template' });
    expect(readSession(store, 'nope')).toMatchObject({ error: 'not-found' });
  });
});
