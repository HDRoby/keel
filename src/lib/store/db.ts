// SQLite index of projects, documents and versions (ADR-0007). Git stays the source of truth.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { DocumentKind, DocumentStatus } from '../documents/types';
import type { StoredDocument } from './documents';
import type { Project } from './workspace';

export interface IndexedDocument {
  project: string;   // slug
  path: string;
  id: string;
  kind: DocumentKind;
  title: string;
  status: DocumentStatus;
  version: number;
  updated: string;
}

export interface Version {
  id: string;
  version: number;
  commit: string;
  date: string;
  reason: string;
}

export interface Index {
  upsertProject(project: Omit<Project, 'standards'>): void;
  upsertDocument(slug: string, doc: StoredDocument): void;
  addVersion(slug: string, version: Version): void;
  projects(): Omit<Project, 'standards'>[];   // standards live only in project.md
  documents(slug: string): IndexedDocument[];
  versions(slug: string, id: string): Version[];
  /** Settings live only in keel.db: clear() and reindex leave them alone. */
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  clear(): void;
  transaction(run: () => void): void;
  close(): void;
}

/** What every store operation needs: the workspace folder, its index and a clock. */
export interface Store {
  home: string;
  index: Index;
  now?: () => Date;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  slug TEXT PRIMARY KEY, id TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
  project TEXT NOT NULL, path TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL, version INTEGER NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (project, path));
CREATE TABLE IF NOT EXISTS versions (
  project TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, commit_hash TEXT NOT NULL,
  date TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (project, id, version));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Opens (or creates) keel.db in the workspace folder. Pass ':memory:' as file for tests. */
export function openIndex(home: string, file: string = join(home, 'keel.db')): Index {
  if (file !== ':memory:') mkdirSync(home, { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return {
    upsertProject: (p) => {
      db.prepare('INSERT OR REPLACE INTO projects VALUES (?, ?, ?, ?, ?)').run(p.slug, p.id, p.title, p.author, p.created);
    },
    upsertDocument: (slug, d) => {
      db.prepare('INSERT OR REPLACE INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(slug, d.path, d.header.id, d.kind, d.header.title, d.header.status, d.header.version, d.header.updated);
    },
    addVersion: (slug, v) => {
      db.prepare('INSERT OR REPLACE INTO versions VALUES (?, ?, ?, ?, ?, ?)').run(slug, v.id, v.version, v.commit, v.date, v.reason);
    },
    projects: () => db.prepare('SELECT * FROM projects ORDER BY slug').all() as Omit<Project, 'standards'>[],
    documents: (slug) => db.prepare('SELECT * FROM documents WHERE project = ? ORDER BY path').all(slug) as IndexedDocument[],
    versions: (slug, id) =>
      db.prepare('SELECT id, version, commit_hash AS "commit", date, reason FROM versions WHERE project = ? AND id = ? ORDER BY version')
        .all(slug, id) as Version[],
    getSetting: (key) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value,
    setSetting: (key, value) => {
      db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(key, value);
    },
    clear: () => db.exec('DELETE FROM projects; DELETE FROM documents; DELETE FROM versions;'),
    transaction: (run) => db.transaction(run)(),
    close: () => db.close(),
  };
}
