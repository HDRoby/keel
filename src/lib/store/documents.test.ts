import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitMessage, createDocument, kindFromPath, listDocumentPaths, parseDocument, readDocument, saveDocument, serializeDocument } from './documents';
import { fileHistory } from './git';
import { tempStore } from './test-store';
import { createProject, projectDir } from './workspace';

const intent = { kind: 'intent' as const, title: 'Keel', body: '# Intent: Keel\n', template: 'standard-intent@3', extra: { brainstorm_style: 'challenger@1' } };

async function withProject() {
  const store = tempStore();
  await createProject(store, { slug: 'keel', title: 'Keel', author: 'Ada' });
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
    await createDocument(store, 'keel', intent);
    await createDocument(store, 'keel', { ...intent, kind: 'task' });
    writeFileSync(join(projectDir('keel', store.home), 'docs/notes.txt'), '');
    expect(listDocumentPaths(projectDir('keel', store.home))).toEqual(['docs/intent.md', 'tasks/T1.md']);
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
    const created = await createDocument(store, 'keel', intent);
    expect(created).toMatchObject({ ok: true, value: { path: 'docs/intent.md', header: {
      id: 'INT-0001', project: 'PRJ-0001', author: 'Ada', created: '2026-11-20', updated: '2026-11-20',
      status: 'draft', version: 1, template: 'standard-intent@3', brainstorm_style: 'challenger@1' } } });
    const dir = projectDir('keel', store.home);
    expect(readFileSync(join(dir, 'docs/intent.md'), 'utf8')).toMatch(/^---\nbrainstorm_style: challenger@1\n/);
    expect((await fileHistory(dir, 'docs/intent.md'))[0]?.message).toBe('INT-0001 v1: Create intent');
    expect(store.index.documents('keel')).toHaveLength(1);
  });

  it('numbers folder documents and refuses a second intent or unknown project', async () => {
    const store = await withProject();
    await createDocument(store, 'keel', { ...intent, kind: 'decision' });
    const second = await createDocument(store, 'keel', { ...intent, kind: 'decision' });
    expect(second.ok && second.value.path).toBe('docs/decisions/ADR-0002.md');
    const task = await createDocument(store, 'keel', { ...intent, kind: 'task' });
    expect(task.ok && task.value.header.id).toBe('T1');
    await createDocument(store, 'keel', intent);
    expect(await createDocument(store, 'keel', intent)).toMatchObject({ error: 'already-exists' });
    expect(await createDocument(store, 'nope', intent)).toMatchObject({ error: 'unknown-project' });
  });
});

describe('createDocument options and saveDocument extras', () => {
  it('names folder documents NNNN-<slug>.md, sets a status, and keeps core fields when extras are saved', async () => {
    const store = await withProject();
    const go = await createDocument(store, 'keel', { ...intent, kind: 'decision', status: 'approved', fileSlug: 'go' });
    expect(go).toMatchObject({ ok: true, value: { path: 'docs/decisions/0001-go.md', header: { id: 'ADR-0001', status: 'approved' } } });
    expect(await createDocument(store, 'keel', { ...intent, kind: 'task', id: 'T7' })).toMatchObject({ ok: true, value: { path: 'tasks/T7.md' } });
    expect(await createDocument(store, 'keel', { ...intent, kind: 'task', id: '../T1', status: 'todo' })).toMatchObject({ ok: true, value: { path: 'tasks/T2.md', header: { status: 'todo' } } });
    const bad = await createDocument(store, 'keel', { ...intent, kind: 'decision', fileSlug: '../x' });
    expect(bad.ok && bad.value.path).toBe('docs/decisions/ADR-0002.md');
    const saved = await saveDocument(store, 'keel', 'docs/decisions/0001-go.md', { reason: 'Note', extra: { approvals: [1], id: 'HACK', author: 'Eve' } });
    expect(saved).toMatchObject({ ok: true, value: { header: { approvals: [1], id: 'ADR-0001', author: 'Ada', version: 2 } } });
  });
});

describe('readDocument and saveDocument', () => {
  it('saves the next version with the reason in git and the index', async () => {
    const store = await withProject();
    await createDocument(store, 'keel', intent);
    store.now = () => new Date('2026-11-22T09:00:00Z');
    const saved = await saveDocument(store, 'keel', 'docs/intent.md', { reason: 'Add\n outcome', body: '# New\n', status: 'pending' });
    expect(saved).toMatchObject({ ok: true, value: { body: '# New\n', header: { version: 2, status: 'pending', created: '2026-11-20', updated: '2026-11-22' } } });
    expect(readDocument(store, 'keel', 'docs/intent.md')).toMatchObject({ ok: true, value: { kind: 'intent', header: { version: 2 } } });
    expect(store.index.versions('keel', 'INT-0001').map((v) => v.reason)).toEqual(['Create intent', 'Add outcome']);
  });

  it('reports bad paths, missing files and broken front matter', async () => {
    const store = await withProject();
    expect(readDocument(store, 'keel', '../x.md')).toMatchObject({ error: 'invalid-path' });
    expect(readDocument(store, 'keel', 'docs/spec.md')).toMatchObject({ error: 'not-found' });
    await createDocument(store, 'keel', intent);
    writeFileSync(join(projectDir('keel', store.home), 'docs/intent.md'), 'no header');
    expect(await saveDocument(store, 'keel', 'docs/intent.md', { reason: 'x' })).toMatchObject({ error: 'invalid-front-matter' });
  });
});
