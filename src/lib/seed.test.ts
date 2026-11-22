import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureSeed, previewRoot } from './seed';
import { tempStore } from './store/test-store';

describe('ensureSeed', () => {
  it('loads templates and styles and reports no problems', () => {
    const { root: home } = tempStore();
    expect(ensureSeed(home, join(process.cwd(), 'seed'))).toEqual([]);
    expect(existsSync(join(home, '.keel', 'templates', 'standard-intent@3.md'))).toBe(true);
    expect(existsSync(join(home, '.keel', 'agent-kit'))).toBe(true);
    expect(existsSync(join(home, '.keel', 'styles', 'challenger@1.md'))).toBe(true);
  });

  it('offers the seed library before a folder has .keel', () => {
    const root = previewRoot(join(process.cwd(), 'seed'));
    expect(existsSync(join(root, '.keel', 'templates', 'standard-intent@3.md'))).toBe(true);
    expect(previewRoot(join(process.cwd(), 'seed'))).toBe(root);
  });
});
