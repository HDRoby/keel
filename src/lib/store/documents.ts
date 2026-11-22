// Project documents: markdown with YAML front matter, one git commit per save (REQ-002, ADR-0007).
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { DocumentHeader, DocumentKind, DocumentStatus, KeelDocument } from '../documents/types';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from './atomic';
import { commitFiles } from './git';
import type { Store } from './db';
import { fromYamlDate, readProject, today } from './workspace';

export type StoredDocument = KeelDocument & { path: string };

export type DocumentError = 'invalid-front-matter' | 'invalid-path' | 'not-found' | 'already-exists' | 'not-initialised';

const SINGLE: Partial<Record<DocumentKind, string>> = {
  intent: 'docs/intent.md',
  spec: 'docs/spec.md',
  plan: 'docs/plan.md',
  roadmap: 'docs/roadmap.md',
};
const FOLDER: Partial<Record<DocumentKind, string>> = { decision: 'docs/decisions', change: 'docs/changes', task: 'tasks' };
const PREFIX: Record<DocumentKind, string> = {
  intent: 'INT', spec: 'SPC', plan: 'PLN', roadmap: 'RMP', decision: 'ADR', change: 'CR', task: 'T',
};

const isoDate = z.preprocess(fromYamlDate, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const headerSchema = z.looseObject({
  id: z.string().min(1),
  project: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  created: isoDate,
  updated: isoDate,
  status: z.enum(['draft', 'pending', 'approved', 'closed', 'todo', 'doing', 'done']),
  version: z.number().int().min(1),
  template: z.string().min(1),
});

/** Which kind of document lives at a repository path, if any. */
export function kindFromPath(path: string): DocumentKind | undefined {
  if (!/^(docs|tasks)\/([a-z0-9-]+\/)?[A-Za-z0-9._-]+\.md$/.test(path)) return undefined;
  const single = Object.entries(SINGLE).find(([, p]) => p === path);
  if (single) return single[0] as DocumentKind;
  const folder = Object.entries(FOLDER).find(([, f]) => dirname(path) === f);
  return folder?.[0] as DocumentKind | undefined;
}

/** Repository paths of every document file in the project folder, sorted. */
export function listDocumentPaths(dir: string): string[] {
  return ['docs', 'tasks']
    .filter((top) => existsSync(join(dir, top)))
    .flatMap((top) => readdirSync(join(dir, top), { recursive: true, encoding: 'utf8' }).map((f) => join(top, f)))
    .map((f) => f.split('\\').join('/'))
    .filter((f) => kindFromPath(f) !== undefined)
    .sort();
}

/** Parses and validates a document's front matter. */
export function parseDocument(text: string): Result<{ header: DocumentHeader; body: string }, 'invalid-front-matter'> {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text, {});
  } catch {
    return fail('invalid-front-matter', 'Front matter is not valid YAML');
  }
  const header = headerSchema.safeParse(parsed.data);
  if (!header.success) return fail('invalid-front-matter', z.prettifyError(header.error));
  return ok({ header: header.data as DocumentHeader, body: parsed.content.replace(/^\n/, '') });
}

/** Writes a header and body as plain markdown (Plain markdown standard). */
export function serializeDocument(header: DocumentHeader, body: string): string {
  return matter.stringify(`\n${body}`, header);
}

export interface NewDocument {
  kind: DocumentKind;
  title: string;
  body: string;
  template: string;
  extra?: Record<string, unknown>;
  status?: DocumentStatus;   // default draft
  fileSlug?: string;         // folder kinds: name the file NNNN-<slug>.md instead of <id>.md
  id?: string;               // tasks only: a given ID such as T4, when a regeneration brings a task back
}

/** Creates a document as version 1 (status draft unless given), and commits it. */
export async function createDocument(store: Store, input: NewDocument): Promise<Result<StoredDocument, DocumentError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-initialised', project.message);
  const dir = store.root;
  const number = nextNumber(dir, input.kind);
  const padded = String(number).padStart(4, '0');
  const id = input.kind === 'task' ? (input.id && /^T\d{1,4}$/.test(input.id) ? input.id : `T${number}`) : `${PREFIX[input.kind]}-${padded}`;
  const fileName = input.fileSlug && /^[a-z0-9][a-z0-9-]{0,40}$/.test(input.fileSlug) ? `${padded}-${input.fileSlug}` : id;
  const path = SINGLE[input.kind] ?? `${FOLDER[input.kind]}/${fileName}.md`;
  if (existsSync(join(dir, path))) return fail('already-exists', `${path} already exists`);
  const date = today(store);
  const header: DocumentHeader = {
    ...input.extra,
    id, project: project.value.id, title: input.title, author: project.value.author,
    created: date, updated: date, status: input.status ?? 'draft', version: 1, template: input.template,
  };
  const doc = { kind: input.kind, header, body: input.body, path };
  await write(store, doc, `Create ${input.kind}`);
  return ok(doc);
}

/** Reads a document from the project's working tree. */
export function readDocument(store: Pick<Store, 'root'>, path: string): Result<StoredDocument, DocumentError> {
  const kind = kindFromPath(path);
  if (!kind) return fail('invalid-path', `Not a document path: ${path}`);
  const file = join(store.root, path);
  if (!existsSync(file)) return fail('not-found', `${path} does not exist`);
  const parsed = parseDocument(readFileSync(file, 'utf8'));
  return parsed.ok ? ok({ kind, path, ...parsed.value }) : parsed;
}

export interface DocumentChange {
  reason: string;
  body?: string;
  title?: string;
  status?: DocumentStatus;
  extra?: Record<string, unknown>;   // extra header fields, such as approvals; core fields cannot be overwritten
  sameVersion?: boolean;             // a status change such as an approval: the content version stays (owner decision)
}

/**
 * Saves a change as the next version, and commits it with the reason. With sameVersion the version
 * number stays and no new version is recorded; the commit still carries the reason.
 */
export async function saveDocument(store: Store, path: string, change: DocumentChange): Promise<Result<StoredDocument, DocumentError>> {
  const current = readDocument(store, path);
  if (!current.ok) return current;
  const { header, body } = current.value;
  const doc: StoredDocument = {
    ...current.value,
    body: change.body ?? body,
    header: {
      ...header,
      ...change.extra,
      id: header.id,
      project: header.project,
      author: header.author,
      created: header.created,
      template: header.template,
      title: change.title ?? header.title,
      status: change.status ?? header.status,
      version: change.sameVersion ? header.version : header.version + 1,
      updated: today(store),
    },
  };
  await write(store, doc, change.reason, !change.sameVersion);
  return ok(doc);
}

/** Commit message that the index reads back: "<id> v<version>: <reason>". */
export function commitMessage(header: DocumentHeader, reason: string): string {
  return `${header.id} v${header.version}: ${oneLine(reason)}`;
}

async function write(store: Store, doc: StoredDocument, reason: string, newVersion = true): Promise<void> {
  const dir = store.root;
  const file = join(dir, doc.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, serializeDocument(doc.header, doc.body));
  const commit = await commitFiles(dir, [doc.path], commitMessage(doc.header, reason));
  store.index.upsertDocument(doc);
  if (newVersion) store.index.addVersion({ id: doc.header.id, version: doc.header.version, commit, date: doc.header.updated, reason: oneLine(reason) });
}

function nextNumber(dir: string, kind: DocumentKind): number {
  const folder = FOLDER[kind];
  if (!folder || !existsSync(join(dir, folder))) return 1;
  return readdirSync(join(dir, folder)).filter((f) => f.endsWith('.md')).length + 1;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
