import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serverStore } from './server-store';

describe('serverStore', () => {
  it('reuses one store per workspace folder', () => {
    const a = mkdtempSync(join(tmpdir(), 'keel-srv-'));
    const b = mkdtempSync(join(tmpdir(), 'keel-srv-'));
    const first = serverStore({ KEEL_HOME: a });
    expect(serverStore({ KEEL_HOME: a })).toBe(first);
    expect(serverStore({ KEEL_HOME: b }).home).toBe(b);
  });
});
