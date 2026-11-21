// Rebuilds keel.db from the project git repositories (ADR-0007, `npm run keel -- reindex`).
import type { Store, Version } from './db';
import { listDocumentPaths, readDocument, type StoredDocument } from './documents';
import { fileHistory, type Commit } from './git';
import { listProjectSlugs, projectDir, readProject, type Project } from './workspace';

export interface ReindexReport {
  projects: number;
  documents: number;
  versions: number;
  skipped: string[];   // "<slug>/<path>: <reason>"
}

const MESSAGE = /^(\S+) v(\d+): (.*)$/;

/** Reads a commit message written by the document store back into a version, if it is one. */
export function versionFromCommit(commit: Commit): Version | undefined {
  const match = MESSAGE.exec(commit.message);
  if (!match) return undefined;
  const [, id = '', version = '', reason = ''] = match;
  return { id, version: Number(version), commit: commit.hash, date: commit.date.slice(0, 10), reason };
}

/** Replaces the index with what the git repositories hold. */
export async function rebuildIndex(store: Store): Promise<ReindexReport> {
  const report: ReindexReport = { projects: 0, documents: 0, versions: 0, skipped: [] };
  const found: { project: Project; docs: StoredDocument[]; versions: Version[] }[] = [];
  for (const slug of listProjectSlugs(store.home)) {
    const project = readProject(slug, store.home);
    if (!project.ok) {
      report.skipped.push(`${slug}: ${project.message}`);
      continue;
    }
    const dir = projectDir(slug, store.home);
    const docs: StoredDocument[] = [];
    const versions: Version[] = [];
    for (const path of listDocumentPaths(dir)) {
      const doc = readDocument(store, slug, path);
      if (!doc.ok) {
        report.skipped.push(`${slug}/${path}: ${doc.message}`);
        continue;
      }
      docs.push(doc.value);
      for (const commit of await fileHistory(dir, path)) {
        const version = versionFromCommit(commit);
        // The first commit of a version made it; later ones with the same number (approvals) do not.
        const known = versions.some((v) => v.id === version?.id && v.version === version.version);
        if (version?.id === doc.value.header.id && !known) versions.push(version);
      }
    }
    found.push({ project: project.value, docs, versions });
  }
  store.index.transaction(() => {
    store.index.clear();
    for (const { project, docs, versions } of found) {
      store.index.upsertProject(project);
      docs.forEach((d) => store.index.upsertDocument(project.slug, d));
      versions.forEach((v) => store.index.addVersion(project.slug, v));
      report.projects += 1;
      report.documents += docs.length;
      report.versions += versions.length;
    }
  });
  return report;
}
