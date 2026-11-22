// Mock references (REQ-010, ADR-0004): links and files made elsewhere, attached to the intent or spec and
// linked to requirements. Kept in .keel/mocks/: the files, and references.md listing them (ADR-0010). No mock generation.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/store';
import { commitBlocker, commitFiles, RepoBusyError } from '../store/git';
import { readProject } from '../store/workspace';

export type MockKind = 'link' | 'image' | 'pdf' | 'html';
export type MockDocument = 'intent' | 'spec';

export interface MockReference {
  id: string;              // MOCK-001
  title: string;
  kind: MockKind;
  source: string;          // a URL, or a file name under .keel/mocks/
  document: MockDocument;
  requirements: string[];
  added: string;           // ISO date
}

export type MockError = 'invalid-input' | 'too-large' | 'unsupported-file' | 'not-found' | 'unknown-requirement';

/** Repository folder of the mock files, and the index listing them. */
export const MOCKS_DIR = '.keel/mocks';
export const MOCKS_INDEX = '.keel/mocks/references.md';
export const MAX_MOCK_BYTES = 10 * 1024 * 1024;
export const MOCK_ID = /^MOCK-\d{3,}$/;
export const REQ_ID = /^REQ-\d{3,}$/;

const referenceSchema = z.object({
  id: z.string().regex(MOCK_ID),
  title: z.string(),
  kind: z.enum(['link', 'image', 'pdf', 'html']),
  source: z.string(),
  document: z.enum(['intent', 'spec']),
  requirements: z.array(z.string().regex(REQ_ID)),
  added: z.preprocess((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v), z.string()),
});

const KIND_LABEL: Record<MockKind, string> = { link: 'Link', image: 'Image', pdf: 'PDF', html: 'HTML' };

/** The next free reference number. IDs are never reused, also after a removal (next_mock in references.md). */
export function nextMockNumber(dir: string): number {
  const file = join(dir, MOCKS_INDEX);
  const fromList = Math.max(0, ...listMocks(dir).map((r) => Number(r.id.slice(5)))) + 1;
  if (!existsSync(file)) return fromList;
  try {
    const counter = matter(readFileSync(file, 'utf8'), {}).data.next_mock;
    return Math.max(fromList, Number.isInteger(counter) ? (counter as number) : 1);
  } catch {
    return fromList;
  }
}

