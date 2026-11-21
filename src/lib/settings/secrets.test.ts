import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, workspaceKey } from './secrets';

describe('secrets', () => {
  it('creates one private 32-byte workspace key', () => {
    const home = mkdtempSync(join(tmpdir(), 'keel-key-'));
    const key = workspaceKey(home);
    expect(key).toHaveLength(32);
    expect(workspaceKey(home).equals(key)).toBe(true);
    expect(statSync(join(home, 'secret.key')).mode & 0o777).toBe(0o600);
  });

  it('round-trips a secret without leaving it readable, and rejects tampering or another key', () => {
    const key = workspaceKey(mkdtempSync(join(tmpdir(), 'keel-key-')));
    const sealed = encryptSecret(key, 'sk-test-123');
    expect(sealed).not.toContain('sk-test');
    expect(decryptSecret(key, sealed)).toEqual({ ok: true, value: 'sk-test-123' });
    expect(encryptSecret(key, 'same')).not.toBe(encryptSecret(key, 'same'));
    const [v, iv, tag, data = ''] = sealed.split('.');
    expect(decryptSecret(key, [v, iv, tag, `A${data.slice(1)}`].join('.'))).toMatchObject({ error: 'cannot-decrypt' });
    expect(decryptSecret(workspaceKey(mkdtempSync(join(tmpdir(), 'keel-key-'))), sealed)).toMatchObject({ error: 'cannot-decrypt' });
    expect(decryptSecret(key, 'plain')).toMatchObject({ error: 'cannot-decrypt' });
  });
});
