// One store per server process for the folder Keel was opened on. The index is opened on first use,
// so a folder that is not initialised gets nothing written, and reopened if .keel/cache was removed.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { userDir } from '../settings/user-dir';
import { INDEX_FILE, openIndex, type Index, type Store } from './db';
import { rebuildIndex } from './reindex';
import { isInitialised, projectRoot, type Env } from './workspace';

interface Held {
  root: string;
  index?: Index;
  inode?: number;
}

const holder = globalThis as typeof globalThis & { keelHeld?: Held };

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

export function serverStore(env: Env = process.env): Store {
  const root = projectRoot(env);
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
