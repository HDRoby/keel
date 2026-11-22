import { chmodSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveExploreTiming } from './settings';
import { ensureUserDir, userDirProblem } from './user-dir';

const locked: string[] = [];
/** A folder the user cannot write to, like a ~/.config owned by root. */
function lockedFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'keel-locked-'));
  chmodSync(dir, 0o500);
  locked.push(dir);
  return dir;
}
afterEach(() => { for (const dir of locked.splice(0)) chmodSync(dir, 0o700); });

describe('the user config folder', () => {
  it('is fine when it, or the folder above it, is writable', () => {
    const base = mkdtempSync(join(tmpdir(), 'keel-ok-'));
    expect(userDirProblem(join(base, 'keel'))).toBeUndefined();
    mkdirSync(join(base, 'keel'));
    expect(userDirProblem(join(base, 'keel'))).toBeUndefined();
  });

  it('names the folder that blocks it and how to fix it, instead of a bare permission error', () => {
    const config = lockedFolder();
    const dir = join(config, 'keel');
    const problem = userDirProblem(dir);
    expect(problem?.message).toBe(`Keel cannot save your settings: ${config} is not writable by you, so ${dir} cannot be created.`);
    expect(problem?.fix).toBe(`Fix: make it yours (sudo chown "$USER" ${config}), or start Keel with KEEL_USER_DIR set to a folder you own.`);
    expect(() => ensureUserDir(dir)).toThrow(`Keel cannot save your settings: ${config} is not writable by you`);
    expect(() => saveExploreTiming({ user: dir }, { pauseSeconds: 5, intervalSeconds: 10 })).toThrow('KEEL_USER_DIR');
    expect(existsSync(dir)).toBe(false);
  });
});
