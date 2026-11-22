// Change requests (REQ-014, task R18): folders in changes/, raised by Keel or written by hand, in one format:
// changes/CR-NNNN/CR-NNNN.md with a header (id, title, status, size, affects, requirements, depends_on,
// created, author) and, as the request needs, PROMPT.md, tasks/, features/, decisions/, docs/, mock-source/.
// Keel reads them on every page load. It never rewrites a hand-written request's files; it only changes the
// status line of its header on approve or reject, as a Keel commit.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { changeBody, type ChangeDraft } from './body';
import { writeChangesIndex } from './index-file';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/store';
import { commitBlocker, commitFiles } from '../store/git';
import { fromYamlDate, readProject, today } from '../store/workspace';

/** The folder of change requests, at the project root. */
export const CHANGES_DIR = 'changes';
const CR_ID = /^CR-(\d{4,})$/;

export type HeaderStatus = 'draft' | 'waiting' | 'approved' | 'rejected';
export type ImpactDecision = 'pending' | 'updated' | 'valid' | 'later';

export interface ChangeTask {
  id: string;          // e.g. R18
  file: string;        // the request's copy, e.g. changes/CR-0003/tasks/R18.md
  status: string;      // from the project's tasks/<file> once copied there, else the request's copy
}

export interface ImpactRecord {
  document: string;    // e.g. docs/spec.md
  decision: ImpactDecision;
}

export interface ChangeRequest {
  id: string;
  number: number;
  folder: string;      // e.g. changes/CR-0003
  file: string;        // e.g. changes/CR-0003/CR-0003.md
  title: string;
  status: HeaderStatus;
  size?: 'minor' | 'significant';
  affects: string[];
  requirements: string[];   // REQ IDs found in the header's requirements
  dependsOn: string[];
  created?: string;
  author?: string;
  origin: 'keel' | 'hand';
  source?: string;          // the document a Keel request changes, e.g. docs/intent.md
  impact: ImpactRecord[];   // Keel requests: the decision for each affected document
  tasks: ChangeTask[];
  hasPrompt: boolean;
  body: string;
  error?: string;           // the header could not be read: listed with this line, never hidden
}

const list = z.preprocess((v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]), z.array(z.coerce.string()));
const headerSchema = z.looseObject({
  id: z.string().regex(CR_ID),
  title: z.string().min(1),
  status: z.enum(['draft', 'waiting', 'approved', 'rejected']),
  size: z.enum(['minor', 'significant']).optional(),
  affects: list,
  requirements: list,
  depends_on: list,
  created: z.preprocess(fromYamlDate, z.string()).optional(),
  author: z.string().optional(),
  origin: z.enum(['keel', 'hand']).optional(),
  source: z.string().optional(),
  impact: z.array(z.object({ document: z.string(), decision: z.enum(['pending', 'updated', 'valid', 'later']) })).default([]),
});

const taskStatus = (text: string) => {
  try {
    const status = matter(text, {}).data.status;
    return typeof status === 'string' ? status : 'todo';
  } catch {
    return 'todo';
  }
};

function tasksOf(root: string, folder: string): ChangeTask[] {
  const dir = join(root, folder, 'tasks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((name) => {
    const copied = join(root, 'tasks', name);
    const own = join(dir, name);
    return { id: name.replace(/\.md$/, ''), file: `${folder}/tasks/${name}`, status: taskStatus(readFileSync(existsSync(copied) ? copied : own, 'utf8')) };
  });
}

