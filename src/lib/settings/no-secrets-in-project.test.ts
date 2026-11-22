// Security baseline v2 and ADR-0011: keys saved through Settings never land in the project folder.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveGithubToken } from '../github/auth';
import { createDocument, saveDocument } from '../store/documents';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { providerConfig, saveProvider } from './settings';

// Made up for the test.
const ANTHROPIC = 'sk-ant-api03-scan-test-0123456789abcdefghij';
const OPENAI = 'sk-proj-scan-test-0123456789abcdefghijkl';
const GITHUB = `ghp_${'Z'.repeat(36)}`;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('no secrets in the project folder', () => {
  it('keeps keys saved in Settings out of every file in the project, .keel and .git included', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Scan', author: 'Ada', standards: ['security-baseline@2'] });
    saveProvider(store, 'anthropic', { apiKey: ANTHROPIC });
    saveProvider(store, 'openai', { apiKey: OPENAI });
    expect(saveGithubToken(store, GITHUB).ok).toBe(true);
    await createDocument(store, { kind: 'intent', title: 'Scan', body: '# Intent\n', template: 'standard-intent@3' });
    await saveDocument(store, 'docs/intent.md', { reason: 'Edit', body: '# Intent\n\nMore.\n' });
    store.index.upsertDocument({ kind: 'intent', path: 'docs/intent.md', body: '', header: { id: 'INT-0001', project: 'PRJ-0001', title: 'Scan', author: 'Ada', created: '2026-11-20', updated: '2026-11-20', status: 'draft', version: 2, template: 'standard-intent@3' } });

    const found = filesUnder(store.root).flatMap((file) => {
      const text = readFileSync(file).toString('latin1');
      return [ANTHROPIC, OPENAI, GITHUB].some((k) => text.includes(k)) || /sk-(ant|proj)-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{30,}/.test(text) ? [file] : [];
    });
    expect(found).toEqual([]);
    expect(providerConfig(store, 'anthropic')).toMatchObject({ ok: true, value: { apiKey: ANTHROPIC } });
    expect(readFileSync(join(store.user, 'settings.json'), 'utf8')).not.toContain(ANTHROPIC);
  });
});
