// Pushes the handoff package to a GitHub repository (REQ-006, T8b). Keel keeps a working copy in
// .keel/cache/handoff (replaced by R8), fetches the branch, writes the package over it (other files, such as the agent's
// code, stay), commits as Keel and pushes. The token is passed to git through the environment for that one
// command only: it is never written to a git config, a remote URL, a document or a log.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { commitFiles, initRepo } from '../store/git';
import { fromYamlTime, readConfig, readProject, updateConfig } from '../store/workspace';

export type Target =
  | { kind: 'github'; repo: string; branch: string }   // repo: owner/name
  | { kind: 'local'; path: string; branch: string };   // a bare repository on this computer (tests)

export interface Push {
  commit: string;
  date: string;
  plan: string;      // e.g. PLN-0001@2
  unchanged?: true;  // the repository already had this package: nothing was pushed or recorded
}

export interface RepositoryRecord {
  kind: 'github' | 'local';
  location: string;  // owner/name or a path
  branch: string;
  pushes: Push[];
}

export type PushError = 'invalid-target' | 'no-token' | 'not-allowed' | 'push-failed' | 'not-found';

export const KEEL_COMMIT_PREFIX = 'Keel: ';
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

/** "owner/name", or a github.com URL, as owner/name. */
export function parseGithubRepo(input: string): string | undefined {
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(input.trim());
  return match && match[2] !== '.' && match[2] !== '..' ? `${match[1]}/${match[2]}` : undefined;
}

/** Checks a target. Local folders are allowed only when KEEL_ALLOW_LOCAL_REMOTES=1 (tests). */
export function checkTarget(target: Target, env: Record<string, string | undefined> = process.env): Result<Target, PushError> {
  if (!BRANCH.test(target.branch) || target.branch.includes('..')) return fail('invalid-target', 'Not a valid branch name');
  if (target.kind === 'github') {
    const repo = parseGithubRepo(target.repo);
    return repo ? ok({ ...target, repo }) : fail('invalid-target', 'Give the repository as owner/name');
  }
  if (env.KEEL_ALLOW_LOCAL_REMOTES !== '1') return fail('not-allowed', 'Local repositories are only for tests');
  return isAbsolute(target.path) ? ok({ ...target, path: resolve(target.path) }) : fail('invalid-target', 'Give an absolute path');
}

/** Where git fetches and pushes: the github.com HTTPS URL (never with a token in it), or the local path. */
export function remoteUrl(repository: Pick<RepositoryRecord, 'kind' | 'location'>): string {
  return repository.kind === 'github' ? `https://github.com/${repository.location}.git` : repository.location;
}

/** Keel's working copy of the project's repository. */
export function handoffDir(store: Store): string {
  return join(store.root, '.keel', 'cache', 'handoff');
}

/**
 * The environment for one git command: only what git needs (no inherited editors, pagers or askpass
 * helpers, never a credential prompt), and with a token an Authorization header for github.com only.
 */
export function gitEnv(token?: string): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', GIT_TERMINAL_PROMPT: '0' };
  if (token) {
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  }
  return env;
}

/** Git for the handoff working copy. */
export function handoffGit(dir: string, token?: string) {
  return simpleGit(dir, {
    config: ['user.name=Keel', 'user.email=keel@localhost', 'commit.gpgsign=false'],
    allowConfig: ['commit.gpgsign'],
    allowEnvironment: ['GIT_TERMINAL_PROMPT', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'],
    unsafe: { allowUnsafeConfigEnvCount: true },
  }).env(gitEnv(token));
}

/** The repository the project was pushed to, from project.md. */
export function repositoryOf(store: Store): RepositoryRecord | undefined {
  const parsed = z.object({
    kind: z.enum(['github', 'local']), location: z.string(), branch: z.string(),
    pushes: z.array(z.object({ commit: z.string(), date: z.preprocess(fromYamlTime, z.string()), plan: z.string() })),
  }).safeParse(readConfig(store.root)?.repository);
  return parsed.success ? parsed.data : undefined;
}

/** The first line of a git error, with anything token-like hidden, so it can be shown. */
export function cleanError(error: unknown, token?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n').find((l) => l.trim()) ?? 'git failed';
  return (token ? firstLine.split(token).join('***') : firstLine).replace(/AUTHORIZATION: basic \S+/gi, 'AUTHORIZATION: ***').slice(0, 300);
}

/** Pushes the package files as one Keel commit on the target branch, and records the push in project.md. */
export async function pushHandoff(
  store: Store, target: Target, files: { path: string; data: Uint8Array }[], plan: string,
  options: { token?: string; env?: Record<string, string | undefined> } = {},
): Promise<Result<Push, PushError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const checked = checkTarget(target, options.env);
  if (!checked.ok) return checked;
  const to = checked.value;
  if (to.kind === 'github' && !options.token) return fail('no-token', 'Add a GitHub token in Settings first');
  const location = to.kind === 'github' ? to.repo : to.path;
  const dir = handoffDir(store);
  await initRepo(dir);
  const repo = handoffGit(dir, options.token);
  const url = remoteUrl({ kind: to.kind, location });
  try {
    const remote = await repo.listRemote(['--heads', url, to.branch]);
    if (remote.trim()) {
      await repo.fetch(url, to.branch);
      await repo.checkout(['-B', to.branch, 'FETCH_HEAD']);
    } else if ((await repo.branchLocal()).current !== to.branch) {
      await repo.checkout(['--orphan', to.branch]);
    }
    for (const file of files) {
      mkdirSync(dirname(join(dir, file.path)), { recursive: true });
      writeFileSync(join(dir, file.path), file.data);
    }
    const committed = await commitFiles(dir, files.map((f) => f.path), `${KEEL_COMMIT_PREFIX}handoff from ${plan}`);
    await repo.push(url, `HEAD:refs/heads/${to.branch}`);
    const commit = committed || (await repo.revparse(['HEAD'])).trim();
    const previous = repositoryOf(store);
    const same = previous?.location === location && previous.branch === to.branch && previous.pushes.at(-1)?.commit === commit;
    if (same) return ok({ ...(previous.pushes.at(-1) as Push), unchanged: true });
    const push: Push = { commit, date: (store.now?.() ?? new Date()).toISOString(), plan };
    await recordPush(store, { kind: to.kind, location, branch: to.branch }, push);
    return ok(push);
  } catch (error) {
    return fail('push-failed', `The push failed: ${cleanError(error, options.token)}`);
  }
}

async function recordPush(store: Store, to: Omit<RepositoryRecord, 'pushes'>, push: Push): Promise<void> {
  const previous = repositoryOf(store);
  const pushes = previous && previous.location === to.location && previous.branch === to.branch ? previous.pushes : [];
  const repository: RepositoryRecord = { ...to, pushes: [...pushes, push] };
  await updateConfig(store, { repository }, `Keel: pushed ${push.plan} to ${to.location} (${push.commit.slice(0, 7)})`);
}
