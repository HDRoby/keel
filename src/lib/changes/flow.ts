// What happens to a change request (REQ-014, task R18): submit, approve or reject, the size, the decision on each
// affected document (Update, Still valid, Later), the change package for the coding agent, and the documents shown
// out of date while a significant request is approved but not applied (REQ-005).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readExplore } from '../brainstorm/session';
import { settlePending } from '../scenarios/store';
import { settleDesignChange } from '../decisions/records';
import { applyIntentChange, revertIntentChange } from '../generate/intent';
import { regeneratePlan } from '../generate/plan';
import { regenerateSpec } from '../generate/spec';
import type { Writer } from '../generate/writer';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/db';
import { readDocument, saveDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { today } from '../store/workspace';
import { buildTrace, impactOf } from '../trace/index';
import { readChange, setChangeStatus, updateKeelChange, type ChangeRequest, type ImpactDecision } from './store';

export type FlowError = 'not-found' | 'wrong-status' | 'not-keel' | 'repo-busy' | 'failed';

function find(store: Pick<Store, 'root'>, id: string): Result<ChangeRequest, FlowError> {
  const cr = /^CR-\d{4,}$/.test(id) ? readChange(store.root, id) : undefined;
  if (!cr) return fail('not-found', `No change request ${id}`);
  if (cr.error) return fail('wrong-status', `${id}: ${cr.error}`);
  return ok(cr);
}

/** True for the request Explore saved its edits in: approving it applies them to intent.md. */
function raisedInExplore(store: Pick<Store, 'root'>, cr: ChangeRequest): boolean {
  if (cr.origin !== 'keel' || cr.source !== 'docs/intent.md') return false;
  const state = readExplore(store);
  return state.ok && state.value.changeRequest === cr.id;
}

const failed = <T>(r: Result<T, string>): Result<never, FlowError> => fail(r.ok ? 'failed' : r.error === 'repo-busy' ? 'repo-busy' : 'failed', r.ok ? '' : r.message);

/** Draft → Waiting for approval. */
export async function submitChange(store: Store, id: string): Promise<Result<ChangeRequest, FlowError>> {
  const cr = find(store, id);
  if (!cr.ok) return cr;
  if (cr.value.status !== 'draft') return fail('wrong-status', `${id} is not a draft`);
  const saved = await setChangeStatus(store, cr.value, 'waiting');
  return saved.ok ? saved : failed(saved);
}

/** Size before approval (Keel requests): significant changes mark later documents out of date once approved. */
export async function setChangeSize(store: Store, id: string, size: 'minor' | 'significant'): Promise<Result<ChangeRequest, FlowError>> {
  const cr = find(store, id);
  if (!cr.ok) return cr;
  if (cr.value.status === 'approved' || cr.value.status === 'rejected') return fail('wrong-status', `${id} is already ${cr.value.status}`);
  const saved = await updateKeelChange(store, cr.value, { size }, undefined, `${id}: size ${size}`);
  return saved.ok ? saved : fail(saved.error === 'not-keel' ? 'not-keel' : 'failed', saved.message);
}

/**
 * Approve. A Keel request raised from Explore writes the next intent version (owner decision 1). A minor request
 * leaves later documents valid (no impact to resolve); a significant one keeps its affected documents to resolve.
 */
export async function approveChange(store: Store, id: string, by: string): Promise<Result<ChangeRequest, FlowError>> {
  const cr = find(store, id);
  if (!cr.ok) return cr;
  if (cr.value.status !== 'draft' && cr.value.status !== 'waiting') return fail('wrong-status', `${id} is already ${cr.value.status}`);
  if (raisedInExplore(store, cr.value)) {
    const applied = await applyIntentChange(store, id);
    if (!applied.ok) return failed(applied);
  }
  await settlePending(store, id, true);   // scenario edits held for this request (CR-0006)
  await settleDesignChange(store, id, true);   // a design decision changed after approval (CR-0007)
  const extra = { approved_by: by.trim() || 'owner', approved_on: today(store), ...(cr.value.origin === 'keel' && cr.value.size === 'minor' ? { impact: [] } : {}) };
  const saved = await setChangeStatus(store, cr.value, 'approved', cr.value.origin === 'keel' ? extra : {});
  return saved.ok ? saved : failed(saved);
}

/** Reject. Explore goes back to the approved intent for a request raised there (owner decision 1). */
export async function rejectChange(store: Store, id: string): Promise<Result<ChangeRequest, FlowError>> {
  const cr = find(store, id);
  if (!cr.ok) return cr;
  if (cr.value.status !== 'draft' && cr.value.status !== 'waiting') return fail('wrong-status', `${id} is already ${cr.value.status}`);
  if (raisedInExplore(store, cr.value)) {
    const reverted = await revertIntentChange(store);
    if (!reverted.ok && reverted.error !== 'not-found') return failed(reverted);
  }
  await settlePending(store, id, false);
  await settleDesignChange(store, id, false);
  const saved = await setChangeStatus(store, cr.value, 'rejected');
  return saved.ok ? saved : failed(saved);
}

/**
 * The decision on one affected document. Update makes its next version a draft regenerated from the changed
 * upstream, recording `change: CR-NNNN` (owner decision 3); Still valid and Later are recorded as they are.
 */
export async function decideImpact(store: Store, id: string, document: string, decision: Exclude<ImpactDecision, 'pending'>, write: Writer): Promise<Result<ChangeRequest, FlowError>> {
  const cr = find(store, id);
  if (!cr.ok) return cr;
  if (cr.value.origin !== 'keel') return fail('not-keel', `${id} was written by hand: its tasks apply it`);
  if (cr.value.status !== 'approved') return fail('wrong-status', `Approve ${id} first`);
  if (!cr.value.impact.some((i) => i.document === document)) return fail('not-found', `${id} does not affect ${document}`);
  if (decision === 'updated') {
    const doc = readDocument(store, document);
    if (!doc.ok) return fail('not-found', doc.message);
    if (doc.value.header.status !== 'draft') {
      const reopened = await saveDocument(store, document, { reason: `Reopened for ${id}`, status: 'draft', sameVersion: true, extra: { change: id } });
      if (!reopened.ok) return failed(reopened);
    }
    const regenerated = document === 'docs/spec.md' ? await regenerateSpec(store, write) : document === 'docs/plan.md' ? await regeneratePlan(store, write) : undefined;
    if (regenerated && !regenerated.ok) return failed(regenerated);
    const marked = await saveDocument(store, document, { reason: `Update for ${id}`, sameVersion: true, extra: { change: id } });
    if (!marked.ok) return failed(marked);
  }
  const impact = cr.value.impact.map((i) => (i.document === document ? { ...i, decision } : i));
  const saved = await updateKeelChange(store, cr.value, { impact }, undefined, `${id}: ${document} ${decision === 'updated' ? 'updated' : decision === 'valid' ? 'still valid' : 'later'}`);
  return saved.ok ? saved : fail('failed', saved.message);
}

/** The files of the change package: PROMPT.md, the affected task files and the scenarios, inside the request's folder. */
export function packageFiles(store: Pick<Store, 'root'>, cr: ChangeRequest): { path: string; content: string }[] {
  const trace = buildTrace(store.root);
  const impact = impactOf(trace, cr.requirements);
  const tasks = impact.tasks.map((t) => ({ path: `tasks/${t.id}.md`, from: join(store.root, 'tasks', `${t.id}.md`) })).filter((t) => existsSync(t.from));
  const features = [...new Set(impact.scenarios.map((s) => s.label.split(' › ')[0] ?? ''))].filter((f) => f && existsSync(join(store.root, f)));
  const prompt = [
    '# Prompt for the coding agent', '',
    `Implement change request ${cr.id} in \`${cr.folder}/\`: ${cr.title}.`, '',
    `1. Read \`${cr.file}\` first, then \`AGENTS.md\`.`,
    `2. The documents it changed are already updated in \`docs/\`${cr.impact.length ? ` (${cr.impact.map((i) => i.document).join(', ')})` : ''}.`,
    `3. Work through the tasks it affects${tasks.length ? `: ${tasks.map((t) => t.path).join(', ')}` : ''}. Requirements: ${cr.requirements.join(', ') || 'none named'}.`,
    `4. Make the scenarios pass${features.length ? `: ${features.join(', ')}` : ''}. Do not edit \`.feature\` files to make a scenario pass.`,
    '5. Set each task\'s status to done when it is, and keep the checks green. Keel reads your commits back.', '',
  ].join('\n');
  return [
    { path: `${cr.folder}/PROMPT.md`, content: prompt },
    ...tasks.map((t) => ({ path: `${cr.folder}/${t.path}`, content: readFileSync(t.from, 'utf8') })),
    ...features.map((f) => ({ path: `${cr.folder}/${f}`, content: readFileSync(join(store.root, f), 'utf8') })),
  ];
}

/** Writes the change package into the request's folder as one Keel commit. Keel requests only. */
export async function writePackage(store: Store, id: string): Promise<Result<string[], FlowError>> {
  const cr = find(store, id);
  if (!cr.ok) return cr;
  if (cr.value.origin !== 'keel') return fail('not-keel', `${id} was written by hand; its package is its own files`);
  if (cr.value.status !== 'approved') return fail('wrong-status', `Approve ${id} first`);
  const files = packageFiles(store, cr.value);
  for (const file of files) {
    mkdirSync(join(store.root, file.path, '..'), { recursive: true });
    writeFileAtomic(join(store.root, file.path), file.content);
  }
  await commitFiles(store.root, [cr.value.folder], `Change package for ${id}`);
  return ok(files.map((f) => f.path));
}
