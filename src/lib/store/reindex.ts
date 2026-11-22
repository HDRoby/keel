// Rebuilds the index from the project's git history (ADR-0007, `npm run keel -- reindex`).
import type { Store, Version } from './db';
import { listDocumentPaths, readDocument, type StoredDocument } from './documents';
import { fileHistory, type Commit } from './git';

export interface ReindexReport {
  documents: number;
  versions: number;
  skipped: string[];   // "<path>: <reason>"
}

const MESSAGE = /^(?:Keel: )?(\S+) v(\d+): (.*)$/;

/** Reads a commit message written by the document store back into a version, if it is one. */
export function versionFromCommit(commit: Commit): Version | undefined {
  const match = MESSAGE.exec(commit.message);
  if (!match) return undefined;
  const [, id = '', version = '', reason = ''] = match;
  return { id, version: Number(version), commit: commit.hash, date: commit.date.slice(0, 10), reason };
}

/** Replaces the index with what the git repository holds. */
export async function rebuildIndex(store: Store): Promise<ReindexReport> {
  const report: ReindexReport = { documents: 0, versions: 0, skipped: [] };
  const docs: StoredDocument[] = [];
  const versions: Version[] = [];
  for (const path of listDocumentPaths(store.root)) {
    const doc = readDocument(store, path);
    if (!doc.ok) {
      report.skipped.push(`${path}: ${doc.message}`);
      continue;
    }
    docs.push(doc.value);
    for (const commit of await fileHistory(store.root, path)) {
      const version = versionFromCommit(commit);
      // The first commit of a version made it; later ones with the same number (approvals) do not.
      const known = versions.some((v) => v.id === version?.id && v.version === version.version);
      if (version?.id === doc.value.header.id && !known) versions.push(version);
    }
  }
  store.index.transaction(() => {
    store.index.clear();
    docs.forEach((d) => store.index.upsertDocument(d));
    versions.forEach((v) => store.index.addVersion(v));
  });
  report.documents = docs.length;
  report.versions = versions.length;
  return report;
}
