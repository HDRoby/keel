import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { appendEntries, ASSISTANT, createDiscussion, listDiscussions, moveToChange, parkDiscussion, parseEntries, readDiscussion } from './file';
import { KEY_HELD, looksLikeKey } from './keys';

async function project() {
  const store = tempStore('2026-11-22');
  await initialiseProject(store, { title: 'Expense tracker', author: 'Ada' });
  return store;
}

describe('discussion files', () => {
  it('writes messages, summaries and edits from discussion@1 and reads them back', async () => {
    const store = await project();
    const d = createDiscussion(store, { title: 'Reviewer comments', model: 'Ollama · fake-large:32b', style: 'requirements-partner@1', sources: ['intent', 'requirements'] });
    expect(d).toMatchObject({ id: 'DSC-0001', path: '.keel/discussions/DSC-0001.md', status: 'open' });
    const added = appendEntries(store.root, d, [
      { kind: 'message', author: 'Ada', at: '2026-11-22 10:00', text: 'Reviewers should comment.\n### Not a heading' },
      { kind: 'message', author: ASSISTANT, at: '2026-11-22 10:01', text: 'Does REQ-005 cover it?\n\n```keel-proposal\n{"title":"x"}\n```' },
      { kind: 'summary', upTo: 2, text: 'Ada wants comments.' },
      { kind: 'edit', author: 'Ada', at: '2026-11-22 10:05', text: 'title: "Comments" → "Reviewer comments"' },
    ], { attachments: ['notes.md'] });
    expect(added.ok).toBe(true);
    const text = readFileSync(join(store.root, d.path), 'utf8');
    expect(text).toContain('# Discussion: Reviewer comments');
    expect(text).toContain('### Ada · 2026-11-22 10:00');
    expect(text).toContain('\\### Not a heading');
    expect(text).not.toContain('<!--');
    const read = readDiscussion(store.root, 'DSC-0001');
    expect(read?.entries.map((e) => e.kind)).toEqual(['message', 'message', 'summary', 'edit']);
    expect(read?.entries[0]).toMatchObject({ text: 'Reviewers should comment.\n### Not a heading' });
    expect(read?.attachments).toEqual(['notes.md']);
    expect(parseEntries('### Summary of messages 1–3\n\nShort.\n')).toEqual([{ kind: 'summary', upTo: 3, text: 'Short.' }]);
  });

  it('never writes a message that looks like a key', async () => {
    const store = await project();
    const d = createDiscussion(store, { title: 'Keys', model: '', style: '', sources: [] });
    const secret = 'use sk-test-fixture-0000000000000000';
    expect(looksLikeKey(secret)).toBe(true);
    expect(appendEntries(store.root, d, [{ kind: 'message', author: 'Ada', at: '2026-11-22 10:00', text: secret }])).toMatchObject({ ok: false, message: KEY_HELD });
    expect(readFileSync(join(store.root, d.path), 'utf8')).not.toContain('sk-test');
  });

  it('parks a discussion with a Keel commit, and moves one into its change request', async () => {
    const store = await project();
    const a = createDiscussion(store, { title: 'Later', model: '', style: '', sources: [] });
    const parked = await parkDiscussion(store, a.id);
    expect(parked).toMatchObject({ ok: true, value: { status: 'parked' } });
    expect(execFileSync('git', ['log', '-1', '--format=%an|%s'], { cwd: store.root, encoding: 'utf8' }).trim()).toBe('Keel|Keel: Park discussion DSC-0001');
    const b = createDiscussion(store, { title: 'Now', model: '', style: '', sources: [] });
    const moved = moveToChange(store.root, b, 'CR-0001', 'changes/CR-0001');
    expect(existsSync(join(store.root, '.keel/discussions/DSC-0002.md'))).toBe(false);
    expect(moved).toMatchObject({ status: 'cr', cr: 'CR-0001', path: 'changes/CR-0001/discussion.md' });
    expect(listDiscussions(store.root).map((d) => [d.id, d.status])).toEqual([['DSC-0002', 'cr'], ['DSC-0001', 'parked']]);
  });
});

describe('key patterns', () => {
  it('holds API keys and tokens, and lets ordinary text through', () => {
    for (const t of ['sk-ant-api03-abcdefghijklmnopqrstuv', `ghp_${'a'.repeat(36)}`, 'AKIAABCDEFGHIJKLMNOP', 'my token is 3f2a9c0d1e4b5a6978c0d1e2f3a4b5c6', 'password: aGVsbG8gd29ybGQgdGhpcyBpcyBsb25n']) expect(looksLikeKey(t), t).toBe(true);
    for (const t of ['Reviewers should comment on the spec', 'The token count is about 4000', 'Use a secret manager for keys']) expect(looksLikeKey(t), t).toBe(false);
  });
});
