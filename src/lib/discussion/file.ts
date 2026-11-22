// Discussion files (REQ-017, CR-0016): .keel/discussions/DSC-NNNN.md from the template discussion@1, written after
// each message and committed when the user agrees, parks it or leaves with new messages. One that led to a change
// request lives in changes/CR-NNNN/discussion.md. Attachments are kept by name only; nothing that looked like a key
// is ever written.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { seedDir, readTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { writeFileAtomic } from '../store/atomic';
import { commitFiles } from '../store/git';
import type { Store } from '../store/store';
import { looksLikeKey } from './keys';

export const DISCUSSIONS_DIR = '.keel/discussions';
export const DISCUSSION_TEMPLATE = 'discussion@1';
export const DSC_ID = /^DSC-\d{4,}$/;
export const ASSISTANT = 'Assistant';

export type DiscussionStatus = 'open' | 'parked' | 'cr';
export type Entry =
  | { kind: 'message'; author: string; at: string; text: string }        // author ASSISTANT for the assistant
  | { kind: 'summary'; upTo: number; text: string }                       // replaces messages 1..upTo in what is sent
  | { kind: 'edit'; author: string; at: string; text: string };           // "<user> edited the proposal"

export interface Discussion {
  id: string;
  title: string;
  status: DiscussionStatus;
  cr?: string;
  model: string;
  style: string;
  started: string;
  sources: string[];
  attachments: string[];
  entries: Entry[];
  path: string;            // repository path
}

const headerSchema = z.object({
  id: z.string().regex(DSC_ID), title: z.string().default(''), status: z.enum(['open', 'parked', 'cr']).default('open'), cr: z.string().optional(),
  model: z.string().default(''), style: z.string().default(''), started: z.preprocess((v) => (v instanceof Date ? v.toISOString() : v), z.string()),
  sources: z.array(z.string()).default([]), attachments: z.array(z.string()).default([]),
});

const MESSAGE = /^### (.+) · (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/;
const SUMMARY = /^### Summary of messages 1–(\d+)$/;
const EDIT = /^### (.+) edited the proposal · (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/;

/** "2026-11-22T10:05:00.000Z" → "2026-11-22 10:05". */
export const stamp = (date: Date) => date.toISOString().slice(0, 16).replace('T', ' ');

// A line of a message that starts with "### " is written as "\### " so it cannot start a new entry.
const escape = (text: string) => text.replace(/^(\\*)### /gm, '\\$1### ');
const unescape = (text: string) => text.replace(/^\\(\\*)### /gm, '$1### ');

function entryText(e: Entry): string {
  if (e.kind === 'message') return `### ${e.author} · ${e.at}\n\n${escape(e.text.trim())}\n`;
  if (e.kind === 'summary') return `### Summary of messages 1–${e.upTo}\n\n${escape(e.text.trim())}\n`;
  return `### ${e.author} edited the proposal · ${e.at}\n\n${escape(e.text.trim())}\n`;
}

export function parseEntries(body: string): Entry[] {
  const entries: Entry[] = [];
  let current: { head: string; lines: string[] } | undefined;
  const flush = () => {
    if (!current) return;
    const text = unescape(current.lines.join('\n').trim());
    const m = MESSAGE.exec(current.head);
    const s = SUMMARY.exec(current.head);
    const e = EDIT.exec(current.head);
    if (e) entries.push({ kind: 'edit', author: e[1] as string, at: e[2] as string, text });
    else if (s) entries.push({ kind: 'summary', upTo: Number(s[1]), text });
    else if (m) entries.push({ kind: 'message', author: m[1] as string, at: m[2] as string, text });
  };
  for (const line of body.split('\n')) {
    if (line.startsWith('### ')) {
      flush();
      current = { head: line, lines: [] };
    } else current?.lines.push(line);
  }
  flush();
  return entries;
}

/** The body before the entries: the template's heading, without its guidance comments. */
function preamble(root: string, title: string): string {
  const template = readTemplate(root, 'discussion', 1);
  const content = template.ok ? template.value.content : readFileSync(join(seedDir(), 'templates', 'discussion.md'), 'utf8');
  return renderTemplate(content, { title }).body.replace(/<!--[\s\S]*?-->\n?/g, '').trim();
}

export function serializeDiscussion(root: string, d: Discussion): string {
  const header = { template: DISCUSSION_TEMPLATE, id: d.id, title: d.title, status: d.status, ...(d.cr ? { cr: d.cr } : {}), model: d.model, style: d.style, started: d.started, sources: d.sources, attachments: d.attachments };
  return matter.stringify(`\n${preamble(root, d.title)}\n\n${d.entries.map(entryText).join('\n')}`, header);
}

export function parseDiscussion(text: string, path: string): Discussion | undefined {
  try {
    const parsed = matter(text, {});
    const header = headerSchema.safeParse(parsed.data);
    if (!header.success) return undefined;
    return { ...header.data, entries: parseEntries(parsed.content), path };
  } catch {
    return undefined;
  }
}

/** Every discussion file: open and parked ones in .keel/discussions, and those kept with a change request. */
export function listDiscussions(root: string): Discussion[] {
  const found: Discussion[] = [];
  const dir = join(root, DISCUSSIONS_DIR);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => /^DSC-\d+\.md$/.test(n))) {
      const d = parseDiscussion(readFileSync(join(dir, f), 'utf8'), `${DISCUSSIONS_DIR}/${f}`);
      if (d) found.push(d);
    }
  }
  const changes = join(root, 'changes');
  if (existsSync(changes)) {
    for (const cr of readdirSync(changes).filter((n) => existsSync(join(changes, n, 'discussion.md')))) {
      const d = parseDiscussion(readFileSync(join(changes, cr, 'discussion.md'), 'utf8'), `changes/${cr}/discussion.md`);
      if (d) found.push(d);
    }
  }
  return found.sort((a, b) => b.id.localeCompare(a.id));
}

