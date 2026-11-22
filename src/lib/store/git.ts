// Thin wrapper over git for project repositories (ADR-0007).
import { mkdirSync } from 'node:fs';
import { CheckRepoActions, simpleGit, type SimpleGit } from 'simple-git';

export interface Commit {
  hash: string;
  date: string;
  message: string;
}

// Keel's identity is passed per command; the user's git config is never changed.
function git(dir: string): SimpleGit {
  return simpleGit(dir, {
    config: ['user.name=Keel', 'user.email=keel@localhost', 'commit.gpgsign=false'],
    allowConfig: ['commit.gpgsign'],
  });
}

const queues = globalThis as typeof globalThis & { keelGitQueues?: Map<string, Promise<unknown>> };

/**
 * Runs git writes for one folder one at a time, so two saves never race for .git/index.lock
 * (for example a brainstorm turn still committing while a form saves).
 */
function serialised<T>(dir: string, run: () => Promise<T>): Promise<T> {
  queues.keelGitQueues ??= new Map();
  const previous = queues.keelGitQueues.get(dir) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  queues.keelGitQueues.set(dir, next);
  return next;
}

/** Creates the folder and an empty git repository if there is none yet. */
export async function initRepo(dir: string): Promise<void> {
  return serialised(dir, () => initRepoNow(dir));
}

async function initRepoNow(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  if (!(await git(dir).checkIsRepo(CheckRepoActions.IS_REPO_ROOT).catch(() => false))) {
    await git(dir).init(['--initial-branch=main']);
  }
}

/** Stages the given files and commits them with one message. Nothing changed: no commit, and '' is returned. */
export async function commitFiles(dir: string, paths: string[], message: string): Promise<string> {
  return serialised(dir, () => commitFilesNow(dir, paths, message));
}

async function commitFilesNow(dir: string, paths: string[], message: string): Promise<string> {
  const repo = git(dir);
  await repo.add(paths);
  if ((await repo.status(paths)).staged.length === 0) return '';
  return (await repo.commit(message, paths, { '--no-verify': null })).commit;
}

/**
 * Commits the files, folding them into the last commit when its message starts with the prefix.
 * Keeps a run of small saves (brainstorm turns) as one commit. Only local, unpushed history is amended.
 */
export async function commitSquashing(dir: string, paths: string[], message: string, prefix: string): Promise<string> {
  return serialised(dir, () => commitSquashingNow(dir, paths, message, prefix));
}

async function commitSquashingNow(dir: string, paths: string[], message: string, prefix: string): Promise<string> {
  const repo = git(dir);
  await repo.add(paths);
  const head = await repo.log({ maxCount: 1 }).catch(() => undefined);
  const options: Record<string, null> = { '--no-verify': null };
  if (head?.latest?.message.startsWith(prefix)) options['--amend'] = null;
  const result = await repo.commit(message, paths, options);
  return result.commit;
}

/** A file's content at a commit, or undefined if it did not exist there. */
export async function fileAt(dir: string, hash: string, path: string): Promise<string | undefined> {
  if (!/^[0-9a-f]{4,40}$/.test(hash) || path.startsWith('-') || path.includes('..')) return undefined;
  return git(dir).show([`${hash}:${path}`]).catch(() => undefined);
}

/** The user's name from their git config (user.name), used as the default name in forms. Read only. */
export async function gitUserName(cwd: string = process.cwd()): Promise<string | undefined> {
  const value = await simpleGit(cwd).getConfig('user.name').then((c) => c.value).catch(() => null);
  return value?.trim() || undefined;
}

/** Removes files from the working tree and commits that. */
export async function removeFiles(dir: string, paths: string[], message: string): Promise<string> {
  return serialised(dir, async () => {
    const repo = git(dir);
    await repo.rm(paths);
    return (await repo.commit(message, paths, { '--no-verify': null })).commit;
  });
}

/** Commits that touched a file, oldest first. */
export async function fileHistory(dir: string, path: string): Promise<Commit[]> {
  const log = await git(dir).log({ file: path });
  return log.all
    .map((entry) => ({ hash: entry.hash, date: entry.date, message: entry.message }))
    .reverse();
}
