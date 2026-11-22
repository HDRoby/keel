// SQLite index of the project's documents and versions (ADR-0007). Git stays the source of truth;
// the index lives in .keel/cache/index.db, ignored by git and rebuildable (ADR-0010).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { DocumentKind, DocumentStatus } from '../documents/types';
import type { StoredDocument } from './documents';

export interface IndexedDocument {
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
  upsertDocument(doc: StoredDocument): void;
  addVersion(version: Version): void;
  documents(): IndexedDocument[];
  versions(id: string): Version[];
  clear(): void;
  transaction(run: () => void): void;
  close(): void;
}

/**
 * What every store operation needs: the project folder, its index, the user config folder
 * (settings and secrets, never inside the project: ADR-0011) and a clock.
 */
export interface Store {
  root: string;
  index: Index;
  user: string;
  now?: () => Date;
}

/** Repository path of the index. */
export const INDEX_FILE = '.keel/cache/index.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  path TEXT PRIMARY KEY, id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL, version INTEGER NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT NOT NULL, version INTEGER NOT NULL, commit_hash TEXT NOT NULL,
  date TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (id, version));
`;

/** Opens (or creates) the project's index. Pass ':memory:' as file for tests. */
export function openIndex(root: string, file: string = join(root, INDEX_FILE)): Index {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return {
    upsertDocument: (d) => {
      db.prepare('INSERT OR REPLACE INTO documents VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(d.path, d.header.id, d.kind, d.header.title, d.header.status, d.header.version, d.header.updated);
    },
    addVersion: (v) => {
      db.prepare('INSERT OR REPLACE INTO versions VALUES (?, ?, ?, ?, ?)').run(v.id, v.version, v.commit, v.date, v.reason);
    },
    documents: () => db.prepare('SELECT * FROM documents ORDER BY path').all() as IndexedDocument[],
    versions: (id) =>
      db.prepare('SELECT id, version, commit_hash AS "commit", date, reason FROM versions WHERE id = ? ORDER BY version')
        .all(id) as Version[],
    clear: () => db.exec('DELETE FROM documents; DELETE FROM versions;'),
    transaction: (run) => db.transaction(run)(),
    close: () => db.close(),
  };
}
