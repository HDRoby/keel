import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serverStore } from './server-store';

describe('serverStore', () => {
  it('works on the folder Keel was opened on and writes nothing until the index is used', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-srv-'));
    const user = mkdtempSync(join(tmpdir(), 'keel-usr-'));
    const store = serverStore({ KEEL_PROJECT_DIR: root, KEEL_USER_DIR: user });
    expect(store).toMatchObject({ root, user });
    expect(existsSync(join(root, '.keel'))).toBe(false);
    expect(store.index.documents()).toEqual([]);
    expect(existsSync(join(root, '.keel/cache/index.db'))).toBe(true);
  });

  it('reopens the index when the cache folder was removed', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-srv-'));
    const store = serverStore({ KEEL_PROJECT_DIR: root });
    store.index.documents();
    rmSync(join(root, '.keel'), { recursive: true });
    expect(serverStore({ KEEL_PROJECT_DIR: root }).index.documents()).toEqual([]);
    expect(existsSync(join(root, '.keel/cache/index.db'))).toBe(true);
  });
});
