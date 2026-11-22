// Read-back (REQ-007, ADR-0012, task R6): changes the coding agent made to docs/, tasks/ and features/ in the
// project folder, waiting for review. The agent's text is already in the folder, committed or not:
// - Accept makes it the document's next version (an approved document goes back to draft), as a Keel commit.
// - Dismiss puts Keel's last version back.
// What was reviewed (`base` and `handled`) is committed in .keel/config.yml; the last check (time, pending
// changes, CI results) is volatile and kept in .keel/cache/readback.json.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { simpleGit } from 'simple-git';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { CiResults } from './ci';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/store';
import { kindFromPath, parseDocument, readDocument, saveDocument, serializeDocument, type StoredDocument } from '../store/documents';
import { commitBlocker, commitFiles, keelVersionOf } from '../store/git';
import { fromYamlTime, readConfig, updateConfig } from '../store/workspace';

/** The commit value of a change that is not committed yet. */
export const WORKING_TREE = 'working-tree';
export const UNCOMMITTED = 'Uncommitted edit';

export interface PendingChange {
  path: string;        // e.g. docs/plan.md
  commit: string;      // the agent's latest commit that changed it, or "working-tree" for an uncommitted edit
  committed?: string;  // an uncommitted edit on top of agent commits: the latest of those commits
  messages: string[];  // the subjects of the agent's commits that changed it, oldest first ("Uncommitted edit" last)
  author: string;
  date: string;
}

export interface ReadbackState {
  checked?: string;    // ISO time of the last check
  base?: string;       // changes up to this commit are reviewed
  pending: PendingChange[];
  handled: { path: string; commit: string; outcome: 'accepted' | 'dismissed' }[];  // reviewed since base, not shown again
  ci?: CiResults;      // scenario results per requirement from the latest CI run (GitHub only)
  ciNote?: string;     // why there are no CI results, if there are none
}

export type ReadbackError = 'not-found' | 'not-initialised' | 'invalid-change' | 'check-failed' | 'repo-busy';

/** Repository path of the volatile state of the last check. */
export const READBACK_CACHE = '.keel/cache/readback.json';

const pendingSchema = z.object({
  path: z.string(), commit: z.string().regex(/^([0-9a-f]{7,40}|working-tree)$/), committed: z.string().regex(/^[0-9a-f]{7,40}$/).optional(),
  messages: z.array(z.string()), author: z.string(), date: z.preprocess(fromYamlTime, z.string()),
});
const handledSchema = z.object({ path: z.string(), commit: z.string(), outcome: z.enum(['accepted', 'dismissed']) });
const reviewedSchema = z.object({ base: z.string().regex(/^[0-9a-f]{7,40}$/).optional(), handled: z.array(handledSchema).default([]) });
const checkSchema = z.object({
  checked: z.string().optional(),
  pending: z.array(pendingSchema).default([]),
  ci: z.object({
    run: z.number(), url: z.string(), commit: z.string(), date: z.string(),
    requirements: z.record(z.string(), z.object({ passed: z.number(), total: z.number() })),
  }).optional(),
  ciNote: z.string().optional(),
});

/** What the last check found, with what was reviewed. */
export function readbackState(store: Pick<Store, 'root'>): ReadbackState {
  const reviewed = reviewedSchema.safeParse(readConfig(store.root)?.readback ?? {});
  let check: z.infer<typeof checkSchema> = { pending: [] };
  try {
    const parsed = checkSchema.safeParse(JSON.parse(readFileSync(join(store.root, READBACK_CACHE), 'utf8')));
    if (parsed.success) check = parsed.data;
  } catch {
    // No check yet, or the cache was removed: nothing pending until the next check.
  }
  return { ...check, ...(reviewed.success ? reviewed.data : { handled: [] }) };
}

/** Saves what a check found. The cache is ignored by git, so this never commits. */
export function saveCheck(store: Pick<Store, 'root'>, check: Pick<ReadbackState, 'checked' | 'pending' | 'ci' | 'ciNote'>): void {
  const file = join(store.root, READBACK_CACHE);
  mkdirSync(dirname(file), { recursive: true });
  const { checked, pending, ci, ciNote } = check;
  writeFileAtomic(file, `${JSON.stringify({ checked, pending, ci, ciNote }, null, 2)}\n`);
}

