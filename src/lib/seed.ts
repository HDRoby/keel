// Loads the seed library (templates, agent kit, brainstorm styles, standards) into a new workspace.
import { ensureStyles } from './brainstorm/styles';
import { ensureStandards } from './standards/library';
import { ensureLibrary, seedDir } from './templates/library';

export function ensureSeed(home: string, seed: string = seedDir()): string[] {
  return [ensureLibrary(home, seed), ensureStyles(home, seed), ensureStandards(home, seed)].flatMap((r) => (r.ok ? [] : [r.message]));
}
