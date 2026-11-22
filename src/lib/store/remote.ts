// The project folder's own git remote: CI results (task R6) and the optional push (task R8).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { simpleGit } from 'simple-git';
import { cleanError } from '../github/push';
import { fail, ok, type Result } from '../result';

const run = promisify(execFile);

export interface Remote {
  url: string;
  github?: string;   // owner/name when the remote is on github.com
}

/** owner/name from a github.com remote URL (HTTPS or SSH), if it is one. */
export function githubRepoOf(url: string): string | undefined {
  const match = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  return match && match[2] !== '.' && match[2] !== '..' ? `${match[1]}/${match[2]}` : undefined;
}

/** The URL of `origin` without any credentials in it, or undefined when there is no such remote. */
export async function remoteOf(root: string): Promise<Remote | undefined> {
  const raw = (await simpleGit(root).raw(['remote', 'get-url', 'origin']).catch(() => '')).trim();
  if (!raw) return undefined;
  const url = raw.replace(/^(https?:\/\/)[^@/]+@/, '$1');
  const github = githubRepoOf(url);
  return github ? { url, github } : { url };
}

/** The current branch, or undefined on a detached HEAD. */
export async function currentBranch(root: string): Promise<string | undefined> {
  return (await simpleGit(root).raw(['branch', '--show-current']).catch(() => '')).trim() || undefined;
}

/** How a remote is shown: "github.com/owner/name" for GitHub, the URL otherwise. */
export function remoteLabel(remote: Remote): string {
  return remote.github ? `github.com/${remote.github}` : remote.url;
}

export type PushError = 'no-remote' | 'repo-busy' | 'push-failed';

/**
 * `git push origin HEAD` with the user's own git credentials and environment (credential helper, SSH agent).
 * Keel stores no token for pushing and never pushes on its own: only the Push button calls this. Git is told
 * not to prompt, so a missing credential fails with git's message instead of hanging.
 */
export async function push(root: string): Promise<Result<{ remote: string; branch: string }, PushError>> {
  const remote = await remoteOf(root);
  if (!remote) return fail('no-remote', 'This folder has no remote called origin. Push from your terminal when you are ready.');
  const branch = await currentBranch(root);
  if (!branch) return fail('repo-busy', 'HEAD is detached. Check out a branch in git, then try again.');
  try {
    // Plain git with the user's whole environment (SSH agent, GIT_SSH_COMMAND, credential helpers):
    // simple-git's environment guard would refuse some of these.
    await run('git', ['push', 'origin', 'HEAD'], { cwd: root, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 120_000 });
    return ok({ remote: remoteLabel(remote), branch });
  } catch (error) {
    // git's own message is on stderr; the error message only names the command.
    const stderr = typeof (error as { stderr?: unknown }).stderr === 'string' ? (error as { stderr: string }).stderr : '';
    return fail('push-failed', `The push failed: ${cleanError(stderr.trim() || error)}`);
  }
}