/** Reads one change request folder. A header that does not parse gives a request with `error`. */
export function readChange(root: string, folderName: string): ChangeRequest | undefined {
  const match = CR_ID.exec(folderName);
  if (!match) return undefined;
  const folder = `${CHANGES_DIR}/${folderName}`;
  const file = `${folder}/${folderName}.md`;
  if (!existsSync(join(root, file))) return undefined;
  const base = { id: folderName, number: Number(match[1]), folder, file, tasks: tasksOf(root, folder), hasPrompt: existsSync(join(root, folder, 'PROMPT.md')) };
  const text = readFileSync(join(root, file), 'utf8');
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(text, {});
  } catch (error) {
    // Hand-written headers are not always valid YAML (an unquoted "Title: subtitle"); read them line by line.
    const lenient = lenientHeader(text);
    if (!lenient) return { ...base, title: folderName, status: 'draft', affects: [], requirements: [], dependsOn: [], origin: 'hand', impact: [], body: '', error: `Cannot read header: ${error instanceof Error ? error.message.split('\n')[0] : 'invalid YAML'}` };
    parsed = lenient;
  }
  const header = headerSchema.safeParse(parsed.data);
  if (!header.success || header.data.id !== folderName) {
    const reason = header.success ? `id ${header.data.id} does not match the folder` : (z.prettifyError(header.error).split('\n')[0] ?? 'invalid header');
    return { ...base, title: typeof parsed.data.title === 'string' ? parsed.data.title : folderName, status: 'draft', affects: [], requirements: [], dependsOn: [], origin: 'hand', impact: [], body: parsed.content, error: `Cannot read header: ${reason}` };
  }
  const h = header.data;
  return {
    ...base, title: h.title, status: h.status, ...(h.size ? { size: h.size } : {}), affects: h.affects,
    requirements: [...new Set(h.requirements.join(' ').match(/REQ-\d{3,}/g) ?? [])],
    dependsOn: h.depends_on.flatMap((d) => d.match(/CR-\d{4,}/g) ?? []),
    ...(h.created ? { created: h.created } : {}), ...(h.author ? { author: h.author } : {}),
    origin: h.origin ?? 'hand', ...(h.source ? { source: h.source } : {}), impact: h.impact, body: parsed.content,
  };
}

/**
 * A header read line by line, for hand-written files YAML cannot parse: "key: value" per line, "[a, b]" as a list.
 * Undefined when there is no front matter at all.
 */
