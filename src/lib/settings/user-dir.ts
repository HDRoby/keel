// The user config folder: personal settings and secrets, never inside a project folder (ADR-0011).
// This is the only place Keel reads the home folder.
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

/** Creates the folder, owner only. */
export function ensureUserDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
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