export function readDiscussion(root: string, id: string): Discussion | undefined {
  if (!DSC_ID.test(id)) return undefined;
  return listDiscussions(root).find((d) => d.id === id);
}

export function nextDiscussionId(root: string): string {
  const max = Math.max(0, ...listDiscussions(root).map((d) => Number(d.id.slice(4))));
  return `DSC-${String(max + 1).padStart(4, '0')}`;
}

export function writeDiscussion(root: string, d: Discussion): void {
  if (d.entries.some((e) => looksLikeKey(e.text))) throw new Error('A discussion entry looks like a key; it is not written');
  mkdirSync(join(root, d.path, '..'), { recursive: true });
  writeFileAtomic(join(root, d.path), serializeDiscussion(root, d));
}

export function createDiscussion(store: Pick<Store, 'root' | 'now'>, input: { title: string; model: string; style: string; sources: string[] }): Discussion {
  const id = nextDiscussionId(store.root);
  const d: Discussion = {
    id, title: input.title.trim().slice(0, 120) || 'A change', status: 'open', model: input.model, style: input.style,
    started: (store.now?.() ?? new Date()).toISOString(), sources: input.sources, attachments: [], entries: [], path: `${DISCUSSIONS_DIR}/${id}.md`,
  };
  writeDiscussion(store.root, d);
  return d;
}

/** Adds entries and saves the file (no commit). Refuses anything that looks like a key. */
export function appendEntries(root: string, d: Discussion, entries: Entry[], patch: Partial<Pick<Discussion, 'sources' | 'attachments' | 'model'>> = {}): Result<Discussion, 'key'> {
  if (entries.some((e) => looksLikeKey(e.text))) return fail('key', 'This looks like a key. Keel will not send or save it.');
  const next = { ...d, ...patch, entries: [...d.entries, ...entries], attachments: [...new Set([...d.attachments, ...(patch.attachments ?? [])])] };
  writeDiscussion(root, next);
  return ok(next);
}

/** Commits the discussion file as it is (one Keel commit). */
export async function commitDiscussion(store: Pick<Store, 'root'>, d: Discussion, message = `Discussion ${d.id}: ${d.title}`): Promise<void> {
  await commitFiles(store.root, [d.path], message);
}

/** Parks a discussion without a change request: it stays in .keel/discussions, listed as Parked. */
export async function parkDiscussion(store: Pick<Store, 'root'>, id: string): Promise<Result<Discussion, 'not-found' | 'wrong-status'>> {
  const d = readDiscussion(store.root, id);
  if (!d) return fail('not-found', `No discussion ${id}`);
  if (d.status === 'cr') return fail('wrong-status', `${id} already led to ${d.cr}`);
  const parked = { ...d, status: 'parked' as const };
  writeDiscussion(store.root, parked);
  await commitDiscussion(store, parked, `Park discussion ${id}`);
  return ok(parked);
}

/** Moves the discussion into the change request's folder as discussion.md (the caller commits both paths). */
export function moveToChange(root: string, d: Discussion, cr: string, folder: string): Discussion {
  const moved = { ...d, status: 'cr' as const, cr, path: `${folder}/discussion.md` };
  writeDiscussion(root, moved);
  // Like git mv: the file leaves .keel/discussions (Keel's own file; the commit records the move when it was tracked).
  if (d.path !== moved.path) rmSync(join(root, d.path), { force: true });
  return moved;
}
