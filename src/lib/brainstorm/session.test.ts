import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureSeed } from '../seed';
import { saveDocument } from '../store/documents';
import { fileHistory } from '../store/git';
import { tempStore } from '../store/test-store';
import { readProject } from '../store/workspace';
import {
  changeSetup, draftIntent, fallbackQuestion, loadContext, pendingQuestion, questionPrompt, readSession,
  recordAnswer, recordQuestion, startIdea, templateLabel, type Context,
  brainstormCommitMessage, intentBody, intentUpdate, updateIntent, addToSection,
} from './session';

const SEED = join(process.cwd(), 'seed');
const idea = { title: 'Readme helper', idea: 'Help newcomers.', author: 'Ada', template: 'standard-intent@3', style: 'challenger@1' };

async function started() {
  const store = tempStore();
  ensureSeed(store.root, SEED);
  const session = await startIdea(store, idea);
  if (!session.ok) throw new Error(session.message);
  return { store };
}

function context(store: ReturnType<typeof tempStore>): Context {
  const loaded = loadContext(store);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.value;
}

async function turn(store: ReturnType<typeof tempStore>, answer: string) {
  const ctx = context(store);
  await recordQuestion(store, ctx.session, 'Q?');
  const answered = await recordAnswer(store, context(store), answer);
  if (!answered.ok) throw new Error(answered.message);
  return answered.value;
}

