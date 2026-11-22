import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openIndex } from './db';
import { createDocument, saveDocument } from './documents';
import { rebuildIndex, versionFromCommit } from './reindex';
import { tempStore } from './test-store';
import { initialiseProject } from './workspace';

describe('versionFromCommit', () => {
  it('reads store commit messages and ignores others', () => {
    expect(versionFromCommit({ hash: 'h', date: '2026-11-20T10:00:00+01:00', message: 'INT-0001 v2: Add outcome' }))
      .toEqual({ id: 'INT-0001', version: 2, commit: 'h', date: '2026-11-20', reason: 'Add outcome' });
    expect(versionFromCommit({ hash: 'h', date: '', message: 'Agent edit' })).toBeUndefined();
  });
});

describe('rebuildIndex', () => {
  it('rebuilds an empty index from git and reports unreadable documents', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Keel', author: 'Ada' });
    await createDocument(store, { kind: 'intent', title: 'Keel', body: 'x', template: 't@1' });
    await saveDocument(store, 'docs/intent.md', { reason: 'Edit' });
    await saveDocument(store, 'docs/intent.md', { reason: 'Approved', status: 'approved', sameVersion: true });
    await createDocument(store, { kind: 'task', title: 'T', body: 'x', template: 't@1' });
    writeFileSync(join(store.root, 'docs/spec.md'), 'no header');

    const fresh = { ...store, index: openIndex(store.root, ':memory:') };
    const report = await rebuildIndex(fresh);
    expect(report).toMatchObject({ documents: 2, versions: 3 });
    expect(report.skipped[0]).toMatch(/^docs\/spec\.md:/);
    expect(fresh.index.documents()).toEqual(store.index.documents());
    expect(fresh.index.versions('INT-0001').map((v) => [v.version, v.reason])).toEqual([[1, 'Create intent'], [2, 'Edit']]);
  });
});
