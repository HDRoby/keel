// Read-back (REQ-007, task T9): changes the coding agent made to docs/ and tasks/ in the repository, waiting
// for review. Kept in project.md, so they live in git like everything else. Accepting one saves the agent's
// text as the document's next version, with the commit as the reason; dismissing hides it. Either way that
// commit is handled for that file and only a later commit to the file shows up again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import type { CiResults } from './ci';
import type { Store } from '../store/db';
import { kindFromPath, parseDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitFiles, fileAt } from '../store/git';
import { handoffDir } from '../github/push';
import { fromYamlTime, PROJECT_FILE, projectDir, readProject } from '../store/workspace';

export interface PendingChange {
  path: string;        // e.g. docs/plan.md
  commit: string;      // the agent's latest commit that changed it
  messages: string[];  // the subjects of the agent's commits that changed it, oldest first
  author: string;
  date: string;
}

export interface ReadbackState {
  checked?: string;    // ISO time of the last check
  head?: string;       // the remote commit seen at the last check
  pending: PendingChange[];
  handled: { path: string; commit: string; outcome: 'accepted' | 'dismissed' }[];  // reviewed changes, not shown again
  ci?: CiResults;      // scenario results per requirement from the latest CI run (GitHub only)
  ciNote?: string;     // why there are no CI results, if there are none
}

export type ReadbackError = 'not-found' | 'not-pushed' | 'invalid-change' | 'check-failed';

const pendingSchema = z.object({ path: z.string(), commit: z.string().regex(/^[0-9a-f]{7,40}$/), messages: z.array(z.string()), author: z.string(), date: z.preprocess(fromYamlTime, z.string()) });
const stateSchema = z.object({
  checked: z.preprocess(fromYamlTime, z.string()).optional(),
  head: z.string().optional(),
  pending: z.array(pendingSchema).default([]),
  handled: z.array(z.object({ path: z.string(), commit: z.string(), outcome: z.enum(['accepted', 'dismissed']) })).default([]),
  ci: z.object({
    run: z.number(), url: z.string(), commit: z.string(), date: z.preprocess(fromYamlTime, z.string()),
    requirements: z.record(z.string(), z.object({ passed: z.number(), total: z.number() })),
  }).optional(),
  ciNote: z.string().optional(),
});

export function readbackState(store: Store, slug: string): ReadbackState {
  const file = join(projectDir(slug, store.home), PROJECT_FILE);
  if (!existsSync(file)) return { pending: [], handled: [] };
  const parsed = stateSchema.safeParse(matter(readFileSync(file, 'utf8'), {}).data.readback ?? {});
  return parsed.success ? parsed.data : { pending: [], handled: [] };
}

/** Saves the state; commits only when the pending or handled changes are different. */
export async function saveReadbackState(store: Store, slug: string, state: ReadbackState, message: string): Promise<void> {
  const dir = projectDir(slug, store.home);
  const file = join(dir, PROJECT_FILE);
  const parsed = matter(readFileSync(file, 'utf8'), {});
  const previous = readbackState(store, slug);
  const before = JSON.stringify({ pending: previous.pending, handled: previous.handled });
  writeFileSync(file, matter.stringify(parsed.content, { ...parsed.data, readback: state }));
  if (before !== JSON.stringify({ pending: state.pending, handled: state.handled })) {
    const project = readProject(slug, store.home);
    await commitFiles(dir, [PROJECT_FILE], `${project.ok ? project.value.id : slug}: ${message}`);
  }
}

/** The agent's version of a file, read from Keel's working copy of the repository. */
export async function changedContent(store: Store, slug: string, change: PendingChange): Promise<string | undefined> {
  return fileAt(handoffDir(store, slug), change.commit, change.path);
}

/**
 * Accepts a pending change. For an existing document the agent's text becomes its next version and Keel keeps
 * the header (ID, status, approvals); a new file, such as a task the agent added, is taken as it is.
 */
export async function acceptChange(store: Store, slug: string, path: string): Promise<Result<StoredDocument, ReadbackError>> {
  const state = readbackState(store, slug);
  const change = state.pending.find((c) => c.path === path);
  if (!change) return fail('not-found', `No pending change for ${path}`);
  if (!kindFromPath(path)) return fail('invalid-change', `${path} is not a document Keel keeps`);
  const content = await changedContent(store, slug, change);
  if (content === undefined) return fail('invalid-change', `${path} was removed in the repository`);
  const reason = `Read back from ${change.commit.slice(0, 7)}: ${change.messages.join('; ') || 'agent change'}`;
  const parsed = parseDocument(content);
  const current = readDocument(store, slug, path);
  let saved: Result<StoredDocument, string>;
  if (current.ok) {
    const body = parsed.ok ? parsed.value.body : matter(content, {}).content.replace(/^\n/, '');
    // Owner decision: an accepted change to an approved document needs a new approval.
    const reopen = current.value.header.status === 'approved';
    saved = await saveDocument(store, slug, path, { body, reason: reopen ? `${reason} (back to draft for approval)` : reason, ...(reopen ? { status: 'draft' as const } : {}) });
  } else {
    if (!parsed.ok) return fail('invalid-change', `${path} has no valid Keel header, so it cannot be taken as a new document`);
    const dir = projectDir(slug, store.home);
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
    await commitFiles(dir, [path], `${parsed.value.header.id} v${parsed.value.header.version}: ${reason}`);
    saved = readDocument(store, slug, path);
    if (saved.ok) store.index.upsertDocument(slug, saved.value);
  }
  if (!saved.ok) return fail('invalid-change', saved.message);
  await markHandled(store, slug, state, change, 'accepted');
  return ok(saved.value);
}

/** Dismisses a pending change. The same file changes again in a later commit: it shows up again. */
export async function dismissChange(store: Store, slug: string, path: string): Promise<Result<PendingChange, ReadbackError>> {
  const state = readbackState(store, slug);
  const change = state.pending.find((c) => c.path === path);
  if (!change) return fail('not-found', `No pending change for ${path}`);
  await markHandled(store, slug, state, change, 'dismissed');
  return ok(change);
}

/** Moves a change from pending to handled, so that commit is not shown again for that file. */
async function markHandled(store: Store, slug: string, state: ReadbackState, change: PendingChange, outcome: 'accepted' | 'dismissed'): Promise<void> {
  const { path, commit } = change;
  await saveReadbackState(store, slug, {
    ...state,
    pending: state.pending.filter((c) => c.path !== path),
    handled: [...state.handled, { path, commit, outcome }],
  }, `${outcome === 'accepted' ? 'accept' : 'dismiss'} read-back of ${path}`);
}