/** The references listed in the mock index. */
export function listMocks(dir: string): MockReference[] {
  const file = join(dir, MOCKS_INDEX);
  if (!existsSync(file)) return [];
  try {
    const parsed = z.array(referenceSchema).safeParse(matter(readFileSync(file, 'utf8'), {}).data.references ?? []);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** references.md for .keel/mocks: the references in front matter for Keel, and a table for people. */
export function mocksIndex(project: string, references: MockReference[], nextMock?: number): string {
  const rows = references.map((r) => {
    const reference = `[${r.title.replace(/[[\]]/g, '')}](${r.source})`;
    return `| ${r.id} | ${reference.replace(/\|/g, '\\|')} | ${KIND_LABEL[r.kind]} | ${r.document === 'intent' ? 'Intent' : 'Spec'} | ${r.requirements.join(', ') || '—'} |`;
  });
  const body = [
    '# Mock references', '',
    'These show intent; the spec decides. Made elsewhere and attached in Keel; Keel does not generate mocks.', '',
    '| ID | Reference | Kind | Document | Shows |', '| --- | --- | --- | --- | --- |', ...rows, '',
  ].join('\n');
  return matter.stringify(`\n${body}`, { project, ...(nextMock ? { next_mock: nextMock } : {}), references });
}

/** What kind of file this is, from its first bytes; undefined when it is not a PNG, JPG, PDF or HTML file. */
export function sniffFile(bytes: Uint8Array): { kind: MockKind; extension: string } | undefined {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { kind: 'image', extension: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { kind: 'image', extension: 'jpg' };
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { kind: 'pdf', extension: 'pdf' };
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512)).replace(/^﻿/, '').trimStart().toLowerCase();
  if ((head.startsWith('<!doctype html') || head.startsWith('<html')) && !bytes.slice(0, 4096).includes(0)) return { kind: 'html', extension: 'html' };
  return undefined;
}

/** A safe file name under .keel/mocks/: lower case, letters, digits and dashes, with the sniffed extension. */
export function mockFileName(id: string, original: string, extension: string): string {
  const stem = original.replace(/\.[^.]*$/, '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${id.toLowerCase()}${stem ? `-${stem}` : ''}.${extension}`;
}

export type NewMock =
  | { document: MockDocument; title: string; url: string }
  | { document: MockDocument; title: string; file: { name: string; bytes: Uint8Array } };

interface CheckedSource {
  kind: MockKind;
  source: string;                                 // the URL, or the file name under .keel/mocks/
  title: string;
  file?: { name: string; bytes: Uint8Array };
}

/** Checks a link or file and works out its kind and where it goes. Nothing is written. */
function checkSource(id: string, input: NewMock): Result<CheckedSource, MockError> {
  if ('url' in input) {
    let url: URL;
    try {
      url = new URL(input.url.trim());
    } catch {
      return fail('invalid-input', 'Not a valid link');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('invalid-input', 'Links must start with http:// or https://');
    return ok({ kind: 'link', source: url.toString(), title: input.title.trim() || url.hostname });
  }
  if (input.file.bytes.byteLength > MAX_MOCK_BYTES) return fail('too-large', 'Files can be up to 10 MB');
  if (input.file.bytes.byteLength === 0) return fail('invalid-input', 'The file is empty');
  const sniffed = sniffFile(input.file.bytes);
  if (!sniffed) return fail('unsupported-file', 'Only PNG, JPG, PDF and HTML files can be attached');
  const name = mockFileName(id, input.file.name, sniffed.extension);
  return ok({ kind: sniffed.kind, source: name, title: input.title.trim() || input.file.name, file: { name, bytes: input.file.bytes } });
}

/** Writes the index (and a new file, if any), removes an old file, and commits it all at once. */
async function saveMocks(dir: string, project: string, references: MockReference[], message: string, change: { add?: CheckedSource['file']; remove?: string } = {}): Promise<void> {
  const blocker = await commitBlocker(dir);
  if (blocker) throw new RepoBusyError(blocker);
  const nextMock = Math.max(nextMockNumber(dir), ...references.map((r) => Number(r.id.slice(5)) + 1));
  mkdirSync(join(dir, MOCKS_DIR), { recursive: true });
  const paths = [MOCKS_INDEX];
  if (change.remove) {
    rmSync(join(dir, MOCKS_DIR, change.remove), { force: true });
    paths.push(`${MOCKS_DIR}/${change.remove}`);
  }
  if (change.add) {
    writeFileSync(join(dir, MOCKS_DIR, change.add.name), change.add.bytes);
    paths.push(`${MOCKS_DIR}/${change.add.name}`);
  }
  writeFileSync(join(dir, MOCKS_INDEX), mocksIndex(project, references, nextMock));
  await commitFiles(dir, [...new Set(paths)], message);
}

const isFile = (r: MockReference) => r.kind !== 'link';

/** Attaches a link or a file (PNG, JPG, PDF or HTML, up to 10 MB) and commits it under .keel/mocks/. */
export async function attachMock(store: Store, input: NewMock): Promise<Result<MockReference, MockError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const dir = store.root;
  const references = listMocks(dir);
  const id = `MOCK-${String(nextMockNumber(dir)).padStart(3, '0')}`;
  const checked = checkSource(id, input);
  if (!checked.ok) return checked;
  const { kind, source, title, file } = checked.value;
  const reference: MockReference = { id, title, kind, source, document: input.document, requirements: [], added: (store.now?.() ?? new Date()).toISOString().slice(0, 10) };
  await saveMocks(dir, project.value.id, [...references, reference], `${id}: attach ${KIND_LABEL[kind].toLowerCase()} to the ${input.document}`, { add: file });
  return ok(reference);
}

/** Replaces a reference's link or file. It keeps its ID, document and linked requirements; an old file is removed. */
export async function replaceMock(store: Store, id: string, input: { title: string } & ({ url: string } | { file: { name: string; bytes: Uint8Array } })): Promise<Result<MockReference, MockError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const dir = store.root;
  const references = listMocks(dir);
  const current = references.find((r) => r.id === id);
  if (!current) return fail('not-found', `No mock reference ${id}`);
  const checked = checkSource(id, { ...input, document: current.document, title: input.title.trim() || current.title });
  if (!checked.ok) return checked;
  const { kind, source, title, file } = checked.value;
  const updated: MockReference = { ...current, kind, source, title, added: (store.now?.() ?? new Date()).toISOString().slice(0, 10) };
  const remove = isFile(current) && current.source !== source ? current.source : undefined;
  await saveMocks(dir, project.value.id, references.map((r) => (r.id === id ? updated : r)), `${id}: replace with ${KIND_LABEL[kind].toLowerCase()}`, { add: file, remove });
  return ok(updated);
}

/** Removes a reference and its file. Git keeps the history. */
export async function removeMock(store: Store, id: string): Promise<Result<MockReference, MockError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const dir = store.root;
  const references = listMocks(dir);
  const current = references.find((r) => r.id === id);
  if (!current) return fail('not-found', `No mock reference ${id}`);
  await saveMocks(dir, project.value.id, references.filter((r) => r.id !== id), `${id}: remove`, { remove: isFile(current) ? current.source : undefined });
  return ok(current);
}

