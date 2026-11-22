import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempStore } from '../store/test-store';
import { initialiseProject } from '../store/workspace';
import { githubToken, hasGithubToken, looksLikeGithubToken, saveGithubToken } from './auth';
import { checkTarget, cleanError, gitEnv, handoffDir, handoffGit, parseGithubRepo, pushHandoff, remoteUrl, repositoryOf } from './push';

const LOCAL = { KEEL_ALLOW_LOCAL_REMOTES: '1' };
const enc = (s: string) => new TextEncoder().encode(s);
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function bare(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'keel-remote-')), 'repo.git');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', dir]);
  return dir;
}

describe('GitHub token', () => {
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

describe('targets', () => {
  it('reads owner/name and GitHub URLs, and allows local folders only for tests', () => {
    expect(parseGithubRepo('my-org/keel')).toBe('my-org/keel');
    expect(parseGithubRepo('https://github.com/my-org/keel.git')).toBe('my-org/keel');
    expect(parseGithubRepo('../etc/passwd')).toBeUndefined();
    expect(parseGithubRepo('https://evil.example/my-org/keel')).toBeUndefined();
    expect(checkTarget({ kind: 'github', repo: 'a/b', branch: 'main' })).toMatchObject({ ok: true });
    expect(checkTarget({ kind: 'github', repo: 'a/b', branch: '../x' })).toMatchObject({ error: 'invalid-target' });
    expect(checkTarget({ kind: 'local', path: '/tmp/x', branch: 'main' }, {})).toMatchObject({ error: 'not-allowed' });
    expect(checkTarget({ kind: 'local', path: 'relative', branch: 'main' }, LOCAL)).toMatchObject({ error: 'invalid-target' });
  });
});

describe('git helpers', () => {
  it('builds the remote URL without a token, and keeps the working copy in .keel/cache/handoff', () => {
    expect(remoteUrl({ kind: 'github', location: 'my-org/keel' })).toBe('https://github.com/my-org/keel.git');
    expect(remoteUrl({ kind: 'local', location: '/tmp/repo.git' })).toBe('/tmp/repo.git');
    const store = tempStore();
    expect(handoffDir(store)).toBe(join(store.root, '.keel', 'cache', 'handoff'));
  });

  it('shows only the first line of a git error, with the token and the header hidden', () => {
    const token = `github_pat_${'E'.repeat(40)}`;
    expect(cleanError(new Error(`\nfatal: bad ${token}\nmore`), token)).toBe('fatal: bad ***');
    expect(cleanError('AUTHORIZATION: basic eHl6 rejected')).toBe('AUTHORIZATION: *** rejected');
    expect(cleanError(new Error(''))).toBe('git failed');
    expect(cleanError('x'.repeat(400))).toHaveLength(300);
  });
});

describe('pushHandoff', () => {
  it('pushes the package as a Keel commit, keeps files the agent added on the next push, and records each push', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    const remote = bare();
    const target = { kind: 'local' as const, path: remote, branch: 'main' };
    const first = await pushHandoff(store, target, [{ path: 'AGENTS.md', data: enc('v1') }, { path: 'docs/plan.md', data: enc('plan v1') }], 'PLN-0001@1', { env: LOCAL });
    if (!first.ok) throw new Error(first.message);
    expect(sh(remote, 'log', '--format=%an|%s', 'main')).toBe('Keel|Keel: handoff from PLN-0001@1');

    // The coding agent clones, adds code and pushes.
    const agent = mkdtempSync(join(tmpdir(), 'keel-agent-'));
    execFileSync('git', ['clone', '-q', remote, agent]);
    execFileSync('bash', ['-c', 'mkdir -p src && echo code > src/app.ts && git add -A && git -c user.name=Agent -c user.email=a@b commit -qm "Add app"'], { cwd: agent });
    sh(agent, 'push', '-q', 'origin', 'main');

    // With a token set, the same push still works (the header only applies to github.com).
    const second = await pushHandoff(store, target, [{ path: 'AGENTS.md', data: enc('v2') }], 'PLN-0001@2', { env: LOCAL, token: `github_pat_${'D'.repeat(40)}` });
    if (!second.ok) throw new Error(second.message);
    sh(agent, 'pull', '-q');
    expect(readFileSync(join(agent, 'AGENTS.md'), 'utf8')).toBe('v2');
    expect(readFileSync(join(agent, 'src/app.ts'), 'utf8')).toBe('code\n');
    expect(sh(remote, 'log', '--format=%s', 'main').split('\n')).toEqual(['Keel: handoff from PLN-0001@2', 'Add app', 'Keel: handoff from PLN-0001@1']);
    expect(repositoryOf(store)).toMatchObject({ kind: 'local', location: remote, branch: 'main', pushes: [{ plan: 'PLN-0001@1' }, { plan: 'PLN-0001@2', commit: second.value.commit }] });
    // Pushing the same package again changes nothing and records nothing.
    const again = await pushHandoff(store, target, [{ path: 'AGENTS.md', data: enc('v2') }], 'PLN-0001@2', { env: LOCAL });
    expect(again).toMatchObject({ ok: true, value: { unchanged: true, commit: second.value.commit } });
    expect(repositoryOf(store)?.pushes).toHaveLength(2);
    expect(sh(store.root, 'log', '-1', '--format=%s')).toMatch(/^Keel: pushed PLN-0001@2 to /);
  });

  it('needs a token for GitHub, and never writes the token into the working copy', async () => {
    const store = tempStore();
    await initialiseProject(store, { title: 'Demo', author: 'Ada' });
    expect(await pushHandoff(store, { kind: 'github', repo: 'a/b', branch: 'main' }, [], 'PLN-0001@1')).toMatchObject({ error: 'no-token' });
    const token = `github_pat_${'B'.repeat(40)}`;
    const failed = await pushHandoff(store, { kind: 'local', path: join(tmpdir(), 'missing-remote-for-keel.git'), branch: 'main' }, [{ path: 'a.md', data: enc('x') }], 'PLN-0001@1', { token, env: LOCAL });
    expect(failed).toMatchObject({ ok: false, error: 'push-failed' });
    expect(failed.ok ? '' : failed.message).not.toMatch(/environment guard|not permitted/);
    expect(failed.ok ? '' : failed.message).not.toContain(token);
    const config = readFileSync(join(store.root, '.keel', 'cache', 'handoff', '.git', 'config'), 'utf8');
    expect(config).not.toContain(token);
    expect(config).not.toContain('extraheader');
  });

  it('gives git the token as a github.com header through the environment only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-env-'));
    execFileSync('git', ['init', '-q', dir]);
    const token = `github_pat_${'C'.repeat(40)}`;
    const header = (await handoffGit(dir, token).raw(['config', '--get', 'http.https://github.com/.extraheader'])).trim();
    expect(Buffer.from(header.replace('AUTHORIZATION: basic ', ''), 'base64').toString()).toBe(`x-access-token:${token}`);
    expect(readFileSync(join(dir, '.git', 'config'), 'utf8')).not.toContain('extraheader');
    expect(Object.keys(gitEnv())).toEqual(['PATH', 'HOME', 'GIT_TERMINAL_PROMPT']);
  });
});
