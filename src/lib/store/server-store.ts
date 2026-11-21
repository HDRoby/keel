// One store per server process, reused across requests and hot reloads.
import { openIndex, type Store } from './db';
import { keelHome, type Env } from './workspace';

const holder = globalThis as typeof globalThis & { keelStore?: Store };

export function serverStore(env: Env = process.env): Store {
  const home = keelHome(env);
  if (holder.keelStore?.home !== home) holder.keelStore = { home, index: openIndex(home) };
  return holder.keelStore;
}
