// Test helper: a throwaway project folder (not yet a git repository), user folder and in-memory index.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Store } from './store';

export function tempStore(date = '2026-11-20'): Store {
  const root = mkdtempSync(join(tmpdir(), 'keel-test-'));
  const user = mkdtempSync(join(tmpdir(), 'keel-user-'));
  return { root, user, now: () => new Date(`${date}T12:00:00Z`) };
}
