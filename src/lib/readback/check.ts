// Checks the project folder for the coding agent's changes to docs/, tasks/ and features/ (REQ-007, ADR-0012):
// commits since the reviewed base (`git log`) and uncommitted edits (`git status`). Keel's own commits
// (author Keel, "Keel: " subject) are ignored. No fetch: the agent works in the same folder.
// Runs on a schedule, on "Check now" and when the Handoff page gets focus.
import { simpleGit } from 'simple-git';
import { githubToken } from '../github/auth';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { kindFromPath } from '../store/documents';
import { KEEL_PREFIX, keelVersionOf } from '../store/git';
import { currentBranch, remoteOf } from '../store/remote';
import { isInitialised } from '../store/workspace';
import { fetchCiResults } from './ci';
import {
  changedContent, readbackState, saveCheck, UNCOMMITTED, WORKING_TREE, workingTreeKey,
  type PendingChange, type ReadbackError, type ReadbackState,
} from './changes';

const WATCHED = ['docs', 'tasks', 'features'];

export interface AgentCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  paths: string[];
}

/** True for commits Keel made itself, which read-back ignores. */
export function isKeelCommit(commit: Pick<AgentCommit, 'email' | 'subject' | 'author'>): boolean {
  return commit.email === 'keel@localhost' || commit.subject.startsWith(KEEL_PREFIX);
}

/** A path read-back watches: a document Keel keeps, or a scenario file (not the agent's step code). */
export function isWatched(path: string): boolean {
  return Boolean(kindFromPath(path)) || /^features\/[A-Za-z0-9._-]+\.feature$/.test(path);
}

/** Folds the agent's commits (oldest first) into one pending change per watched file, skipping handled ones. */
export function pendingFrom(commits: AgentCommit[], handled: ReadbackState['handled']): PendingChange[] {
  const byPath = new Map<string, PendingChange>();
  for (const commit of commits.filter((c) => !isKeelCommit(c))) {
    for (const path of commit.paths.filter(isWatched)) {
      const before = byPath.get(path);
      byPath.set(path, { path, commit: commit.hash, messages: [...(before?.messages ?? []), commit.subject], author: commit.author, date: commit.date });
    }
  }
  return [...byPath.values()].filter((c) => !handled.some((d) => d.path === c.path && d.commit === c.commit));
}

/** Paths in `git status --porcelain` output (renames give the new path; quoted paths are skipped). */
export function statusPaths(porcelain: string): string[] {
  return porcelain.split('\n').filter((l) => l.length > 3).map((line) => {
    const path = line.slice(3);
    return path.includes(' -> ') ? (path.split(' -> ').pop() ?? '') : path;
  }).filter((p) => p && !p.startsWith('"'));
}

/** The commit Initialise made: where read-back starts when nothing was reviewed yet. */
async function initialiseCommit(root: string): Promise<string | undefined> {
  const out = await simpleGit(root).raw(['log', '-1', '--format=%H', '--author=^Keel <keel@localhost>$', '--grep=^Keel: Initialise project$', '--extended-regexp']).catch(() => '');
  return out.trim() || undefined;
}

/** Records the agent's commits since the reviewed base, and its uncommitted edits, as pending changes. */
export async function checkFolder(
  store: Store,
  options: { fetch?: Parameters<typeof fetchCiResults>[3]; token?: string } = {},
): Promise<Result<ReadbackState, ReadbackError>> {
  if (!isInitialised(store.root)) return fail('not-initialised', 'Initialise this folder first');
  const git = simpleGit(store.root);
  const state = readbackState(store);
  const now = (store.now?.() ?? new Date()).toISOString();
  let commits: AgentCommit[];
  let changed: string[];
  try {
    const base = state.base ?? (await initialiseCommit(store.root));
    const range = base ? `${base}..HEAD` : 'HEAD';
    const log = await git.raw(['log', '--reverse', '--format=%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s', '--name-only', range, '--', ...WATCHED]);
    commits = log.split('\x1e').filter((r) => r.trim()).map((record) => {
      const [line = '', ...paths] = record.split('\n');
      const [hash = '', author = '', email = '', date = '', subject = ''] = line.split('\x1f');
      return { hash, author, email, date, subject, paths: paths.map((p) => p.trim()).filter(Boolean) };
    });
    changed = statusPaths(await git.raw(['status', '--porcelain', '--untracked-files=all', '--', ...WATCHED])).filter(isWatched);
  } catch (error) {
    return fail('check-failed', `Could not read the folder's git history: ${error instanceof Error ? error.message.split('\n')[0] : 'git failed'}`);
  }

  const byPath = new Map(pendingFrom(commits, state.handled).map((c) => [c.path, c]));
  for (const path of changed) {
    if (state.handled.some((h) => h.path === path && h.commit === workingTreeKey(store.root, path))) continue;
    const before = byPath.get(path);
    byPath.set(path, before
      ? { ...before, commit: WORKING_TREE, committed: before.commit, messages: [...before.messages, UNCOMMITTED] }
      : { path, commit: WORKING_TREE, messages: [UNCOMMITTED], author: 'not committed yet', date: now });
  }
  // A file that is back to Keel's version (changed, then changed back) has nothing to review.
  const pending: PendingChange[] = [];
  for (const change of byPath.values()) {
    const keel = await keelVersionOf(store.root, change.path);
    const theirs = changedContent(store, change);
    if (keel === undefined || theirs === undefined || keel.trimEnd() !== theirs.trimEnd()) pending.push(change);
  }

  // Scenario results per requirement from CI: only for a GitHub remote, with a token in the user settings.
  const remote = await remoteOf(store.root);
  const token = options.token ?? (remote?.github ? githubToken(store) : undefined);
  const branch = await currentBranch(store.root);
  const ci = remote?.github && token && branch ? await fetchCiResults(remote.github, branch, token, options.fetch) : undefined;
  const ciNote = ci?.ok ? undefined
    : ci ? ci.message
    : !remote?.github ? 'CI results are read from a GitHub remote only'
    : 'Add a GitHub token in Settings to see CI results';
  const next: ReadbackState = { ...state, checked: now, pending, ...(ci?.ok ? { ci: ci.value, ciNote: undefined } : { ci: undefined, ciNote }) };
  saveCheck(store, next);
  return ok(next);
}

/** Checks the folder once it is initialised. Used by the schedule; errors are returned, never thrown. */
export async function checkAll(store: Store): Promise<string> {
  if (!isInitialised(store.root)) return 'not initialised';
  const checked = await checkFolder(store);
  return checked.ok ? `${checked.value.pending.length} pending` : checked.message;
}
