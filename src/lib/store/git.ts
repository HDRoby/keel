// Thin wrapper over git for the project folder (ADR-0007, ADR-0010). The folder is the user's own
// repository, so Keel commits only the paths it names (`git commit --only -- <paths>`): files the user
// has staged stay staged and out of Keel's commit. Every Keel commit has author Keel <keel@localhost>
// and a "Keel: " subject. Keel refuses to commit during a merge, rebase or cherry-pick, or on a
// detached HEAD (task R5).
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { CheckRepoActions, simpleGit, type SimpleGit } from 'simple-git';

export interface Commit {
  hash: string;
  date: string;
  message: string;
}

/** Subject prefix of every Keel commit; read-back ignores commits with it. */
export const KEEL_PREFIX = 'Keel: ';

/** Thrown by the commit functions when the repository is in a state Keel must not commit in. */
export class RepoBusyError extends Error {}

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

/** "Keel: <message>", once. */
export function keelSubject(message: string): string {
  return message.startsWith(KEEL_PREFIX) ? message : `${KEEL_PREFIX}${message}`;
}

/**
 * Why Keel must not commit in this folder now, or undefined when it may: a merge, rebase or
 * cherry-pick in progress, or a detached HEAD. A folder that is not a repository yet is fine.
 */
export async function commitBlocker(dir: string): Promise<string | undefined> {
  if (!existsSync(dir)) return undefined;
  const repo = git(dir);
  const gitDir = await repo.revparse(['--git-dir']).then((d) => d.trim()).catch(() => '');
  if (!gitDir) return undefined;
  const full = isAbsolute(gitDir) ? gitDir : join(dir, gitDir);
  if (existsSync(join(full, 'MERGE_HEAD'))) return 'A merge is in progress. Finish the merge in git, then try again.';
  if (existsSync(join(full, 'rebase-merge')) || existsSync(join(full, 'rebase-apply'))) return 'A rebase is in progress. Finish the rebase in git, then try again.';
  if (existsSync(join(full, 'CHERRY_PICK_HEAD'))) return 'A cherry-pick is in progress. Finish it in git, then try again.';
  // Empty on a detached HEAD; the branch name otherwise, also before the first commit.
  const branch = (await repo.raw(['branch', '--show-current']).catch(() => '')).trim();
  if (!branch) return 'HEAD is detached. Check out a branch in git, then try again.';
  return undefined;
}

async function ensureCommittable(dir: string): Promise<void> {
  const blocker = await commitBlocker(dir);
  if (blocker) throw new RepoBusyError(blocker);
}

/** Creates the folder and an empty git repository if there is none yet. */
export async function initRepo(dir: string): Promise<void> {
  return serialised(dir, async () => {
    mkdirSync(dir, { recursive: true });
    if (!(await git(dir).checkIsRepo(CheckRepoActions.IS_REPO_ROOT).catch(() => false))) {
      await git(dir).init(['--initial-branch=main']);
    }
  });
}

/** True when the repository has no commit yet. */
async function unborn(repo: SimpleGit): Promise<boolean> {
  return repo.revparse(['--verify', '-q', 'HEAD']).then(() => false).catch(() => true);
}

/**
 * Stages the given paths and commits only them, with a "Keel: " subject. Nothing changed: no commit,
 * and '' is returned. Throws RepoBusyError during a merge, rebase or cherry-pick, or on a detached HEAD.
 */
export async function commitFiles(dir: string, paths: string[], message: string): Promise<string> {
  return serialised(dir, async () => {
    await ensureCommittable(dir);
    const repo = git(dir);
    await repo.raw(['add', '--', ...paths]);
    if ((await repo.raw(['diff', '--cached', '--name-only', '--', ...paths])).trim() === '') return '';
    // On the first commit --only has no HEAD to compare with; the index then holds only what Keel added
    // plus what the user staged, so pass the paths without --only (git commits only those paths anyway).
    const only = (await unborn(repo)) ? [] : ['--only'];
    await repo.raw(['commit', '--no-verify', ...only, '-m', keelSubject(message), '--', ...paths]);
    return (await repo.revparse(['HEAD'])).trim();
  });
}

/**
 * Commits the paths, folding them into the last commit when its subject starts with the prefix and it is
 * Keel's own and not pushed. Keeps a run of small saves (brainstorm turns) as one commit.
 */
export async function commitSquashing(dir: string, paths: string[], message: string, prefix: string): Promise<string> {
  return serialised(dir, async () => {
    await ensureCommittable(dir);
    const repo = git(dir);
    await repo.raw(['add', '--', ...paths]);
    const head = await repo.log({ maxCount: 1 }).catch(() => undefined);
    const subject = keelSubject(prefix);
    const pushed = head?.latest ? (await repo.raw(['branch', '-r', '--contains', head.latest.hash]).catch(() => '')).trim() !== '' : false;
    const amend = Boolean(head?.latest?.message.startsWith(subject) && head.latest.author_name === 'Keel' && !pushed);
    if (!amend && (await repo.raw(['diff', '--cached', '--name-only', '--', ...paths])).trim() === '') return '';
    await repo.raw(['commit', '--no-verify', ...(amend ? ['--amend'] : []), '--only', '-m', keelSubject(message), '--', ...paths]);
    return (await repo.revparse(['HEAD'])).trim();
  });
}

/** A file's content at a commit, or undefined if it did not exist there. */
export async function fileAt(dir: string, hash: string, path: string): Promise<string | undefined> {
  if (!/^([0-9a-f]{4,40}|HEAD)$/.test(hash) || path.startsWith('-') || path.includes('..')) return undefined;
  return git(dir).show([`${hash}:${path}`]).catch(() => undefined);
}

/** The content Keel last committed for a path: the newest commit by Keel touching it. */
export async function keelVersionOf(dir: string, path: string): Promise<string | undefined> {
  if (path.startsWith('-') || path.includes('..')) return undefined;
  const hash = (await git(dir).raw(['log', '-1', '--author=^Keel <keel@localhost>$', '--format=%H', '--', path]).catch(() => '')).trim();
  return hash ? fileAt(dir, hash, path) : undefined;
}

/** The user's name from their git config (user.name), used as the default name in forms. Read only. */
export async function gitUserName(cwd: string = process.cwd()): Promise<string | undefined> {
  const value = await simpleGit(cwd).getConfig('user.name').then((c) => c.value).catch(() => null);
  return value?.trim() || undefined;
}

/** Removes files from the working tree and commits that, as Keel, with only those paths. */
export async function removeFiles(dir: string, paths: string[], message: string): Promise<string> {
  return serialised(dir, async () => {
    await ensureCommittable(dir);
    const repo = git(dir);
    await repo.raw(['rm', '-q', '--', ...paths]);
    await repo.raw(['commit', '--no-verify', '--only', '-m', keelSubject(message), '--', ...paths]);
    return (await repo.revparse(['HEAD'])).trim();
  });
}

/** Commits that touched a file, oldest first. */
export async function fileHistory(dir: string, path: string): Promise<Commit[]> {
  const log = await git(dir).log({ file: path });
  return log.all
    .map((entry) => ({ hash: entry.hash, date: entry.date, message: entry.message }))
    .reverse();
}
