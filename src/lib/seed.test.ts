import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureSeed } from './seed';
import { tempStore } from './store/test-store';

describe('ensureSeed', () => {
  it('loads templates and styles and reports no problems', () => {
    const { home } = tempStore();
    expect(ensureSeed(home, join(process.cwd(), 'seed'))).toEqual([]);
    expect(existsSync(join(home, 'templates', 'standard-intent@3.md'))).toBe(true);
    expect(existsSync(join(home, 'styles', 'challenger@1.md'))).toBe(true);
  });
});
