// One-off move of Keel v0.1 settings from ~/.keel/keel.db into the user config folder (ADR-0011, R2).
// Keys are decrypted with the old ~/.keel/secret.key and encrypted again with the user folder's key.
// Only names are logged, never values.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { decryptSecret, encryptSecret, workspaceKey } from './secrets';
import { SETTINGS_FILE, writeUserSettings } from './user-dir';

export interface Migration {
  moved: string[];     // setting names, e.g. "provider.anthropic"
  dropped: string[];   // names whose key could not be decrypted; the user enters them again
}

function oldKey(home: string): Buffer | undefined {
  const file = join(home, 'secret.key');
  return existsSync(file) ? Buffer.from(readFileSync(file, 'utf8').trim(), 'base64') : undefined;
}

function reseal(sealed: unknown, from: Buffer | undefined, to: () => Buffer): string | undefined {
  if (typeof sealed !== 'string' || !sealed || !from) return undefined;
  const plain = decryptSecret(from, sealed);
  return plain.ok ? encryptSecret(to(), plain.value) : undefined;
}

/**
 * Copies provider settings, models per task and the GitHub token from `legacy`/keel.db to `user`/settings.json,
 * only when settings.json does not exist yet. Returns undefined when there was nothing to move.
 */
export function migrateLegacySettings(user: string, legacy: string, log: (line: string) => void = console.log): Migration | undefined {
  const db = join(legacy, 'keel.db');
  if (existsSync(join(user, SETTINGS_FILE)) || !existsSync(db)) return undefined;
  let rows: { key: string; value: string }[];
  try {
    const conn = new Database(db, { readonly: true, fileMustExist: true });
    try {
      rows = conn.prepare('SELECT key, value FROM settings ORDER BY key').all() as { key: string; value: string }[];
    } finally {
      conn.close();
    }
  } catch {
    return undefined;   // no settings table: nothing to move
  }
  const from = oldKey(legacy);
  const to = () => workspaceKey(user);
  const settings: Record<string, unknown> = {};
  const result: Migration = { moved: [], dropped: [] };
  for (const { key, value } of rows) {
    if (key === 'github.token') {
      const sealed = reseal(value, from, to);
      if (sealed) settings[key] = sealed;
      (sealed ? result.moved : result.dropped).push(key);
      continue;
    }
    if (!/^(provider|model)\.[a-z-]+$/.test(key)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const entry = { ...(parsed as Record<string, unknown>) };
    if ('apiKey' in entry) {
      const sealed = reseal(entry.apiKey, from, to);
      if (sealed) entry.apiKey = sealed;
      else {
        delete entry.apiKey;
        result.dropped.push(key);
      }
    }
    settings[key] = entry;
    result.moved.push(key);
  }
  if (result.moved.length === 0) return undefined;
  writeUserSettings(user, settings);
  log(`Moved settings from ${legacy} to ${user}: ${result.moved.join(', ')}${result.dropped.length ? ` (enter again: ${result.dropped.join(', ')})` : ''}`);
  return result;
}
