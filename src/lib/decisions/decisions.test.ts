import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readChange } from '../changes/store';
import { approveChange } from '../changes/flow';
import { recordDecision, review } from '../gates/approvals';
import { gateFor } from '../gates/rules';
import { projectState } from '../gates/approvals';
import { DESIGN_MARKER, proposeDecisions } from '../generate/design';
import { generateSpec } from '../generate/spec';
import type { Writer } from '../generate/writer';
import { fakeReply } from '../providers/fake';
import { repoFacts } from '../repo/facts';
import { raiseScenarioChange } from '../changes/scenarios';
import { acceptAllSuggestions } from '../scenarios/store';
import { ensureSeed } from '../seed';
import { createDocument, readDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { readDesign, templateTopics, undecided } from './design';
import { decide } from './records';

const TS = { ref: 'typescript-conventions@3', name: 'TypeScript conventions', description: '', owner: '', version: 3, body: '', appliesTo: [] };

/** The fake provider for design topics; nothing for the spec's sections. */
const designOnly: Writer = async (_task, messages) => (messages[0]?.content.includes(DESIGN_MARKER) ? fakeReply('anthropic', messages) : undefined);

async function draftSpec(standards = ['typescript-conventions@3']) {
  const store = tempStore();
  ensureSeed(store.root, join(process.cwd(), 'seed'));
  await initialiseProject(store, { title: 'Demo', author: 'Ada', standards });
  await createDocument(store, { kind: 'intent', title: 'Demo', template: 'standard-intent@3', body: '## Requirements\n\n- REQ-001 Show the run command\n' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  const spec = await generateSpec(store, 'requirements-and-design-spec@3', designOnly);
  if (!spec.ok) throw new Error(spec.message);
  return store;
}

describe('proposeDecisions', () => {
  const topics = templateTopics(readFileSync(join(process.cwd(), 'seed/templates/spec-standard-v3.md'), 'utf8'));
  const input = { requirements: { 'REQ-001': 'Show the run command' }, constraints: '', standards: [TS as never], facts: { manifests: [], dependencies: [] }, topics };

  it('offers at most three options per topic with one recommended, and says when one breaks a standard', async () => {
    expect(topics.map((t) => t.title)).toEqual(['Form', 'Language and framework', 'Storage', 'Model access', 'Testing']);
    const proposed = await proposeDecisions(input, designOnly);
    for (const t of proposed) {
      expect(t.options.length).toBeLessThanOrEqual(3);
      expect(t.options.filter((o) => o.recommended)).toHaveLength(1);
    }
    const stack = proposed.find((t) => t.title === 'Language and framework');
    expect(stack?.options.find((o) => o.fit?.kind === 'breaks')?.fit?.text).toBe('Breaks TypeScript conventions v3: the code must be TypeScript');
  });

  it('offers "Keep current" first when the folder has code, and topics without options when no model answers', async () => {
    const store = tempStore();
    writeFileSync(join(store.root, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0', react: '19.0.0' }, devDependencies: { typescript: '5.9.0' } }));
    const facts = repoFacts(store.root);
    expect(facts).toMatchObject({ stack: 'Next.js with TypeScript', manifests: ['package.json'] });
    const proposed = await proposeDecisions({ ...input, facts }, designOnly);
    const stack = proposed.find((t) => t.title === 'Language and framework');
    expect(stack?.options[0]?.name).toBe('Keep current: Next.js with TypeScript');
    expect(stack?.options).toHaveLength(3);
    const none = await proposeDecisions(input, async () => undefined);
    expect(none.map((t) => t.options.length)).toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps a topic the assistant adds only when it names the requirement that needs it', async () => {
    const answer = (reason?: string): Writer => async () => JSON.stringify({ topics: [{ title: 'Search', ...(reason ? { reason_added: reason } : {}), options: [{ name: 'SQLite FTS', summary: 's', pro: 'p', con: 'c', serves: ['REQ-001'], recommended: true }] }] });
    expect((await proposeDecisions(input, answer())).some((t) => t.title === 'Search')).toBe(false);
    expect((await proposeDecisions(input, answer('Added for REQ-001'))).find((t) => t.title === 'Search')).toMatchObject({ origin: 'assistant', reasonAdded: 'Added for REQ-001' });
  });
});

describe('decide', () => {
  it('writes a record with the alternatives considered, and the spec follows', async () => {
    const store = await draftSpec();
    expect(undecided(store.root)).toEqual(['Form', 'Language and framework', 'Storage', 'Model access', 'Testing']);
    const decided = await decide(store, 'testing', { chosen: 'testing-1', reason: 'Scenarios run as written.' });
    if (!decided.ok || !('record' in decided.value)) throw new Error('not decided');
    expect(decided.value.record).toMatch(/^docs\/decisions\/\d{4}-testing\.md$/);
    const record = readFileSync(join(store.root, decided.value.record), 'utf8');
    expect(record).toContain('# Testing: Vitest, Playwright and playwright-bdd');
    expect(record).toContain('## Alternatives considered\n\n- Jest and Cypress: Common pair.');
    expect(record).toContain('- Manual testing: A checklist.');
    const spec = readDocument(store, 'docs/spec.md');
    expect(spec.ok && spec.value.body).toContain('- **Testing:** Vitest, Playwright and playwright-bdd');
    expect(undecided(store.root)).not.toContain('Testing');
    expect(await decide(store, 'testing', { chosen: 'testing-1', reason: 'Scenarios run as written.' })).toMatchObject({ error: 'invalid-input' });
    expect(await decide(store, 'nope', { chosen: 'x', reason: '' })).toMatchObject({ error: 'not-found' });
  });

  it('rewrites the same record with "Changed from" while the spec is a draft, and flags a concern', async () => {
    const store = await draftSpec();
    const first = await decide(store, 'storage', { chosen: 'storage-1', reason: '' });
    if (!first.ok || !('record' in first.value)) throw new Error('not decided');
    const again = await decide(store, 'storage', { chosen: 'storage-3', reason: 'Many users.' });
    expect(again).toMatchObject({ ok: true, value: { record: first.value.record } });
    const record = readFileSync(join(store.root, first.value.record), 'utf8');
    expect(record).toContain('# Storage: Postgres');
    expect(record).toMatch(/## Changes\n\n- Changed from Markdown in git with a SQLite index on \d{4}-\d{2}-\d{2}\./);
    const spec = readDocument(store, 'docs/spec.md');
    expect(spec.ok && spec.value.body).toContain('Needs a database server and its credentials');
  });

  it('after approval, holds the change in a change request; approving it writes a superseding record', async () => {
    const store = await draftSpec();
    for (const id of ['form', 'language-and-framework', 'storage', 'model-access', 'testing']) await decide(store, id, { chosen: `${id}-1`, reason: '' });
    await review(store, 'spec', { action: 'approve', by: 'Ada', comment: '' });
    const old = readDesign(store.root).topics.find((t) => t.id === 'storage')?.record ?? '';
    const held = await decide(store, 'storage', { chosen: 'storage-2', reason: 'Simpler.' });
    if (!held.ok || !('held' in held.value)) throw new Error('not held');
    expect(readChange(store.root, held.value.held)).toMatchObject({ status: 'waiting', size: 'significant' });
    expect(readDesign(store.root).topics.find((t) => t.id === 'storage')?.chosen).toBe('storage-1');
    expect((await approveChange(store, held.value.held, 'Ada')).ok).toBe(true);
    const topic = readDesign(store.root).topics.find((t) => t.id === 'storage');
    expect(topic?.chosen).toBe('storage-2');
    expect(topic?.record).not.toBe(old);
    expect(readFileSync(join(store.root, old), 'utf8')).toMatch(/status: closed[\s\S]*superseded_by: ADR-/);
    expect(readFileSync(join(store.root, topic?.record ?? ''), 'utf8')).toContain('supersedes: ADR-');
  });

  it('the plan waits for every topic, and the reason names the undecided ones', async () => {
    const store = await draftSpec();
    await acceptAllSuggestions(store, raiseScenarioChange);
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
    for (const id of ['form', 'language-and-framework', 'storage', 'testing']) await decide(store, id, { chosen: `${id}-1`, reason: '' });
    expect(gateFor(projectState(store), 'plan')).toMatchObject({ available: false, reason: 'Needs every design topic decided (Model access)' });
  });
});