/** A fingerprint of an uncommitted file, so a dismissed new file Keel did not write is not shown again. */
export function workingTreeKey(root: string, path: string): string {
  const file = join(root, path);
  const content = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  return `wt:${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
}

/** The agent's version of a file: what is in the folder now. */
export function changedContent(store: Pick<Store, 'root'>, change: Pick<PendingChange, 'path'>): string | undefined {
  const file = join(store.root, change.path);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** Keel's last version of a file, to compare the agent's change with. */
export async function keelContent(store: Pick<Store, 'root'>, path: string): Promise<string | undefined> {
  return keelVersionOf(store.root, path);
}

const isFeature = (path: string) => /^features\/[A-Za-z0-9._-]+\.feature$/.test(path);

function reasonOf(change: PendingChange): string {
  const commits = change.messages.filter((m) => m !== UNCOMMITTED);
  if (change.commit === WORKING_TREE && !change.committed) return 'Read back uncommitted edit';
  const from = (change.committed ?? change.commit).slice(0, 7);
  return `Read back from ${from}: ${commits.join('; ') || 'agent change'}${change.commit === WORKING_TREE ? ' (with an uncommitted edit)' : ''}`;
}

/**
 * Accepts a pending change. For a document Keel already keeps, the agent's text becomes its next version and
 * Keel keeps its header (ID, status, approvals); an approved document goes back to draft (owner decision).
 * A new file with a Keel header, such as a task the agent added, is taken as it is. A scenario file is
 * taken as the agent left it.
 */
export async function acceptChange(store: Store, path: string): Promise<Result<StoredDocument | { path: string }, ReadbackError>> {
  const state = readbackState(store);
  const change = state.pending.find((c) => c.path === path);
  if (!change) return fail('not-found', `No pending change for ${path}`);
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const content = changedContent(store, change);
  if (content === undefined) return fail('invalid-change', `${path} was removed in the folder`);
  const reason = reasonOf(change);

  if (isFeature(path)) {
    if (change.commit === WORKING_TREE) await commitFiles(store.root, [path], `${reason} (${path})`);
    await markHandled(store, state, change, 'accepted');
    return ok({ path });
  }
  if (!kindFromPath(path)) return fail('invalid-change', `${path} is not a document Keel keeps`);

  const parsed = parseDocument(content);
  const known = await keelContent(store, path);
  const keel = known === undefined ? undefined : parseDocument(known);
  let saved: Result<StoredDocument, string>;
  if (keel?.ok) {
    const body = parsed.ok ? parsed.value.body : matter(content, {}).content.replace(/^\n/, '');
    // Keel's header stays: put it back on the agent's text, then save that as the next version.
    writeFileAtomic(join(store.root, path), serializeDocument(keel.value.header, body));
    const reopen = keel.value.header.status === 'approved';
    saved = await saveDocument(store, path, {
      body, external: true,
      reason: reopen ? `${reason} (back to draft for approval)` : reason,
      ...(reopen ? { status: 'draft' as const } : {}),
    });
  } else {
    if (!parsed.ok) return fail('invalid-change', `${path} has no valid Keel header, so it cannot be taken as a new document`);
    const { header } = parsed.value;
    if (change.commit === WORKING_TREE) await commitFiles(store.root, [path], `${header.id} v${header.version}: ${reason}`);
    saved = readDocument(store, path);
  }
  if (!saved.ok) return fail('invalid-change', saved.message);
  await markHandled(store, state, change, 'accepted');
  return ok(saved.value);
}

/** Dismisses a pending change: Keel's last version goes back into the folder. A new file Keel never wrote stays. */
export async function dismissChange(store: Store, path: string): Promise<Result<PendingChange, ReadbackError>> {
  const state = readbackState(store);
  const change = state.pending.find((c) => c.path === path);
  if (!change) return fail('not-found', `No pending change for ${path}`);
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  const known = await keelContent(store, path);
  if (known !== undefined) {
    const file = join(store.root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileAtomic(file, known);
    await commitFiles(store.root, [path], `restore ${path} (read-back dismissed)`);
  }
  await markHandled(store, state, change, 'dismissed');
  return ok(change);
}

/**
 * Moves a change from pending to handled. Once no committed change is waiting, the reviewed base moves to
 * HEAD and only the fingerprints of dismissed uncommitted files stay in the handled list, so
 * .keel/config.yml stays short.
 */
async function markHandled(store: Store, state: ReadbackState, change: PendingChange, outcome: 'accepted' | 'dismissed'): Promise<void> {
  const pending = state.pending.filter((c) => c.path !== change.path);
  const keys = [change.commit === WORKING_TREE ? workingTreeKey(store.root, change.path) : change.commit, ...(change.committed ? [change.committed] : [])];
  let handled = [...state.handled, ...keys.map((commit) => ({ path: change.path, commit, outcome }))];
  let base = state.base;
  if (!pending.some((c) => c.commit !== WORKING_TREE || c.committed)) {
    base = (await simpleGit(store.root).revparse(['HEAD']).catch(() => '')).trim() || base;
    handled = handled.filter((h) => h.commit.startsWith('wt:') && h.outcome === 'dismissed');
  }
  saveCheck(store, { ...state, pending });
  await updateConfig(store, { readback: { ...(base ? { base } : {}), handled } }, `${outcome === 'accepted' ? 'accept' : 'dismiss'} read-back of ${change.path}`);
}
