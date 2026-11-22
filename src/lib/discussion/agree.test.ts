import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readChange } from '../changes/store';
import { fakeReply } from '../providers/fake';
import { createDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject, readConfig } from '../store/workspace';
import { agree, saveEdit } from './agree';
import { commitDiscussion, readDiscussion } from './file';
import { proposalState } from './proposal';
import { finishTurn, prepareTurn } from './turn';

const MODEL = { label: 'Fake', contextLength: 40_960 };
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

async function discussed(control = {}) {
  const store = tempStore('2026-11-22');
  await initialiseProject(store, { title: 'Keel', author: 'Ada' });
  await createDocument(store, { kind: 'intent', title: 'Keel', body: '# Intent\n\n## Requirements\n\n- REQ-005 Each stage unlocks only when the previous one is approved\n', template: 'standard-intent@3' });
  const turn = await prepareTurn(store, { text: 'Reviewers should comment on the spec before I approve it', author: 'Ada', sources: ['requirements', 'codemap'], attachments: [], model: MODEL }, async () => undefined);
  if (!turn.ok) throw new Error(turn.message);
  const reply = fakeReply('ollama', turn.value.messages, control);
  const done = finishTurn(store, turn.value.discussion, reply);
  if (!done.ok) throw new Error(done.message);
  await commitDiscussion(store, done.value);
  return { store, id: done.value.id };
}

describe('agree', () => {
  it('assigns the IDs, writes the package and the discussion, all in one Keel commit', async () => {
    const { store, id } = await discussed();
    const before = Number(git(store.root, 'rev-list', '--count', 'HEAD'));
    const agreed = await agree(store, id);
    if (!agreed.ok) throw new Error(agreed.message);
    expect(agreed.value.cr).toBe('CR-0001');
    expect(Number(git(store.root, 'rev-list', '--count', 'HEAD'))).toBe(before + 1);
    expect(git(store.root, 'log', '-1', '--format=%an|%s')).toBe('Keel|Keel: CR-0001 from discussion DSC-0001');
    expect(git(store.root, 'status', '--porcelain')).toBe('');
    const cr = readChange(store.root, 'CR-0001');
    expect(cr).toMatchObject({ status: 'draft', origin: 'keel', requirements: ['REQ-006', 'REQ-005'] });
    const header = readFileSync(join(store.root, 'changes/CR-0001/CR-0001.md'), 'utf8');
    expect(header).toContain('discussion: DSC-0001');
    expect(header).toContain('| REQ-006 | New: "Reviewers can comment on a draft spec before it is approved." |');
    const folder = join(store.root, 'changes/CR-0001');
    expect(readdirSync(folder).sort()).toEqual(['CR-0001.md', 'PROMPT.md', 'decisions', 'discussion.md', 'features', 'tasks']);
    expect(readdirSync(join(folder, 'tasks'))).toEqual(['R1.md']);
    expect(readFileSync(join(folder, 'features', readdirSync(join(folder, 'features'))[0] as string), 'utf8')).toContain('@REQ-006');
    expect(readdirSync(join(folder, 'decisions'))).toEqual(['0001-where-comments-are-kept.md']);
    expect(existsSync(join(store.root, '.keel/discussions/DSC-0001.md'))).toBe(false);
    expect(readDiscussion(store.root, id)).toMatchObject({ status: 'cr', cr: 'CR-0001', path: 'changes/CR-0001/discussion.md' });
    expect(readConfig(store.root)?.next_req).toBe(7);
    expect(agreed.value.screens).toEqual(['Spec']);
  });

  it('refuses a proposal that fails a check, and takes the user\'s edit', async () => {
    const { store, id } = await discussed({ discussion: 'unknown-req' });
    expect(await agree(store, id)).toMatchObject({ ok: false, error: 'checks', message: expect.stringContaining('Unknown requirement REQ-099') });
    const d = readDiscussion(store.root, id);
    const state = d && proposalState(d);
    if (state?.kind !== 'waiting') throw new Error('no proposal');
    const edited = { ...state.proposal, requirements: state.proposal.requirements.filter((r) => r.id !== 'REQ-099') };
    expect(saveEdit(store, id, edited, 'Ada')).toMatchObject({ ok: true });
    expect(readFileSync(join(store.root, '.keel/discussions/DSC-0001.md'), 'utf8')).toContain('### Ada edited the proposal · 2026-11-22 12:00\n\nChanged: requirements');
    expect(await agree(store, id)).toMatchObject({ ok: true, value: { cr: 'CR-0001' } });
  });
});
