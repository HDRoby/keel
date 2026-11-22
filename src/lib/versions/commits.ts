// A document version read back from a commit message the document store wrote ("INT-0001 v2: <reason>").
import type { Commit } from '../store/git';

export interface Version {
  id: string;
  version: number;
  commit: string;
  date: string;
  reason: string;
}

const MESSAGE = /^(?:Keel: )?(\S+) v(\d+): (.*)$/;

/** Reads a commit message written by the document store back into a version, if it is one. */
export function versionFromCommit(commit: Commit): Version | undefined {
  const match = MESSAGE.exec(commit.message);
  if (!match) return undefined;
  const [, id = '', version = '', reason = ''] = match;
  return { id, version: Number(version), commit: commit.hash, date: commit.date.slice(0, 10), reason };
}
