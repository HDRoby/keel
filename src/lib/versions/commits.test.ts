import { describe, expect, it } from 'vitest';
import { versionFromCommit } from './commits';

describe('versionFromCommit', () => {
  it('reads store commit messages and ignores others', () => {
    expect(versionFromCommit({ hash: 'h', date: '2026-11-20T10:00:00+01:00', message: 'INT-0001 v2: Add outcome' }))
      .toEqual({ id: 'INT-0001', version: 2, commit: 'h', date: '2026-11-20', reason: 'Add outcome' });
    expect(versionFromCommit({ hash: 'h', date: '', message: 'Agent edit' })).toBeUndefined();
  });
});
