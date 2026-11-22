import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitFiles } from '../store/git';
import { currentBranch, githubRepoOf, push, remoteLabel, remoteOf } from '../store/remote';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { githubToken, hasGithubToken, looksLikeGithubToken, saveGithubToken } from './auth';
import { cleanError } from './push';

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function bare(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'keel-remote-')), 'repo.git');
  execFileSync('git', ['init', '-q', '--bare', '--initial-branch=main', dir]);
  return dir;
}

describe('GitHub token (CI results only)', () => {
  it('stores a GitHub token encrypted, and refuses anything else', () => {
    const store = tempStore();
    const token = `github_pat_${'A'.repeat(40)}`;
    expect(looksLikeGithubToken(token)).toBe(true);
    expect(saveGithubToken(store, 'sk-ant-nope')).toMatchObject({ error: 'invalid-token' });
    expect(saveGithubToken(store, token)).toEqual({ ok: true, value: { hasToken: true } });
    expect(readFileSync(join(store.user, 'settings.json'), 'utf8')).not.toContain('github_pat_');
    expect(githubToken(store)).toBe(token);
    saveGithubToken(store, '');
    expect(hasGithubToken(store)).toBe(false);
    expect(githubToken(store)).toBeUndefined();
  });
});

describe('cleanError', () => {
  it('shows only the first line of a git error, with tokens, headers and URL credentials hidden', () => {
    const token = `github_pat_${'E'.repeat(40)}`;
    expect(cleanError(new Error(`\nfatal: bad ${token}\nmore`), token)).toBe('fatal: bad ***');
    expect(cleanError('AUTHORIZATION: basic eHl6 rejected')).toBe('AUTHORIZATION: *** rejected');
    expect(cleanError('fatal: https://user:pass@example.com/x.git not found')).toBe('fatal: https://***@example.com/x.git not found');
    expect(cleanError(new Error(''))).toBe('git failed');
    expect(cleanError('x'.repeat(400))).toHaveLength(300);
  });
});

describe('the folder\'s remote', () => {
  it('reads origin without credentials, and recognises GitHub', async () => {
    expect(githubRepoOf('https://github.com/acme/demo.git')).toBe('acme/demo');
    expect(githubRepoOf('git@github.com:acme/demo.git')).toBe('acme/demo');
    expect(githubRepoOf('https://evil.example/acme/demo')).toBeUndefined();
    const store = tempStore();
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    expect(await remoteOf(store.root)).toBeUndefined();
    sh(store.root, 'remote', 'add', 'origin', 'https://someone:secret@github.com/acme/demo.git');
    const remote = await remoteOf(store.root);
    expect(remote).toEqual({ url: 'https://github.com/acme/demo.git', github: 'acme/demo' });
    expect(remote && remoteLabel(remote)).toBe('github.com/acme/demo');
    expect(await currentBranch(store.root)).toBe('main');
  });

  it('pushes HEAD to origin with git\'s own credentials, and says so when there is no remote', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    expect(await push(store.root)).toMatchObject({ error: 'no-remote', message: 'This folder has no remote called origin. Push from your terminal when you are ready.' });
    const remote = bare();
    sh(store.root, 'remote', 'add', 'origin', remote);
    writeFileSync(join(store.root, 'AGENTS.md'), '# Agents\n');
    await commitFiles(store.root, ['AGENTS.md'], 'Handoff for plan v1');
    expect(await push(store.root)).toEqual({ ok: true, value: { remote, branch: 'main' } });
    expect(sh(remote, 'log', '--format=%an|%s', 'main')).toBe('Keel|Keel: Handoff for plan v1\nKeel|Keel: Initialise project');
    const missing = tempStore();
    await initialiseProject(missing, { title: 'Demo', author: 'Ada' });
    sh(missing.root, 'remote', 'add', 'origin', join(tmpdir(), 'no-such-remote-for-keel.git'));
    expect(await push(missing.root)).toMatchObject({ error: 'push-failed', message: expect.stringMatching(/^The push failed: (fatal|error): /) });
  });
});
