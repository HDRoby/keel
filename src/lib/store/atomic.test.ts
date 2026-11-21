import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic } from './atomic';

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temporary file behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-atomic-'));
    const file = join(dir, 'a.md');
    writeFileAtomic(file, 'one');
    writeFileAtomic(file, 'two');
    expect(readFileSync(file, 'utf8')).toBe('two');
    expect(readdirSync(dir)).toEqual(['a.md']);
  });
});
