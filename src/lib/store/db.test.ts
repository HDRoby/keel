import { describe, expect, it } from 'vitest';
import { openIndex } from './db';

const doc = {
  kind: 'intent' as const,
  path: 'docs/intent.md',
  body: '',
  header: {
    id: 'INT-0001', project: 'PRJ-0001', title: 'Keel', author: 'Ada',
    created: '2026-11-20', updated: '2026-11-21', status: 'draft' as const, version: 2, template: 'standard-intent@3',
  },
};

describe('index', () => {
  it('stores documents and versions, and clears them', () => {
    const index = openIndex('/unused', ':memory:');
    index.upsertDocument(doc);
    index.upsertDocument(doc);
    index.addVersion({ id: 'INT-0001', version: 1, commit: 'abc', date: '2026-11-20', reason: 'Create intent' });
    expect(index.documents()).toEqual([
      { path: 'docs/intent.md', id: 'INT-0001', kind: 'intent', title: 'Keel', status: 'draft', version: 2, updated: '2026-11-21' },
    ]);
    expect(index.versions('INT-0001')[0]).toMatchObject({ commit: 'abc', reason: 'Create intent' });
    index.transaction(() => index.clear());
    expect(index.documents()).toEqual([]);
    index.close();
  });
});
