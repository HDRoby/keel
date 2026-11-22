import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { encryptSecret, workspaceKey } from './secrets';
import { migrateLegacySettings } from './migrate';
import { modelChoice, providerConfig } from './settings';
import { githubToken } from '../github/auth';
import { openIndex } from '../store/db';

function legacyWorkspace(rows: [string, string][]): string {
  const home = mkdtempSync(join(tmpdir(), 'keel-legacy-'));
  const db = new Database(join(home, 'keel.db'));
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  rows.forEach(([k, v]) => db.prepare('INSERT INTO settings VALUES (?, ?)').run(k, v));
  db.close();
  return home;
}

describe('migrateLegacySettings', () => {
  it('moves providers, models and the GitHub token, re-encrypting keys, and logs names only', () => {
    const home = legacyWorkspace([]);
    const old = workspaceKey(home);   // the old secret.key sits next to keel.db
    const db = new Database(join(home, 'keel.db'));
    const add = db.prepare('INSERT INTO settings VALUES (?, ?)');
    add.run('provider.anthropic', JSON.stringify({ apiKey: encryptSecret(old, 'sk-ant-old-0123456789') }));
    add.run('provider.openai-compatible', JSON.stringify({ baseUrl: 'http://localhost:11434/v1' }));
    add.run('model.brainstorm', JSON.stringify({ provider: 'openai-compatible', model: 'gemma4:latest' }));
    add.run('github.token', encryptSecret(old, `github_pat_${'A'.repeat(40)}`));
    db.close();

    const user = join(mkdtempSync(join(tmpdir(), 'keel-user-')), 'keel');
    const lines: string[] = [];
    const moved = migrateLegacySettings(user, home, (l) => lines.push(l));
    expect(moved).toEqual({ moved: ['github.token', 'model.brainstorm', 'provider.anthropic', 'provider.openai-compatible'], dropped: [] });
    const store = { root: '/unused', user, index: openIndex('/unused', ':memory:') };
    expect(providerConfig(store, 'anthropic')).toEqual({ ok: true, value: { apiKey: 'sk-ant-old-0123456789' } });
    expect(modelChoice(store, 'brainstorm')).toEqual({ provider: 'openai-compatible', model: 'gemma4:latest' });
    expect(githubToken(store)).toBe(`github_pat_${'A'.repeat(40)}`);
    const text = readFileSync(join(user, 'settings.json'), 'utf8');
    expect(text).not.toContain('sk-ant-old');
    expect(lines.join('\n')).not.toContain('sk-ant-old');
    expect(lines[0]).toMatch(/^Moved settings from /);
    expect(migrateLegacySettings(user, home)).toBeUndefined();
  });

  it('drops keys it cannot decrypt and does nothing without an old workspace', () => {
    const home = legacyWorkspace([['provider.openai', JSON.stringify({ apiKey: 'v1.x.y.z' })]]);
    const user = mkdtempSync(join(tmpdir(), 'keel-user-'));
    expect(migrateLegacySettings(user, home, () => undefined)).toEqual({ moved: ['provider.openai'], dropped: ['provider.openai'] });
    expect(migrateLegacySettings(mkdtempSync(join(tmpdir(), 'keel-user-')), mkdtempSync(join(tmpdir(), 'none-')))).toBeUndefined();
  });
});
