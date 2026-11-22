// The project folder's own git remote (task R6 for CI results; task R8 adds the optional push).
import { simpleGit } from 'simple-git';

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
