import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { raiseScenarioChange } from '../changes/scenarios';
import { decide } from '../decisions/records';
import { gateFor, mockCheck } from '../gates/rules';
import { projectState, recordDecision, review } from '../gates/approvals';
import { DESIGN_MARKER } from '../generate/design';
import { generatePlan } from '../generate/plan';
import { generateSpec } from '../generate/spec';
import type { Writer } from '../generate/writer';
import { buildHandoff } from '../handoff/scaffold';
import { fakeReply } from '../providers/fake';
import { acceptAllSuggestions } from '../scenarios/store';
import { ensureSeed } from '../seed';
import { createDocument, readDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject, updateConfig } from '../store/workspace';
import { matchFiles, parseMockName } from './match';
import { inferScreens, mockPrompt } from './prompt';
import { currentSet, formHasUi, mockStatus, readSets, saveMockSet } from './sets';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const HTML = new TextEncoder().encode('<!doctype html><html><body>Explore</body></html>');
const designOnly: Writer = async (_t, messages) => (messages[0]?.content.includes(DESIGN_MARKER) ? fakeReply('anthropic', messages) : undefined);

async function specProject() {
  const store = tempStore();
  ensureSeed(store.root, join(process.cwd(), 'seed'));
  await initialiseProject(store, { title: 'Demo', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Demo', template: 'standard-intent@3', body: '## Problem\n\nIdeas get lost.\n\n## Requirements\n\n- REQ-001 Show the run command\n- REQ-002 Export the log\n' });
  await review(store, 'intent', { action: 'approve', by: 'Ada', comment: '' });
  await generateSpec(store, 'requirements-and-design-spec@3', designOnly);
  await acceptAllSuggestions(store, raiseScenarioChange);
  return store;
}

describe('parseMockName and matchFiles', () => {
  it('matches a named export to its screen and requirements, and asks for a screen otherwise', () => {
    expect(parseMockName('spec-v9 · 03 · Explore · REQ-001.png')).toEqual({ specVersion: 9, number: '03', screen: 'Explore', reqs: ['REQ-001'], ext: 'png' });
    expect(parseMockName('spec-v9 · 3 · Spec · REQ-004, REQ-013.html')).toMatchObject({ number: '03', reqs: ['REQ-004', 'REQ-013'], ext: 'html' });
    expect(parseMockName('image (3).png')).toBeUndefined();
    const screens = [{ number: '06', name: 'Plan', shows: '', reqs: ['REQ-008'] }];
    const matched = matchFiles(['spec-v9 · 03 · Explore · REQ-001.html', 'spec-v9 · 03 · Explore · REQ-001.png', 'spec-v9 · 06 · Plan.png', 'image (3).png'], screens);
    expect(matched.map((m) => [m.files, m.screen, m.reqs, m.match, m.note])).toEqual([
      [['spec-v9 · 03 · Explore · REQ-001.png', 'spec-v9 · 03 · Explore · REQ-001.html'], 'Explore', ['REQ-001'], 'name', 'From the file name'],
      [['spec-v9 · 06 · Plan.png'], 'Plan', ['REQ-008'], 'check', 'Check: no REQ in name'],
      [['image (3).png'], undefined, [], 'none', 'Choose a screen'],
    ]);
  });
});

describe('mockPrompt', () => {
  it('lists each screen with its requirement IDs, the Form, and the export naming', async () => {
    const store = await specProject();
    await decide(store, 'form', { chosen: 'form-1', reason: '' });
    const prompt = mockPrompt(store);
    if (!prompt) throw new Error('no prompt');
    const version = readDocument(store, 'docs/spec.md');
    expect(prompt.specVersion).toBe(version.ok ? version.value.header.version : 0);
    expect(prompt.screens.map((s) => s.reqs)).toEqual([['REQ-001'], ['REQ-002']]);
    expect(prompt.text).toContain('Form: Local web app');
    expect(prompt.text).toContain('- REQ-001 Show the run command');
    expect(prompt.text).toMatch(/^01 · .+ \(REQ-001\)$/m);
    expect(prompt.text).toContain(`Name each file: spec-v${prompt.specVersion} · <number> · <screen> · <REQ IDs>.png`);
    expect(prompt.fileName).toBe(`keel-mock-prompt-spec-v${prompt.specVersion}.md`);
    expect(inferScreens(store.root, { 'REQ-009': 'Not covered' }).at(-1)).toMatchObject({ name: 'Not covered', reqs: ['REQ-009'] });
  });
});

describe('mock sets', () => {
  it('saves a set with a README, replaces the current one, and goes out of date with a new spec version', async () => {
    const store = await specProject();
    expect(mockStatus(store)).toBe('missing');
    expect(await saveMockSet(store, { files: [{ name: 'x.png', bytes: new TextEncoder().encode('nope'), reqs: [], matched: 'user' }] })).toMatchObject({ error: 'unsupported-file' });
    const first = await saveMockSet(store, { files: [
      { name: 'spec-v1 · 01 · Explore · REQ-001.png', bytes: PNG, number: '01', screen: 'Explore', reqs: ['REQ-001'], matched: 'name' },
      { name: 'spec-v1 · 01 · Explore · REQ-001.html', bytes: HTML, number: '01', screen: 'Explore', reqs: ['REQ-001'], matched: 'name' },
    ], link: 'https://example.com/proto' });
    if (!first.ok) throw new Error(first.message);
    expect(existsSync(join(store.root, 'docs/mocks/set-1/01-explore.png'))).toBe(true);
    expect(existsSync(join(store.root, 'docs/mocks/set-1/01-explore.html'))).toBe(true);
    const readme = readFileSync(join(store.root, 'docs/mocks/README.md'), 'utf8');
    expect(readme).toContain('| [set-1](set-1/) | spec v');
    expect(readme).toContain('| `set-1/01-explore.html` | 01 · Explore | REQ-001 | `spec-v1 · 01 · Explore · REQ-001.html` |');
    expect(mockStatus(store)).toBe('current');

    await saveDocument(store, 'docs/spec.md', { reason: 'More', body: '# Spec\n\nChanged.\n' });
    expect(mockStatus(store)).toBe('stale');
    const second = await saveMockSet(store, { files: [{ name: 'image (3).png', bytes: PNG, screen: 'Explore', number: '01', reqs: ['REQ-001'], matched: 'user' }] });
    expect(second).toMatchObject({ ok: true, value: { set: 2 } });
    expect(readSets(store.root).map((s) => [s.set, s.status])).toEqual([[1, 'replaced'], [2, 'current']]);
    expect(mockStatus(store)).toBe('current');
  });

  it('locks the plan when Required and the Form has a UI, warns when Recommended, and links tasks and AGENTS.md', async () => {
    const store = await specProject();
    for (const id of ['form', 'language-and-framework', 'storage', 'model-access', 'testing']) await decide(store, id, { chosen: `${id}-1`, reason: '' });
    await recordDecision(store, { decision: 'go', by: 'Ada', reason: 'Yes', consequences: '' });
    expect(formHasUi(store.root)).toBe(true);
    expect(gateFor(projectState(store), 'plan')).toMatchObject({ available: true });
    expect(mockCheck(projectState(store))).toBe('warn');
    await updateConfig(store, { mock_gate: 'required' }, 'Required');
    expect(gateFor(projectState(store), 'plan')).toMatchObject({ available: false, reason: 'Needs a current clickable mock (no mock set yet; Clickable mock before the plan is Required)' });
    await updateConfig(store, { mock_gate: 'off' }, 'Off');
    expect(mockCheck(projectState(store))).toBe('ok');

    await saveMockSet(store, { files: [{ name: 'spec-v6 · 01 · Run · REQ-001.png', bytes: PNG, number: '01', screen: 'Run', reqs: ['REQ-001'], matched: 'name' }] });
    expect(currentSet(store.root)?.set).toBe(1);
    await generatePlan(store, async () => undefined);
    const t1 = readFileSync(join(store.root, 'tasks/T1.md'), 'utf8');
    expect(t1).toContain('`docs/mocks/set-1/01-run.png`: 01 · Run (REQ-001)');
    await review(store, 'plan', { action: 'approve', by: 'Ada', comment: '' });
    const built = await buildHandoff(store);
    if (!built.ok) throw new Error(built.message);
    const agents = new TextDecoder().decode(built.value.find((f) => f.path === 'AGENTS.md')?.data);
    expect(agents).toContain('## Visual reference');
    expect(agents).toContain('`docs/mocks/set-1/01-run.png`: 01 · Run (REQ-001)');
    expect(built.value.map((f) => f.path)).toContain('docs/mocks/set-1/01-run.png');
  });
});