export function lenientHeader(text: string): { data: Record<string, unknown>; content: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return undefined;
  const data: Record<string, unknown> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const value = (pair[2] ?? '').trim();
    data[pair[1] ?? ''] = /^\[.*\]$/.test(value) ? value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean) : value.replace(/^(["'])(.*)\1$/, '$2');
  }
  return { data, content: match[2] ?? '' };
}

/** Every change request in changes/, by number. Other entries (README.md) are ignored. */
export function listChanges(root: string): ChangeRequest[] {
  const dir = join(root, CHANGES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => CR_ID.test(name) && statSync(join(dir, name)).isDirectory())
    .flatMap((name) => readChange(root, name) ?? [])
    .sort((a, b) => a.number - b.number);
}

export type ComputedStatus =
  | { kind: 'unreadable'; label: string }
  | { kind: 'rejected'; label: 'Rejected' }
  | { kind: 'draft'; label: 'Draft' }
  | { kind: 'waiting'; label: 'Waiting for approval' }
  | { kind: 'blocked'; label: string; blockedBy: string }
  | { kind: 'ready'; label: 'Approved · ready' }
  | { kind: 'progress'; label: 'In progress' }
  | { kind: 'applied'; label: 'Applied' };

const done = (t: ChangeTask) => t.status === 'done';

/**
 * True when the request is applied: all its tasks are done, or, for a request with no tasks, every affected
 * document is resolved (Update done or Still valid; owner decision 2). Later keeps it open. A hand-written request
 * without tasks is never applied: there is nothing to read its progress from.
 */
export function isApplied(cr: ChangeRequest): boolean {
  if (cr.status !== 'approved' || cr.error) return false;
  if (cr.tasks.length > 0) return cr.tasks.every(done);
  // Without tasks, only a Keel request can tell: every affected document resolved. A hand-written one waits for tasks.
  return cr.origin === 'keel' && cr.impact.every((i) => i.decision === 'updated' || i.decision === 'valid');
}

/** The status shown, from the header, the requests it depends on, and its tasks (pure). */
export function computeStatus(cr: ChangeRequest, all: ChangeRequest[]): ComputedStatus {
  if (cr.error) return { kind: 'unreadable', label: cr.error };
  if (cr.status === 'rejected') return { kind: 'rejected', label: 'Rejected' };
  if (cr.status === 'draft') return { kind: 'draft', label: 'Draft' };
  if (cr.status === 'waiting') return { kind: 'waiting', label: 'Waiting for approval' };
  if (isApplied(cr)) return { kind: 'applied', label: 'Applied' };
  if (cr.tasks.some(done)) return { kind: 'progress', label: 'In progress' };
  const blocker = cr.dependsOn.find((id) => {
    const dep = all.find((c) => c.id === id);
    return !dep || !isApplied(dep);
  });
  if (blocker) return { kind: 'blocked', label: `Approved · waiting for ${blocker}`, blockedBy: blocker };
  return { kind: 'ready', label: 'Approved · ready' };
}

/** "3 of 9 tasks done", or what is left for a request without tasks. */
export function progressLabel(cr: ChangeRequest): string {
  if (cr.tasks.length > 0) return `${cr.tasks.filter(done).length} of ${cr.tasks.length} task${cr.tasks.length === 1 ? '' : 's'} done`;
  if (cr.impact.length > 0) return `${cr.impact.filter((i) => i.decision === 'updated' || i.decision === 'valid').length} of ${cr.impact.length} documents resolved`;
  return 'No tasks';
}

/** Requests in dependency order: a request after the ones it depends on, then by number. Cycles do not loop. */
export function dependencyOrder(all: ChangeRequest[]): ChangeRequest[] {
  const out: ChangeRequest[] = [];
  const seen = new Set<string>();
  const visit = (cr: ChangeRequest, path: Set<string>) => {
    if (seen.has(cr.id) || path.has(cr.id)) return;
    path.add(cr.id);
    for (const id of cr.dependsOn) {
      const dep = all.find((c) => c.id === id);
      if (dep) visit(dep, path);
    }
    seen.add(cr.id);
    out.push(cr);
  };
  [...all].sort((a, b) => a.number - b.number).forEach((cr) => visit(cr, new Set()));
  return out;
}

/** The request to apply next: one already in progress first, else the first ready one, in dependency order. */
export function nextToApply(all: ChangeRequest[]): ChangeRequest | undefined {
  const ordered = dependencyOrder(all);
  return ordered.find((cr) => computeStatus(cr, all).kind === 'progress') ?? ordered.find((cr) => computeStatus(cr, all).kind === 'ready');
}

/** The next free number: the highest CR-NNNN in changes/ plus one, also counting unreadable folders. */
export function nextNumber(root: string): number {
  const dir = join(root, CHANGES_DIR);
  if (!existsSync(dir)) return 1;
  return readdirSync(dir).reduce((max, name) => Math.max(max, Number(CR_ID.exec(name)?.[1] ?? 0)), 0) + 1;
}

export const formatChangeId = (n: number) => `CR-${String(n).padStart(4, '0')}`;

export interface NewChange {
  title: string;
  reason: string;
  status?: HeaderStatus;            // default draft
  size?: 'minor' | 'significant';
  source?: string;                  // the document it changes
  affects?: string[];               // e.g. INT-0001@2
  requirements?: string[];
  dependsOn?: string[];
  impact?: ImpactRecord[];
  body?: string;                    // the request's markdown; otherwise written from the change request template
  draft?: ChangeDraft;              // the assistant's Why, What changes and Done when (CR-0013)
  requirementChanges?: { id: string; change: string; text: string }[];   // rows of "Requirement changes" (CR-0016)
  impactRows?: { area: string; requirements: string[]; what: string }[]; // rows of "Impact by requirement" (CR-0016)
  extra?: Record<string, unknown>;
  commit?: boolean;                 // false: write only, the caller commits (Discuss a change, CR-0016)
}

function header(store: Store, id: string, input: NewChange, author: string): Record<string, unknown> {
  return {
    id, project: projectId(store), title: input.title.trim(), author, created: today(store),
    status: input.status ?? 'draft', ...(input.size ? { size: input.size } : {}),
    affects: input.affects ?? [], requirements: input.requirements ?? [], ...(input.dependsOn?.length ? { depends_on: input.dependsOn } : {}),
    origin: 'keel', ...(input.source ? { source: input.source } : {}), ...(input.impact?.length ? { impact: input.impact } : {}), ...input.extra,
  };
}

function projectId(store: Pick<Store, 'root'>): string {
  const project = readProject(store.root);
  return project.ok ? project.value.id : 'PRJ-0001';
}

const defaultBody = (input: NewChange) => [`# ${input.title.trim()}`, '', '## Reason', '', input.reason.trim() || '_Not written yet._', '', '## What changed', '', '_Not written yet._', ''].join('\n');

/** Raises a change request: the next number, its folder and header, committed as "Keel: Raise CR-NNNN". */
export async function createChange(store: Store, input: NewChange): Promise<Result<ChangeRequest, 'invalid-input' | 'repo-busy'>> {
  if (!input.title.trim()) return fail('invalid-input', 'A change request needs a title');
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const project = readProject(store.root);
  const id = formatChangeId(nextNumber(store.root));
  const folder = `${CHANGES_DIR}/${id}`;
  mkdirSync(join(store.root, folder), { recursive: true });
  // The body: the caller's, or the chosen change request template (CR-0013), or the plain one for older projects.
  const fromTemplate = input.body === undefined ? changeBody(store, {
    id, title: input.title, reason: input.reason, requirements: input.requirements ?? [], impact: input.impact ?? [], ...(input.draft ? { draft: input.draft } : {}),
    ...(input.requirementChanges ? { requirementChanges: input.requirementChanges } : {}), ...(input.impactRows ? { impactRows: input.impactRows } : {}),
  }) : undefined;
  const fields = header(store, id, { ...input, extra: { ...(fromTemplate ? { template: fromTemplate.template } : {}), ...input.extra } }, project.ok ? project.value.author : 'Keel');
  writeFileAtomic(join(store.root, folder, `${id}.md`), matter.stringify(`\n${input.body ?? fromTemplate?.body ?? defaultBody(input)}`, fields));
  if (input.commit !== false) {
    await commitFiles(store.root, [folder], `Raise ${id}: ${input.title.trim()}`);
    await writeChangesIndex(store);   // changes/README.md (CR-0013)
  }
  const made = readChange(store.root, id);
  return made ? ok(made) : fail('invalid-input', `${id} could not be read back`);
}

/** Rewrites a Keel request's file (header and body). Never used on a hand-written request. */
export async function updateKeelChange(store: Store, cr: ChangeRequest, patch: Record<string, unknown>, body: string | undefined, message: string): Promise<Result<ChangeRequest, 'not-keel' | 'repo-busy' | 'not-found'>> {
  if (cr.origin !== 'keel') return fail('not-keel', `${cr.id} was written by hand; Keel only changes its status`);
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const parsed = matter(readFileSync(join(store.root, cr.file), 'utf8'), {});
  writeFileAtomic(join(store.root, cr.file), matter.stringify(body === undefined ? parsed.content : `\n${body}`, { ...parsed.data, ...patch }));
  await commitFiles(store.root, [cr.folder], message);
  const read = readChange(store.root, cr.id);
  return read ? ok(read) : fail('not-found', `${cr.id} is gone`);
}

/**
 * Sets the header's status. For a hand-written request only the status line changes (the rest of the file stays
 * byte for byte); a Keel request is rewritten with the new header.
 */
export async function setChangeStatus(store: Store, cr: ChangeRequest, status: HeaderStatus, extra: Record<string, unknown> = {}): Promise<Result<ChangeRequest, 'invalid-input' | 'repo-busy' | 'not-found'>> {
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const message = `${status === 'approved' ? 'Approve' : status === 'rejected' ? 'Reject' : 'Update'} ${cr.id}`;
  if (cr.origin === 'keel') {
    const updated = await updateKeelChange(store, cr, { status, ...extra }, undefined, message);
    return updated.ok ? updated : fail(updated.error === 'repo-busy' ? 'repo-busy' : 'not-found', updated.message);
  }
  const path = join(store.root, cr.file);
  const text = readFileSync(path, 'utf8');
  const end = text.indexOf('\n---', 4);
  if (!text.startsWith('---') || end < 0 || !/^status:.*$/m.test(text.slice(0, end))) return fail('invalid-input', `${cr.file} has no status line to change`);
  writeFileAtomic(path, text.slice(0, end).replace(/^status:.*$/m, `status: ${status}`) + text.slice(end));
  await commitFiles(store.root, [cr.file], message);
  const read = readChange(store.root, cr.id);
  return read ? ok(read) : fail('not-found', `${cr.id} is gone`);
}
