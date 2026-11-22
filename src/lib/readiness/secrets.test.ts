import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSecrets, mayHoldKeys, secretByName, secretFields } from './secrets';

// Made up for the test.
const VALUE = 'made-up-value-0123456789';

describe('secret patterns', () => {
  it('knows secret files by name, but not examples', () => {
    expect(['.env', '.env.local', 'config/server.pem', 'tls.key', 'id_rsa', 'id_ed25519.pub', 'credentials-prod.json'].map(secretByName)).toEqual([true, true, true, true, true, true, true]);
    expect(['.env.example', '.env.sample', 'env.ts', 'keys.md', 'credentials.md'].map(secretByName)).toEqual([false, false, false, false, false]);
    expect(['.cursor/mcp.json', '.npmrc', 'package.json'].map(mayHoldKeys)).toEqual([true, true, false]);
  });

  it('finds key-like fields with a literal value in JSON, YAML and TOML, and skips references and placeholders', () => {
    expect(secretFields(`{ "env": { "apiKey": "${VALUE}" } }`)).toEqual(['apiKey']);
    expect(secretFields(`github_token: ${VALUE}\npassword: \${DB_PASSWORD}\nsecret: ""`)).toEqual(['github_token']);
    expect(secretFields(`client_secret = "${VALUE}"\napi_key = "<your key>"\ntoken = "changeme"`)).toEqual(['client_secret']);
    expect(secretFields('{ "tokenizer": { "type": "bpe" }, "passwordRules": true }')).toEqual([]);
  });

  it('returns the file and the field name, never the value', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-secrets-'));
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', 'app.yml'), `name: app\napiKey: ${VALUE}\n`);
    writeFileSync(join(root, '.env'), `TOKEN=${VALUE}\n`);
    writeFileSync(join(root, 'package-lock.json'), `{ "token": "${VALUE}" }`);
    const hits = findSecrets(root, ['config/app.yml', '.env', 'package-lock.json']);
    expect(hits).toEqual([{ path: 'config/app.yml', field: 'apiKey' }, { path: '.env' }]);
    expect(JSON.stringify(hits)).not.toContain(VALUE);
  });
});
