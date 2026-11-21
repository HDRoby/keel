// Checks a pushed repository for the coding agent's commits to docs/ and tasks/ (REQ-007, ADR-0008).
// Keel's own commits (author Keel, "Keel: " subject) are ignored. Runs on a schedule and on "Check now".
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from '../result';
import { cleanError, handoffDir, handoffGit, KEEL_COMMIT_PREFIX, remoteUrl, repositoryOf } from '../github/push';
import { githubToken } from '../github/auth';
import type { Store } from '../store/db';
import { kindFromPath } from '../store/documents';
import { initRepo } from '../store/git';
import { listProjectSlugs, projectDir } from '../store/workspace';
import { fetchCiResults } from './ci';
import { changedContent, readbackState, saveReadbackState, type PendingChange, type ReadbackError, type ReadbackState } from './changes';

export const DEFAULT_INTERVAL_MINUTES = 15;
const WATCHED = ['docs', 'tasks'];

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
  return commit.email === 'keel@localhost' || commit.subject.startsWith(KEEL_COMMIT_PREFIX);
}

/** Folds the agent's commits (oldest first) into one pending change per document file, skipping handled ones. */
export function pendingFrom(commits: AgentCommit[], handled: ReadbackState['handled']): PendingChange[] {
  const byPath = new Map<string, PendingChange>();
  for (const commit of commits.filter((c) => !isKeelCommit(c))) {
    for (const path of commit.paths.filter((p) => kindFromPath(p))) {
      const before = byPath.get(path);
      byPath.set(path, { path, commit: commit.hash, messages: [...(before?.messages ?? []), commit.subject], author: commit.author, date: commit.date });
    }
  }
  return [...byPath.values()].filter((c) => !handled.some((d) => d.path === c.path && d.commit === c.commit));
}

/**
 * Fetches the branch Keel pushed to and records the agent's changes since Keel's last push as pending.
 * A change whose file already matches Keel's version is left out.
 */
export async function checkRepository(store: Store, slug: string, options: { token?: string; fetch?: Parameters<typeof fetchCiResults>[3] } = {}): Promise<Result<ReadbackState, ReadbackError>> {
  const repository = repositoryOf(store, slug);
  const lastPush = repository?.pushes.at(-1);
  if (!repository || !lastPush) return fail('not-pushed', 'The project has not been pushed to a repository yet');
  const dir = handoffDir(store, slug);
  await initRepo(dir);
  const token = options.token ?? (repository.kind === 'github' ? githubToken(store) : undefined);
  const git = handoffGit(dir, token);
  let commits: AgentCommit[];
  let head: string;
  try {
    await git.fetch(remoteUrl(repository), repository.branch);
    head = (await git.revparse(['FETCH_HEAD'])).trim();
    const log = await git.raw(['log', '--reverse', '--format=%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s', '--name-only', `${lastPush.commit}..FETCH_HEAD`, '--', ...WATCHED]);
    commits = log.split('\x1e').filter((r) => r.trim()).map((record) => {
      const [line = '', ...paths] = record.split('\n');
      const [hash = '', author = '', email = '', date = '', subject = ''] = line.split('\x1f');
      return { hash, author, email, date, subject, paths: paths.map((p) => p.trim()).filter(Boolean) };
    });
  } catch (error) {
    return fail('check-failed', `Could not check the repository: ${cleanError(error, token)}`);
  }
  const state = readbackState(store, slug);
  const pending: PendingChange[] = [];
  for (const change of pendingFrom(commits, state.handled)) {
    const theirs = await changedContent(store, slug, change);
    const file = join(projectDir(slug, store.home), change.path);
    const mine = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    if (theirs === undefined || mine === undefined || theirs.trimEnd() !== mine.trimEnd()) pending.push(change);
  }
  // Scenario results per requirement from CI, for GitHub repositories (needs "Actions: read").
  const ci = repository.kind === 'github' && token
    ? await fetchCiResults(repository.location, repository.branch, token, options.fetch)
    : undefined;
  const rest: ReadbackState = { ...state };
  delete rest.ci;
  delete rest.ciNote;
  const next: ReadbackState = {
    ...rest, checked: (store.now?.() ?? new Date()).toISOString(), head, pending,
    ...(ci?.ok ? { ci: ci.value } : { ciNote: ci ? ci.message : 'CI results are read from GitHub repositories only' }),
  };
  await saveReadbackState(store, slug, next, `read-back found ${pending.length} change${pending.length === 1 ? '' : 's'}`);
  return ok(next);
}

/** Checks every pushed project. Used by the schedule; errors are kept per project and never thrown. */
export async function checkAll(store: Store): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const slug of listProjectSlugs(store.home)) {
    if (!repositoryOf(store, slug)?.pushes.length) continue;
    const checked = await checkRepository(store, slug);
    results[slug] = checked.ok ? `${checked.value.pending.length} pending` : checked.message;
  }
  return results;
}
