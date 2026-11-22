// Test helper: a throwaway project folder (not yet a git repository), user folder and in-memory index.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openIndex, type Store } from './db';

export function tempStore(date = '2026-11-20'): Store {
  const root = mkdtempSync(join(tmpdir(), 'keel-test-'));
  const user = mkdtempSync(join(tmpdir(), 'keel-user-'));
  return { root, user, index: openIndex(root, ':memory:'), now: () => new Date(`${date}T12:00:00Z`) };
}
