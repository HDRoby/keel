import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serverStore } from './server-store';

describe('serverStore', () => {
  it('works on the folder Keel was opened on and writes nothing to it', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-srv-'));
    const user = mkdtempSync(join(tmpdir(), 'keel-usr-'));
    expect(serverStore({ KEEL_PROJECT_DIR: root, KEEL_USER_DIR: user })).toEqual({ root, user });
    expect(existsSync(join(root, '.keel'))).toBe(false);
  });
});
