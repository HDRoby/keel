// Version history of a document from git, with readable line diffs and the reason for each version (REQ-008).
import { diffLines } from 'diff';
import { parseDocument } from '../store/documents';
import { fileAt, fileHistory } from '../store/git';
import { versionFromCommit } from '../store/reindex';

export interface DocumentVersion {
  version: number;
  reason: string;        // the reason recorded when the version was made
  date: string;
  commit: string;        // the last commit with this version number (approvals keep the number)
}

export interface LineChange {
  kind: 'added' | 'removed' | 'same';
  text: string;
}

/** The versions of one document, oldest first, read from the commit messages Keel writes. */
export async function documentVersions(dir: string, path: string): Promise<DocumentVersion[]> {
  const versions: DocumentVersion[] = [];
  for (const commit of await fileHistory(dir, path)) {
    const parsed = versionFromCommit(commit);
    if (!parsed) continue;
    const known = versions.find((v) => v.version === parsed.version);
    if (known) known.commit = commit.hash;
    else versions.push({ version: parsed.version, reason: parsed.reason, date: parsed.date, commit: commit.hash });
  }
  return versions.sort((a, b) => a.version - b.version);
}

/** The body of a document as it was at a version. */
export async function bodyAt(dir: string, path: string, version: DocumentVersion): Promise<string | undefined> {
  const content = await fileAt(dir, version.commit, path);
  if (content === undefined) return undefined;
  const parsed = parseDocument(content);
  return parsed.ok ? parsed.value.body : content;
}

/** Line by line changes from one text to the next. */
export function lineChanges(before: string, after: string): LineChange[] {
  return diffLines(before, after).flatMap((part) => {
    const kind = part.added ? 'added' : part.removed ? 'removed' : 'same';
    return part.value.replace(/\n$/, '').split('\n').map((text) => ({ kind, text }) as LineChange);
  });
}

/** Only the changed lines, with up to `context` unchanged lines around each run; gaps become "…". */
export function compactChanges(changes: LineChange[], context = 2): (LineChange | 'gap')[] {
  const near = changes.map((_, i) => changes.slice(Math.max(0, i - context), i + context + 1).some((c) => c.kind !== 'same'));
  const out: (LineChange | 'gap')[] = [];
  changes.forEach((c, i) => {
    if (near[i]) out.push(c);
    else if (out.at(-1) !== 'gap') out.push('gap');
  });
  return out;
}
