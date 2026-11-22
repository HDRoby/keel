import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitMessage, createDocument, kindFromPath, listDocumentPaths, parseDocument, readDocument, saveDocument, serializeDocument } from './documents';
import { fileHistory } from './git';
import { tempStore } from './test-store';
import { initialiseProject } from './workspace';

const intent = { kind: 'intent' as const, title: 'Keel', body: '# Intent: Keel\n', template: 'standard-intent@3', extra: { brainstorm_style: 'challenger@1' } };

async function withProject() {
  const store = tempStore();
  await initialiseProject(store, { title: 'Keel', author: 'Ada' });
  return store;
}

describe('kindFromPath', () => {
  it('maps document paths to kinds and rejects others', () => {
    expect(kindFromPath('docs/intent.md')).toBe('intent');
    expect(kindFromPath('docs/decisions/ADR-0001.md')).toBe('decision');
    expect(kindFromPath('tasks/T1.md')).toBe('task');
    expect(kindFromPath('docs/../secret.md')).toBeUndefined();
    expect(kindFromPath('project.md')).toBeUndefined();
  });
});

describe('listDocumentPaths', () => {
  it('lists document files under docs/ and tasks/ only', async () => {
    const store = await withProject();
    await createDocument(store, intent);
    await createDocument(store, { ...intent, kind: 'task' });
    writeFileSync(join(store.root, 'docs/notes.txt'), '');
    expect(listDocumentPaths(store.root)).toEqual(['docs/intent.md', 'tasks/T1.md']);
  });
});

describe('parse and serialize', () => {
  it('round-trips a header and body, reading YAML dates as ISO dates', () => {
    const header = { id: 'INT-0001', project: 'PRJ-0001', title: 'K', author: 'Ada', created: '2026-11-20', updated: '2026-11-20', status: 'draft' as const, version: 1, template: 't@1' };
    expect(parseDocument(serializeDocument(header, '# K\n'))).toEqual({ ok: true, value: { header, body: '# K\n' } });
    const unquoted = parseDocument('---\nid: A\nproject: P\ntitle: K\nauthor: Ada\ncreated: 2026-11-20\nupdated: 2026-11-21\nstatus: draft\nversion: 1\ntemplate: t\n---\nbody');
    expect(unquoted.ok && unquoted.value.header.updated).toBe('2026-11-21');
  });

  it('rejects a missing field or bad status', () => {
    expect(parseDocument('---\nid: A\n---\n')).toMatchObject({ ok: false, error: 'invalid-front-matter' });
    expect(parseDocument('---\n: [\n---\n')).toMatchObject({ ok: false, error: 'invalid-front-matter' });
  });

  it('formats commit messages with id and version', () => {
    const header = { id: 'INT-0001', version: 3 } as Parameters<typeof commitMessage>[0];
    expect(commitMessage(header, 'Tighten\n scope ')).toBe('INT-0001 v3: Tighten scope');
  });
});

describe('createDocument', () => {
  it('writes version 1 as draft with project metadata, commits and indexes it', async () => {
    const store = await withProject();
    const created = await createDocument(store, intent);
    expect(created).toMatchObject({ ok: true, value: { path: 'docs/intent.md', header: {
      id: 'INT-0001', project: 'PRJ-0001', author: 'Ada', created: '2026-11-20', updated: '2026-11-20',
      status: 'draft', version: 1, template: 'standard-intent@3', brainstorm_style: 'challenger@1' } } });
    const dir = store.root;
    expect(readFileSync(join(dir, 'docs/intent.md'), 'utf8')).toMatch(/^---\nbrainstorm_style: challenger@1\n/);
    expect((await fileHistory(dir, 'docs/intent.md'))[0]?.message).toBe('Keel: INT-0001 v1: Create intent');
    expect(store.index.documents()).toHaveLength(1);
  });

  it('numbers folder documents and refuses a second intent or unknown project', async () => {
    const store = await withProject();
    await createDocument(store, { ...intent, kind: 'decision' });
    const second = await createDocument(store, { ...intent, kind: 'decision' });
    expect(second.ok && second.value.path).toBe('docs/decisions/ADR-0002.md');
    const task = await createDocument(store, { ...intent, kind: 'task' });
    expect(task.ok && task.value.header.id).toBe('T1');
    await createDocument(store, intent);
    expect(await createDocument(store, intent)).toMatchObject({ error: 'already-exists' });
    expect(await createDocument(tempStore(), intent)).toMatchObject({ error: 'not-initialised' });
  });
});

