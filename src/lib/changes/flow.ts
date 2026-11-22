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
import type { Store } from '../store/store';
import { readDocument, saveDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { today } from '../store/workspace';
import { buildTrace, impactOf } from '../trace/index';
import matter from 'gray-matter';
import { fillSections } from '../brainstorm/sections';
import { handoffCommands } from '../handoff/scaffold';
import { buildFeature, type Keyword } from '../scenarios/gherkin';
import { readProject } from '../store/workspace';
import { chosenTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { CHANGES_INDEX, writeChangesIndex } from './index-file';
import { readPlan } from './plan';
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
  if (saved.ok) await writeChangesIndex(store);
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
  if (saved.ok) await writeChangesIndex(store);
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
  if (saved.ok) await writeChangesIndex(store);   // resolving the last document applies a request without tasks
  return saved.ok ? saved : fail('failed', saved.message);
}

/**
 * The files of the change package, inside the request's folder (CR-0013): PROMPT.md from the prompt template, a task
 * file per planned task from the task template, the accepted scenarios as a feature file, and the linked decision
 * records and mock screens. Before the change is planned: the affected task files and scenarios as they are.
 */
export function packageFiles(store: Pick<Store, 'root'>, cr: ChangeRequest): { path: string; content: string }[] {
  const plan = readPlan(store.root, cr.id);
  if (!plan) return unplannedPackage(store, cr);
  const project = readProject(store.root);
  const chosen = project.ok ? project.value.templates : {};
  const accepted = plan.scenarios.filter((s) => s.state === 'accepted');
  const slug = cr.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || cr.id.toLowerCase();
  const featurePath = `features/${slug}.feature`;
  const feature = accepted.length ? buildFeature({
    tags: [], name: cr.title, description: [`From ${cr.id}.`],
    scenarios: accepted.map((s) => ({ tags: [`@${s.req}`], name: s.name, steps: s.steps.map((x) => ({ keyword: x.keyword as Keyword, text: x.text })) })),
  }) : undefined;
  const taskTemplate = chosenTemplate(store.root, 'task', chosen);
  const tasks = plan.tasks.map((t) => {
    const scenarios = accepted.filter((s) => t.requirements.includes(s.req)).map((s) => `- \`${featurePath}\` › ${s.name} (@${s.req})`);
    const body = taskTemplate ? fillSections(renderTemplate(taskTemplate.content, { task_id: t.id, title: t.title }).body, {
      Goal: [t.goal || t.title],
      'Scenarios that prove it': [scenarios.join('\n') || 'None accepted yet: add them in Keel before handing off.'],
      Data: [t.data || 'None.'],
      'Files that are likely to change': [t.files.map((f) => (f.startsWith('To be decided') ? f : `- \`${f}\``)).join('\n')],
      Steps: [t.steps.map((x, i) => `${i + 1}. ${x}`).join('\n') || 'One step.'],
      Notes: [[...plan.linked.decisions.map((d) => `- Decision record: \`${d}\``), ...plan.linked.mocks.map((m) => `- Mock screen: \`${m}\``)].join('\n') || 'None.'],
      'Questions for the owner': ['(none yet)'],
    }) : `# ${t.id} · ${t.title}\n\n## Goal\n\n${t.goal}\n\n## As built\n\n`;
    const content = matter.stringify(`\n${body}`, { id: t.id, change: cr.id, requirements: t.requirements, status: 'todo', ...(taskTemplate ? { template: taskTemplate.ref } : {}) });
    return { path: `${cr.folder}/tasks/${t.id}.md`, content };
  });
  const ids = plan.tasks.map((t) => t.id);
  const promptTemplate = chosenTemplate(store.root, 'change-prompt', chosen);
  const touchesScreens = plan.tasks.some((t) => t.files.some((f) => /(^|\/)(app|components|pages|views|ui)\//.test(f))) && existsSync(join(store.root, 'docs', 'ui-guide.md'));
  const linked = [...plan.linked.decisions.map((d) => `- Decision record: \`${d}\``), ...plan.linked.mocks.map((m) => `- Mock screen (current set): \`${m}\``)];
  const prompt = promptTemplate
    ? renderTemplate(promptTemplate.content, {
      cr_id: cr.id, after: cr.dependsOn.at(-1) ?? 'the previous change request', task_ids: ids.length > 1 ? `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}` : ids[0] ?? 'the tasks',
      verify_command: handoffCommands(store).verify, ui_guide: touchesScreens ? ', then `docs/ui-guide.md`' : '', big_change_note: '',
    }).body.trimEnd()
    : `# Prompt for the coding agent\n\nImplement ${cr.id} in \`${cr.folder}/\`. Commit each task as \`<task ID>: <task title>\`.`;
  return [
    { path: `${cr.folder}/PROMPT.md`, content: `${prompt}${linked.length ? `\n\n## Linked\n\n${linked.join('\n')}` : ''}\n` },
    ...tasks,
    ...(feature ? [{ path: `${cr.folder}/${featurePath}`, content: feature }] : []),
  ];
}

/** Before the change is planned: a short prompt with the affected task files and scenarios as they are. */
function unplannedPackage(store: Pick<Store, 'root'>, cr: ChangeRequest): { path: string; content: string }[] {
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
  // The request's header lists the package, and changes/README.md follows: all in one Keel commit.
  const requestFile = join(store.root, cr.value.file);
  const parsed = matter(readFileSync(requestFile, 'utf8'), {});
  writeFileAtomic(requestFile, matter.stringify(parsed.content, { ...parsed.data, package: files.map((f) => f.path.slice(cr.value.folder.length + 1)) }));
  const indexed = await writeChangesIndex(store, { commit: false });
  await commitFiles(store.root, [cr.value.folder, ...(indexed ? [CHANGES_INDEX] : [])], `Change package for ${id}`);
  return ok(files.map((f) => f.path));
}