describe('requirement IDs', () => {
  it('numbers requirement statements once, keeps them on later drafts and never reuses an ID', async () => {
    const { store } = await started();
    await turn(store, 'Problem.');
    await turn(store, 'Probe.');
    await turn(store, 'Outcome.');
    await turn(store, 'Probe.');
    await turn(store, '- Generate a README\n- Detect the language');
    await turn(store, 'Checked with two teams.');
    await turn(store, 'Contributors.');
    const drafted = await draftIntent(store, context(store));
    if (!drafted.ok) throw new Error(drafted.message);
    expect(drafted.value.body).toContain('## Requirements\n\n- REQ-001 Generate a README\n- REQ-002 Detect the language\n\nChecked with two teams.');
    expect(readFileSync(join(store.root, '.keel/config.yml'), 'utf8')).toContain('next_req: 3');
    expect(context(store).session.req_ids).toEqual({ 'Generate a README': 'REQ-001', 'Detect the language': 'REQ-002' });
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
    const { store } = await started();
    const session = readSession(store);
    expect(session).toMatchObject({ ok: true, value: { template: 'standard-intent@3', brainstorm_style: 'challenger@1', current: { section: 'Problem', step: 'ask' } } });
    expect(session.ok && pendingQuestion(session.value)).toEqual({ section: 'Problem', step: 'ask' });
    expect(readFileSync(join(store.root, '.keel/brainstorm/explore.md'), 'utf8')).toContain('# Brainstorm: Readme helper');
  });

  it('refuses unknown templates, styles and missing names', async () => {
    const store = tempStore();
    ensureSeed(store.root, SEED);
    expect(await startIdea(store, { ...idea, template: 'roadmap@1' })).toMatchObject({ error: 'unknown-template' });
    expect(await startIdea(store, { ...idea, style: 'nope@1' })).toMatchObject({ error: 'unknown-style' });
    expect(await startIdea(store, { ...idea, author: ' ' })).toMatchObject({ error: 'invalid-input' });
    expect(await startIdea(store, { ...idea, standards: ['made-up@1'] })).toMatchObject({ error: 'invalid-input', message: 'Unknown standard made-up@1' });
    const withStandards = await startIdea(store, { ...idea, standards: ['bdd-style@1'] });
    expect(withStandards.ok && readFileSync(join(store.root, '.keel/config.yml'), 'utf8')).toContain('- bdd-style@1');
  });

  it('asks, probes, then moves on; answers only an asked question', async () => {
    const { store } = await started();
    expect(await recordAnswer(store, context(store), 'too early')).toMatchObject({ error: 'no-question' });
    expect((await turn(store, 'Newcomers are lost.')).current).toEqual({ section: 'Problem', step: 'probe' });
    const after = await turn(store, 'Seen in five sessions.');
    expect(after.current).toEqual({ section: 'Desired outcome', step: 'ask' });
    expect(after.answers.Problem).toEqual(['Newcomers are lost.', 'Seen in five sessions.']);
    expect(after.transcript.map((e) => e.role)).toEqual(['assistant', 'user', 'assistant', 'user']);
    const log = (await fileHistory(store.root, '.keel/brainstorm/explore.md')).map((c) => c.message);
    expect(log).toEqual(['Keel: Initialise project', 'Keel: Brainstorm: captured Problem']);
  });

  it('builds the model prompt from the style, the section and the conversation', async () => {
    const { store } = await started();
    const ctx = context(store);
    const prompt = questionPrompt(ctx, { section: 'Problem', step: 'ask' });
    expect(prompt[0]).toMatchObject({ role: 'system', content: expect.stringContaining('# Challenger') });
    expect(prompt[1]?.content).toContain('fill the section "Problem"');
    expect(prompt[2]).toEqual({ role: 'user', content: 'My idea: Readme helper. Help newcomers.' });
    expect(questionPrompt(ctx, { section: 'Problem', step: 'probe' })[1]?.content).toContain('follow-up');
    expect(fallbackQuestion(ctx, { section: 'Problem', step: 'ask' })).toMatch(/^Problem: What the user cannot do today/);
    expect(templateLabel('standard-intent@3')).toBe('Standard intent v3');
  });

  it('drafts intent.md only when every required section is captured, once', async () => {
    const { store } = await started();
    expect(await draftIntent(store, context(store))).toMatchObject({ error: 'not-ready' });
    for (let i = 0; i < 8; i += 1) await turn(store, `Answer ${i}.`);
    const drafted = await draftIntent(store, context(store));
    expect(drafted).toMatchObject({ ok: true, value: { header: { template: 'standard-intent@3', brainstorm_style: 'challenger@1', status: 'draft' } } });
    expect(drafted.ok && drafted.value.body).toContain('## Problem\n\nAnswer 0.\n\nAnswer 1.');
    expect(drafted.ok && drafted.value.body).toContain('# Intent: Readme helper');
    expect(await draftIntent(store, context(store))).toMatchObject({ error: 'already-drafted' });
  });

  it('keeps going after drafting and saves new answers as the next intent version, once', async () => {
    const { store } = await started();
    expect(intentUpdate(store, context(store))).toMatchObject({ error: 'not-drafted' });
    for (let i = 0; i < 8; i += 1) await turn(store, `Answer ${i}.`);
    await draftIntent(store, context(store));
    expect(intentUpdate(store, context(store))).toEqual({ ok: true, value: { sections: [], status: 'draft' } });
    expect(await updateIntent(store, context(store))).toMatchObject({ error: 'no-change' });
    await turn(store, 'Only on weekdays.');
    expect(intentUpdate(store, context(store))).toMatchObject({ value: { sections: ['Constraints'] } });
    const updated = await updateIntent(store, context(store));
    expect(updated).toMatchObject({ ok: true, value: { header: { version: 2 } } });
    expect(updated.ok && updated.value.body).toBe(intentBody(context(store)));
    expect(store.index.versions('INT-0001').at(-1)?.reason).toBe('Brainstorm: add answers for Constraints');
    const log = (await fileHistory(store.root, '.keel/brainstorm/explore.md')).map((c) => c.message);
    // Turns are squashed; the ID reservation and each intent version end a run of brainstorm commits.
    expect(log).toEqual([
      'Keel: Initialise project',
      'Keel: Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems',
      'Keel: Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems',
      'Keel: Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems, Constraints',
      'Keel: Brainstorm: captured Problem, Desired outcome, Requirements, Affected users and systems, Constraints',
    ]);
  });

  it('adds only new answers on update and keeps hand edits to intent.md, including removed requirements', async () => {
    const { store } = await started();
    for (const a of ['P.', 'P2.', 'O.', 'O2.', '- Export the log\n- Record an approval', 'Checked.', 'Users.']) await turn(store, a);
    await draftIntent(store, context(store));
    const edited = '# Intent: Readme helper\n\n## Requirements\n\n- REQ-001 Export the log as CSV\n\n## Affected users and systems\n\nUsers.\n';
    await saveDocument(store, 'docs/intent.md', { reason: 'Hand edit', body: edited });
    expect(intentUpdate(store, context(store))).toMatchObject({ value: { sections: [] } });
    await turn(store, 'Auditors too.');
    expect(intentUpdate(store, context(store))).toMatchObject({ value: { sections: ['Affected users and systems'] } });
    const updated = await updateIntent(store, context(store));
    expect(updated.ok && updated.value.body).toBe(
      '# Intent: Readme helper\n\n## Requirements\n\n- REQ-001 Export the log as CSV\n\n## Affected users and systems\n\nUsers.\n\nAuditors too.\n',
    );
    expect(await updateIntent(store, context(store))).toMatchObject({ error: 'no-change' });
  });

  it('adds to a chosen section after drafting, and new requirements get new IDs on update', async () => {
    const { store } = await started();
    for (const a of ['P.', 'P2.', 'O.', 'O2.', '- Export the log', 'Checked.', 'Users.']) await turn(store, a);
    await draftIntent(store, context(store));
    expect(await addToSection(store, context(store), 'Nope', 'x')).toMatchObject({ error: 'invalid-input' });
    const added = await addToSection(store, context(store), 'Requirements', '- Record an approval');
    expect(added.ok && added.value.current).toEqual(context(store).session.current);
    expect(intentUpdate(store, context(store))).toMatchObject({ value: { sections: ['Requirements'] } });
    const updated = await updateIntent(store, context(store));
    expect(updated.ok && updated.value.body).toContain('- REQ-001 Export the log\n\nChecked.\n\n- REQ-002 Record an approval');
  });

  it('moves past the open question when its section gets an answer this way', async () => {
    const { store } = await started();
    const added = await addToSection(store, context(store), 'Problem', 'Typed early.');
    expect(added.ok && added.value.current).toEqual({ section: 'Desired outcome', step: 'ask' });
  });

  it('refuses brainstorm updates once the intent is no longer a draft', async () => {
    const { store } = await started();
    for (let i = 0; i < 8; i += 1) await turn(store, `Answer ${i}.`);
    await draftIntent(store, context(store));
    await saveDocument(store, 'docs/intent.md', { reason: 'Approve', status: 'approved' });
    await turn(store, 'Late answer.');
    expect(await updateIntent(store, context(store))).toMatchObject({ error: 'intent-locked' });
  });

  it('changes template and style in Project setup', async () => {
    const { store } = await started();
    const changed = await changeSetup(store, { template: 'lightweight-intent@1', style: 'coach@1' });
    expect(changed).toMatchObject({ ok: true, value: { template: 'lightweight-intent@1', brainstorm_style: 'coach@1', current: { section: 'Problem' } } });
    expect(await changeSetup(store, { template: 'nope@1', style: 'coach@1' })).toMatchObject({ error: 'unknown-template' });
    expect(readProject(store.root)).toMatchObject({ ok: true, value: { templates: { intent: 'lightweight-intent@1' }, style: 'coach@1' } });
    expect(readSession(tempStore())).toMatchObject({ error: 'not-found' });
  });

  it('initialises the folder once, with the brainstorm in the same commit', async () => {
    const { store } = await started();
    expect(await startIdea(store, idea)).toMatchObject({ error: 'invalid-input', message: 'This folder is already initialised' });
    expect(readProject(store.root)).toMatchObject({ ok: true, value: { title: 'Readme helper', description: 'Help newcomers.', templates: { intent: 'standard-intent@3' }, style: 'challenger@1' } });
  });
});