/**
 * The bytes of an image reference, for its thumbnail. Only PNG and JPG files that still look like
 * images by content are returned; anything else (PDF, HTML, a changed file) is refused.
 */
export function mockImage(dir: string, id: string): Result<{ bytes: Uint8Array; type: 'image/png' | 'image/jpeg' }, MockError> {
  const reference = listMocks(dir).find((r) => r.id === id);
  if (!reference || reference.kind !== 'image' || !/^[a-z0-9-]+\.(png|jpg)$/.test(reference.source)) return fail('not-found', `No image ${id}`);
  const file = join(dir, MOCKS_DIR, reference.source);
  if (!existsSync(file)) return fail('not-found', `No image ${id}`);
  const bytes = new Uint8Array(readFileSync(file));
  const sniffed = sniffFile(bytes);
  if (sniffed?.kind !== 'image') return fail('unsupported-file', `${reference.source} is not an image`);
  return ok({ bytes, type: sniffed.extension === 'png' ? 'image/png' : 'image/jpeg' });
}

/** Sets the requirements a reference shows. Only IDs that exist in the project can be linked. */
export async function linkMock(store: Store, id: string, requirements: string[], known: string[]): Promise<Result<MockReference, MockError>> {
  const project = readProject(store.root);
  if (!project.ok) return fail('not-found', project.message);
  const dir = store.root;
  const references = listMocks(dir);
  const reference = references.find((r) => r.id === id);
  if (!reference) return fail('not-found', `No mock reference ${id}`);
  const unknown = requirements.filter((r) => !known.includes(r));
  if (unknown.length > 0) return fail('unknown-requirement', `Unknown requirement ${unknown.join(', ')}`);
  const updated = { ...reference, requirements: [...new Set(requirements)].sort() };
  writeFileSync(join(dir, MOCKS_INDEX), mocksIndex(project.value.id, references.map((r) => (r.id === id ? updated : r)), nextMockNumber(dir)));
  await commitFiles(dir, [MOCKS_INDEX], `${id}: shows ${updated.requirements.join(', ') || 'no requirement'}`);
  return ok(updated);
}
