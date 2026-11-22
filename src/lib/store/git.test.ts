import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simpleGit } from 'simple-git';
import { existsSync } from 'node:fs';
import { commitBlocker, commitFiles, commitSquashing, fileAt, fileHistory, gitUserName, initRepo, keelVersionOf, RepoBusyError, removeFiles } from './git';
import { execFileSync } from 'node:child_process';

const sh = (dir: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim();

describe('git', () => {
  it('initialises a repository once and records commits per file, oldest first', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    await initRepo(dir);
    writeFileSync(join(dir, 'a.md'), 'one');
    const first = await commitFiles(dir, ['a.md'], 'first');
    writeFileSync(join(dir, 'a.md'), 'two');
    await commitFiles(dir, ['a.md'], 'second');
    const history = await fileHistory(dir, 'a.md');
    expect(history.map((c) => c.message)).toEqual(['Keel: first', 'Keel: second']);
    expect(history[0]?.hash.startsWith(first)).toBe(true);
    expect(await fileAt(dir, history[0]?.hash ?? '', 'a.md')).toBe('one');
    expect(await fileAt(dir, history[0]?.hash ?? '', 'missing.md')).toBeUndefined();
    expect(await fileAt(dir, '--output=x', 'a.md')).toBeUndefined();
  });

  it('folds commits with the same prefix into one, and starts a new one after any other commit', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    writeFileSync(join(dir, 'b.md'), '1');
    await commitSquashing(dir, ['b.md'], 'Brainstorm: start', 'Brainstorm:');
    writeFileSync(join(dir, 'b.md'), '2');
    await commitSquashing(dir, ['b.md'], 'Brainstorm: captured A', 'Brainstorm:');
    writeFileSync(join(dir, 'a.md'), 'x');
    await commitFiles(dir, ['a.md'], 'INT-0001 v1: Create intent');
    writeFileSync(join(dir, 'b.md'), '3');
    await commitSquashing(dir, ['b.md'], 'Brainstorm: captured A, B', 'Brainstorm:');
    expect((await fileHistory(dir, 'b.md')).map((c) => c.message)).toEqual(['Keel: Brainstorm: captured A', 'Keel: Brainstorm: captured A, B']);
  });

  it("reads the user's name from git config", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    await simpleGit(dir).addConfig('user.name', ' Grace Hopper ');
    expect(await gitUserName(dir)).toBe('Grace Hopper');
  });

  it('skips a commit when nothing changed, and removes files in a commit', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    writeFileSync(join(dir, 'a.md'), 'one');
    expect(await commitFiles(dir, ['a.md'], 'first')).not.toBe('');
    expect(await commitFiles(dir, ['a.md'], 'again')).toBe('');
    await removeFiles(dir, ['a.md'], 'remove a');
    expect(existsSync(join(dir, 'a.md'))).toBe(false);
    expect((await fileHistory(dir, 'a.md')).map((c) => c.message)).toEqual(['Keel: first', 'Keel: remove a']);
  });

  it('runs concurrent commits in one folder one after another', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    const names = ['a', 'b', 'c', 'd', 'e'];
    names.forEach((n) => writeFileSync(join(dir, `${n}.md`), n));
    const hashes = await Promise.all(names.map((n) => commitFiles(dir, [`${n}.md`], `add ${n}`)));
    expect(hashes.every((h) => h !== '')).toBe(true);
    expect((await fileHistory(dir, 'c.md')).map((c) => c.message)).toEqual(['Keel: add c']);
  });

  it("commits only Keel's paths: what the user staged stays staged and out of the commit", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    writeFileSync(join(dir, 'README.md'), '# App\n');
    sh(dir, 'add', 'README.md');
    sh(dir, 'commit', '-qm', 'Start');
    writeFileSync(join(dir, 'app.ts'), 'export {};\n');
    sh(dir, 'add', 'app.ts');
    writeFileSync(join(dir, 'a.md'), 'one');
    await commitFiles(dir, ['a.md'], 'INT-0001 v1: Create intent');
    expect(sh(dir, 'show', '--name-only', '--format=%an <%ae>|%s', 'HEAD')).toBe('Keel <keel@localhost>|Keel: INT-0001 v1: Create intent\n\na.md');
    expect(sh(dir, 'diff', '--cached', '--name-only')).toBe('app.ts');
  });

  it('refuses to commit during a merge, a rebase or a cherry-pick, and on a detached HEAD', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    expect(await commitBlocker(dir)).toBeUndefined();
    writeFileSync(join(dir, 'a.md'), 'one');
    await commitFiles(dir, ['a.md'], 'first');
    writeFileSync(join(dir, '.git', 'MERGE_HEAD'), sh(dir, 'rev-parse', 'HEAD'));
    expect(await commitBlocker(dir)).toBe('A merge is in progress. Finish the merge in git, then try again.');
    writeFileSync(join(dir, 'a.md'), 'two');
    await expect(commitFiles(dir, ['a.md'], 'second')).rejects.toBeInstanceOf(RepoBusyError);
    execFileSync('rm', [join(dir, '.git', 'MERGE_HEAD')]);
    execFileSync('mkdir', [join(dir, '.git', 'rebase-merge')]);
    expect(await commitBlocker(dir)).toMatch(/^A rebase is in progress/);
    execFileSync('rmdir', [join(dir, '.git', 'rebase-merge')]);
    writeFileSync(join(dir, '.git', 'CHERRY_PICK_HEAD'), sh(dir, 'rev-parse', 'HEAD'));
    expect(await commitBlocker(dir)).toMatch(/^A cherry-pick is in progress/);
    execFileSync('rm', [join(dir, '.git', 'CHERRY_PICK_HEAD')]);
    sh(dir, 'checkout', '-q', '--detach');
    expect(await commitBlocker(dir)).toBe('HEAD is detached. Check out a branch in git, then try again.');
    expect(await commitBlocker(join(dir, 'missing'))).toBeUndefined();
  });

  it("knows the version Keel last committed, also after someone else's commit", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    writeFileSync(join(dir, 'a.md'), 'keel');
    await commitFiles(dir, ['a.md'], 'first');
    writeFileSync(join(dir, 'a.md'), 'agent');
    sh(dir, 'commit', '-qam', 'Agent edit');
    expect(await keelVersionOf(dir, 'a.md')).toBe('keel');
    expect(await keelVersionOf(dir, 'missing.md')).toBeUndefined();
  });

  it("does not fold into a Keel commit that was pushed, or into someone else's", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'keel-git-')), 'repo');
    await initRepo(dir);
    writeFileSync(join(dir, 'b.md'), '1');
    await commitSquashing(dir, ['b.md'], 'Brainstorm: start', 'Brainstorm:');
    sh(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(dir, 'b.md'), '2');
    await commitSquashing(dir, ['b.md'], 'Brainstorm: captured A', 'Brainstorm:');
    expect((await fileHistory(dir, 'b.md')).map((c) => c.message)).toEqual(['Keel: Brainstorm: start', 'Keel: Brainstorm: captured A']);
  });
});