describe('createDocument options and saveDocument extras', () => {
  it('names folder documents NNNN-<slug>.md, sets a status, and keeps core fields when extras are saved', async () => {
    const store = await withProject();
    const go = await createDocument(store, { ...intent, kind: 'decision', status: 'approved', fileSlug: 'go' });
    expect(go).toMatchObject({ ok: true, value: { path: 'docs/decisions/0001-go.md', header: { id: 'ADR-0001', status: 'approved' } } });
    expect(await createDocument(store, { ...intent, kind: 'task', id: 'T7' })).toMatchObject({ ok: true, value: { path: 'tasks/T7.md' } });
    expect(await createDocument(store, { ...intent, kind: 'task', id: '../T1', status: 'todo' })).toMatchObject({ ok: true, value: { path: 'tasks/T2.md', header: { status: 'todo' } } });
    const bad = await createDocument(store, { ...intent, kind: 'decision', fileSlug: '../x' });
    expect(bad.ok && bad.value.path).toBe('docs/decisions/ADR-0002.md');
    const saved = await saveDocument(store, 'docs/decisions/0001-go.md', { reason: 'Note', extra: { approvals: [1], id: 'HACK', author: 'Eve' } });
    expect(saved).toMatchObject({ ok: true, value: { header: { approvals: [1], id: 'ADR-0001', author: 'Ada', version: 2 } } });
  });
});

describe('readDocument and saveDocument', () => {
  it('saves the next version with the reason in git and the index', async () => {
    const store = await withProject();
    await createDocument(store, intent);
    store.now = () => new Date('2026-11-22T09:00:00Z');
    const saved = await saveDocument(store, 'docs/intent.md', { reason: 'Add\n outcome', body: '# New\n', status: 'pending' });
    expect(saved).toMatchObject({ ok: true, value: { body: '# New\n', header: { version: 2, status: 'pending', created: '2026-11-20', updated: '2026-11-22' } } });
    expect(readDocument(store, 'docs/intent.md')).toMatchObject({ ok: true, value: { kind: 'intent', header: { version: 2 } } });
    expect(store.index.versions('INT-0001').map((v) => v.reason)).toEqual(['Create intent', 'Add outcome']);
  });

  it('reports bad paths, missing files and broken front matter', async () => {
    const store = await withProject();
    expect(readDocument(store, '../x.md')).toMatchObject({ error: 'invalid-path' });
    expect(readDocument(store, 'docs/spec.md')).toMatchObject({ error: 'not-found' });
    await createDocument(store, intent);
    writeFileSync(join(store.root, 'docs/intent.md'), 'no header');
    expect(await saveDocument(store, 'docs/intent.md', { reason: 'x' })).toMatchObject({ error: 'invalid-front-matter' });
  });
});

describe('writing into the user\'s repository (R5)', () => {
  it('does not overwrite a document edited outside Keel, unless read-back accepts it', async () => {
    const store = await withProject();
    await createDocument(store, intent);
    const file = join(store.root, 'docs/intent.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('# Intent: Keel', '# Intent: Keel (edited by hand)'));
    expect(await saveDocument(store, 'docs/intent.md', { reason: 'Edit', body: 'x' })).toMatchObject({ error: 'edited-outside' });
    expect(readFileSync(file, 'utf8')).toContain('edited by hand');
    expect(await saveDocument(store, 'docs/intent.md', { reason: 'Read back', body: 'Accepted.', external: true })).toMatchObject({ ok: true });
    expect(await saveDocument(store, 'docs/intent.md', { reason: 'Edit', body: 'Next.' })).toMatchObject({ ok: true, value: { header: { version: 3 } } });
  });

  it('keeps the change unsaved while a merge is in progress', async () => {
    const store = await withProject();
    await createDocument(store, intent);
    const file = join(store.root, 'docs/intent.md');
    const before = readFileSync(file, 'utf8');
    writeFileSync(join(store.root, '.git', 'MERGE_HEAD'), 'x');
    expect(await saveDocument(store, 'docs/intent.md', { reason: 'Edit', body: 'x' })).toMatchObject({ error: 'repo-busy', message: 'A merge is in progress. Finish the merge in git, then try again.' });
    expect(await createDocument(store, { ...intent, kind: 'plan' })).toMatchObject({ error: 'repo-busy' });
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
