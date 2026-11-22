// Encrypts credentials at rest with AES-256-GCM (Security baseline v2, rule 2).
// The key lives in the user config folder's secret.key (owner read/write only), never in a project, git or logs.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from '../result';

const KEY_FILE = 'secret.key';

/** Reads the user's key, creating it on first use. */
export function workspaceKey(dir: string): Buffer {
  const file = join(dir, KEY_FILE);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  }
  chmodSync(file, 0o600);
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64. */
export function encryptSecret(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', ...[iv, cipher.getAuthTag(), data].map((part) => part.toString('base64'))].join('.');
}

export function decryptSecret(key: Buffer, sealed: string): Result<string, 'cannot-decrypt'> {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) return fail('cannot-decrypt', 'Unknown secret format');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return ok(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    return fail('cannot-decrypt', 'The stored secret cannot be decrypted with this workspace key');
  }
}
