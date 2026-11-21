import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simpleGit } from 'simple-git';
import { existsSync } from 'node:fs';
import { commitFiles, commitSquashing, fileAt, fileHistory, gitUserName, initRepo, removeFiles } from './git';

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
    expect(history.map((c) => c.message)).toEqual(['first', 'second']);
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
    expect((await fileHistory(dir, 'b.md')).map((c) => c.message)).toEqual(['Brainstorm: captured A', 'Brainstorm: captured A, B']);
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
    expect((await fileHistory(dir, 'a.md')).map((c) => c.message)).toEqual(['first', 'remove a']);
  });
});
