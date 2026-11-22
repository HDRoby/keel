// Loads the seed library (templates, agent kit, brainstorm styles, standards) into a project's .keel/.
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureStyles } from './brainstorm/styles';
import { ensureStandards } from './standards/library';
import { ensureLibrary, seedDir } from './templates/library';

export function ensureSeed(root: string, seed: string = seedDir()): string[] {
  return [ensureLibrary(root, seed), ensureStyles(root, seed), ensureStandards(root, seed)].flatMap((r) => (r.ok ? [] : [r.message]));
}

const cache = globalThis as typeof globalThis & { keelPreview?: Record<string, string> };

/**
 * A scratch folder holding the seed library in its own .keel/, so the Initialise screen can offer the
 * templates, styles and standards before the project's .keel/ exists. Made once per seed folder and process.
 */
export function previewRoot(seed: string = seedDir()): string {
  cache.keelPreview ??= {};
  const known = cache.keelPreview[seed];
  if (known && existsSync(join(known, '.keel'))) return known;
  const root = mkdtempSync(join(tmpdir(), 'keel-seed-'));
  ensureSeed(root, seed);
  cache.keelPreview[seed] = root;
  return root;
}
