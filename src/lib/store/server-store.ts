// The store for the folder Keel was opened on. Versions and history come from git (ADR-0017), so there is nothing to open.
import { userDir } from '../settings/user-dir';
import { type Store } from './store';
import { projectRoot, type Env } from './workspace';

export function serverStore(env: Env = process.env): Store {
  return { root: projectRoot(env), user: userDir(env) };
}
