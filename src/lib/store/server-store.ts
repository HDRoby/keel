// One store per server process for the folder Keel was opened on. The index is opened on first use,
// so a folder that is not initialised gets nothing written, and reopened if .keel/cache was removed.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { migrateLegacySettings } from '../settings/migrate';
import { legacyHome, userDir } from '../settings/user-dir';
import { INDEX_FILE, openIndex, type Index, type Store } from './db';
import { rebuildIndex } from './reindex';
import { isInitialised, projectRoot, type Env } from './workspace';

interface Held {
  root: string;
  index?: Index;
  inode?: number;
}

const holder = globalThis as typeof globalThis & { keelHeld?: Held; keelMigrated?: boolean };

function inodeOf(file: string): number | undefined {
  return existsSync(file) ? statSync(file).ino : undefined;
}

/** The project index, opened lazily. A fresh index is rebuilt from git in the background. */
function indexFor(held: Held): Index {
  const file = join(held.root, INDEX_FILE);
  if (held.index && held.inode !== undefined && inodeOf(file) === held.inode) return held.index;
  held.index?.close();
  const fresh = !existsSync(file);
  held.index = openIndex(held.root);
  held.inode = inodeOf(file);
  if (fresh && isInitialised(held.root)) {
    void rebuildIndex({ root: held.root, index: held.index, user: '' }).catch(() => undefined);
  }
  return held.index;
}

/**
 * Moves Keel v0.1 settings once per process, for the real user folder only: a run with KEEL_USER_DIR
 * (tests, a second profile) does not pick up ~/.keel unless KEEL_HOME names it.
 */
function migrateOnce(env: Env): void {
  if (holder.keelMigrated) return;
  holder.keelMigrated = true;
  if (env.KEEL_USER_DIR?.trim() && !env.KEEL_HOME?.trim()) return;
  try {
    migrateLegacySettings(userDir(env), legacyHome(env));
  } catch {
    // An unreadable old workspace is not a reason to stop Keel; the user enters the settings again.
  }
}

export function serverStore(env: Env = process.env): Store {
  const root = projectRoot(env);
  migrateOnce(env);
  if (holder.keelHeld?.root !== root) {
    holder.keelHeld?.index?.close();
    holder.keelHeld = { root };
  }
  const held = holder.keelHeld;
  return {
    root,
    user: userDir(env),
    get index() {
      return indexFor(held);
    },
  };
}
