// The user config folder: personal settings and secrets, never inside a project folder (ADR-0011).
// This is the only place Keel reads the home folder.
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from '../store/atomic';

export type Env = Record<string, string | undefined>;

export const SETTINGS_FILE = 'settings.json';

/** KEEL_USER_DIR, else $XDG_CONFIG_HOME/keel, else ~/.config/keel. */
export function userDir(env: Env = process.env): string {
  const given = env.KEEL_USER_DIR?.trim();
  if (given) return given;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return join(xdg || join(homedir(), '.config'), 'keel');
}

/** Where Keel v0.1 kept its workspace, for the one-off settings migration and `keel import`. */
export function legacyHome(env: Env = process.env): string {
  return env.KEEL_HOME?.trim() || join(homedir(), '.keel');
}

/**
 * Whether to move Keel v0.1 settings into the user folder: for the real user folder only. A run with
 * KEEL_USER_DIR (tests, a second profile) does not pick up ~/.keel unless KEEL_HOME names it.
 */
export function migratesLegacy(env: Env = process.env): boolean {
  return !env.KEEL_USER_DIR?.trim() || Boolean(env.KEEL_HOME?.trim());
}

const tilde = (path: string) => (process.env.HOME && path.startsWith(process.env.HOME) ? `~${path.slice(process.env.HOME.length)}` : path);

/**
 * Why Keel cannot keep its settings in this folder, or undefined when it can: the folder (or, before it exists, the
 * nearest folder above it) must be writable by the user running Keel. Says which folder blocks it and how to fix it.
 */
export function userDirProblem(dir: string): { message: string; fix: string } | undefined {
  let at = dir;
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  try {
    accessSync(at, constants.W_OK | constants.X_OK);
    return undefined;
  } catch {
    let owner = '';
    try {
      const uid = statSync(at).uid;
      owner = uid === 0 ? ' (it is owned by root)' : process.getuid && uid !== process.getuid() ? ' (it is owned by another user)' : '';
    } catch { /* unknown */ }
    const blocked = at === dir ? `${tilde(dir)} is not writable by you${owner}` : `${tilde(at)} is not writable by you${owner}, so ${tilde(dir)} cannot be created`;
    return {
      message: `Keel cannot save your settings: ${blocked}.`,
      fix: `Fix: make it yours (sudo chown "$USER" ${tilde(at)}), or start Keel with KEEL_USER_DIR set to a folder you own.`,
    };
  }
}

/** Creates the folder, owner only. Says which folder blocks it instead of a bare permission error. */
export function ensureUserDir(dir: string): string {
  if (existsSync(dir)) return dir;
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    const problem = userDirProblem(dir);
    if (problem) throw new Error(`${problem.message} ${problem.fix}`);
    throw error;
  }
  return dir;
}

/** settings.json as an object; missing or unreadable gives {}. */
export function readUserSettings(dir: string): Record<string, unknown> {
  const file = join(dir, SETTINGS_FILE);
  if (!existsSync(file)) return {};
  try {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Writes settings.json atomically, owner read and write only. */
export function writeUserSettings(dir: string, data: Record<string, unknown>): void {
  ensureUserDir(dir);
  const file = join(dir, SETTINGS_FILE);
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
  chmodSync(file, 0o600);
}

/** One top-level value of settings.json. */
export function userSetting(dir: string, key: string): unknown {
  return readUserSettings(dir)[key];
}

/** Sets (or, with undefined, removes) one top-level value of settings.json. */
export function setUserSetting(dir: string, key: string, value: unknown): void {
  const data = readUserSettings(dir);
  if (value === undefined) delete data[key];
  else data[key] = value;
  writeUserSettings(dir, data);
}
