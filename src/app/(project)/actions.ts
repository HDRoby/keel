'use server';
// Start, Project setup, drafting the intent (REQ-001, REQ-011), reviews and decisions (REQ-005).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { changeSetup, startIdea } from '@/lib/brainstorm/session';
import { draftIntent, saveChangeRequest } from '@/lib/generate/intent';
import { formFields } from '@/lib/form-fields';
import { readStandard } from '@/lib/standards/library';
import { projectState, recordDecision, review } from '@/lib/gates/approvals';
import { gateFor } from '@/lib/gates/rules';
import { commandsSchema, saveHandoffCommands } from '@/lib/handoff/scaffold';
import { writeHandoff, type ConflictChoice } from '@/lib/handoff/write';
import { acceptChange, dismissChange } from '@/lib/readback/changes';
import { checkFolder } from '@/lib/readback/check';
import { kindFromPath } from '@/lib/store/documents';
import { attachMock, linkMock, removeMock, replaceMock, MAX_MOCK_BYTES, MOCK_ID, REQ_ID } from '@/lib/mocks/references';
import { requirementIds } from '@/lib/trace/index';
import { generatePlan, regeneratePlan } from '@/lib/generate/plan';
import { resolveConflicts, type Resolution } from '@/lib/generate/resolve';
import { generateSpec, regenerateSpec } from '@/lib/generate/spec';
import { providerWriter } from '@/lib/generate/writer';
import type { Result } from '@/lib/result';
import { serverStore } from '@/lib/store/server-store';
import { push } from '@/lib/store/remote';
import { commitBlocker } from '@/lib/store/git';
import { setProjectStandards } from '@/lib/store/workspace';
import { adoptProject } from '@/lib/store/adopt';
import { VERSIONED_REF } from '@/lib/templates/library';

const ref = z.string().regex(VERSIONED_REF);
const name = z.string().trim().min(1).max(120);
const standards = z.array(ref).max(50);
const startForm = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5_000),
  author: name,
  template: ref,
  spec: ref.optional(),
  plan: ref.optional(),
  style: ref,
  standards,
});

/** Initialise by adopting the Keel documents already in the folder (task R9). */
export async function adoptAction(form: FormData): Promise<void> {
  const input = z.strictObject({ author: z.string().trim().max(120) }).safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const adopted = await adoptProject(serverStore(), input.data.author);
  if (!adopted.ok) redirect(`/?error=${encodeURIComponent(adopted.message)}`);
  revalidatePath('/', 'layout');
  redirect(at('intent'));
}

/** Initialise: writes .keel/ and starts the brainstorm. */
export async function startAction(form: FormData): Promise<void> {
  const input = startForm.safeParse(formFields(form, ['standards']));
  if (!input.success) redirect('/?error=Fill+in+the+title,+your+name,+a+template+and+a+style');
  const { description, spec, plan, ...rest } = input.data;
  const started = await startIdea(serverStore(), { ...rest, idea: description, templates: { spec, plan } });
  if (!started.ok) redirect(`/?error=${encodeURIComponent(started.message)}`);
  // The sidebar in the root layout shows the project now, not "Not initialised".
  revalidatePath('/', 'layout');
  redirect(at('explore'));
}

const setupForm = z.strictObject({ template: ref, style: ref, standards });

export async function setupAction(form: FormData): Promise<void> {
  await guard('setup');
  const input = setupForm.safeParse(formFields(form, ['standards']));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const unknown = input.data.standards.filter((r) => !readStandard(store.root, r).ok);
  if (unknown.length > 0) redirect(`${at('setup')}?error=${encodeURIComponent(`Unknown standard ${unknown.join(', ')}`)}`);
  await setProjectStandards(store, input.data.standards);
  const changed = await changeSetup(store, input.data);
  if (!changed.ok) redirect(`${at('setup')}?error=${encodeURIComponent(changed.message)}`);
  redirect(at('explore'));
}

/** Draft intent.md: assembled from the Explore sections, with no model call (REQ-002). */
export async function draftIntentAction(): Promise<void> {
  await guard('explore');
  const drafted = await draftIntent(serverStore());
  redirect(`${at('explore')}?${drafted.ok ? 'drafted=1' : `error=${encodeURIComponent(drafted.message)}`}`);
}

/** After approval: the edits in Explore become a draft change request; intent.md stays as approved. */
export async function saveChangeRequestAction(): Promise<void> {
  await guard('explore');
  const saved = await saveChangeRequest(serverStore());
  redirect(`${at('explore')}?${saved.ok ? `saved=${encodeURIComponent(saved.value.id)}` : `error=${encodeURIComponent(saved.message)}`}`);
}

const reviewForm = z.strictObject({
  document: z.enum(['intent', 'spec', 'plan']),
  action: z.enum(['approve', 'request-changes', 'reject']),
  by: name,
  comment: z.string().trim().max(2_000),
});

/** Approve, request changes or reject the intent, spec or plan. */
export async function reviewAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'intent'));
  const input = reviewForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const { document, ...given } = input.data;
  redirect(withError(at(document), await review(serverStore(), document, given)));
}

const decisionForm = z.strictObject({
  decision: z.enum(['go', 'park', 'no-go']),
  by: name,
  reason: z.string().trim().min(1).max(5_000),
  consequences: z.string().trim().max(5_000),
});

/** Records a Go, Park or No-go decision. */
export async function decisionAction(form: FormData): Promise<void> {
  await guard('spec');
  const input = decisionForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Say+who+decided+and+why');
  const decision = input.data;
  redirect(withError(at('spec'), await recordDecision(serverStore(), decision)));
}

// Not exported: a 'use server' file may only export async functions.
/** The address of a stage page. */
function at(stage: string): string {
  return `/${stage}`;
}

/**
 * Stops a save while the repository is in a merge, rebase or cherry-pick, or on a detached HEAD, and
 * keeps the change unsaved (task R5). The page shows why. Pages are checked against the known stages.
 */
async function guard(page: string): Promise<void> {
  const blocker = await commitBlocker(serverStore().root);
  const stage = ['setup', 'explore', 'intent', 'spec', 'plan', 'handoff'].includes(page) ? page : 'explore';
  if (blocker) redirect(`${at(stage)}?error=${encodeURIComponent(blocker)}`);
}

function withError(path: string, result: Result<unknown>): string {
  return result.ok ? path : `${path}?error=${encodeURIComponent(result.message)}`;
}

const generateForm = z.strictObject({ template: ref.optional() });

/** Generate spec: fills the chosen spec template from the approved intent. */
export async function generateSpecAction(form: FormData): Promise<void> {
  await guard('spec');
  const input = generateForm.safeParse(formFields(form));
  if (!input.success || !input.data.template) redirect('/?error=Invalid+request');
  const store = serverStore();
  const made = await generateSpec(store, input.data.template, providerWriter(store));
  redirect(withError(at('spec'), made));
}

/** Generate plan: fills the plan template and writes the task files. */
export async function generatePlanAction(form: FormData): Promise<void> {
  await guard('plan');
  const input = generateForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const made = await generatePlan(store, providerWriter(store));
  redirect(withError(at('plan'), made));
}

const regenerateForm = z.strictObject({ document: z.enum(['spec', 'plan']) });

/** Regenerate a draft spec or plan; edits are merged and conflicts raised. */
export async function regenerateAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'spec'));
  const input = regenerateForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const { document } = input.data;
  const made = await (document === 'spec' ? regenerateSpec : regeneratePlan)(store, providerWriter(store));
  redirect(withError(at(document), made));
}

const choice = z.enum(['mine', 'theirs', 'merged']);

/** Resolve the conflicts a regeneration raised. Fields: choice:<name> = mine | theirs | merged, merged:<name>. */
export async function resolveConflictsAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'spec'));
  const base = regenerateForm.safeParse({ document: form.get('document') });
  if (!base.success) redirect('/?error=Invalid+request');
  const resolutions: Resolution[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('choice:') || typeof value !== 'string') continue;
    const name = key.slice('choice:'.length);
    const chosen = choice.safeParse(value);
    const merged = form.get(`merged:${name}`);
    if (!chosen.success || name.length > 300 || (typeof merged === 'string' && merged.length > 200_000)) redirect('/?error=Invalid+request');
    resolutions.push({ name, choice: chosen.data, ...(typeof merged === 'string' ? { merged } : {}) });
  }
  const resolved = await resolveConflicts(serverStore(), base.data.document, resolutions);
  redirect(withError(at(base.data.document), resolved));
}

const mockDocument = z.enum(['intent', 'spec']);

/** Reads a mock form: document, title and a link or a file; checks the stage is open. */
async function mockForm(form: FormData, withId: boolean) {
  const base = z.strictObject({ document: mockDocument, id: withId ? z.string().regex(MOCK_ID) : z.undefined(), title: z.string().trim().max(200), url: z.string().trim().max(2_000) })
    .safeParse({ document: form.get('document'), id: form.get('id') ?? undefined, title: form.get('title') ?? '', url: form.get('url') ?? '' });
  if (!base.success) redirect('/?error=Invalid+request');
  const { document, url } = base.data;
  const store = serverStore();
  const page = at(document);
  if (!gateFor(projectState(store), document).available) redirect(page);
  const file = form.get('file');
  const hasFile = file instanceof File && file.size > 0;
  const problem = !url && !hasFile ? 'Give a link or choose a file'
    : url && hasFile ? 'Give a link or a file, not both'
    : hasFile && file.size > MAX_MOCK_BYTES ? 'Files can be up to 10 MB'
    : undefined;
  if (problem) redirect(`${page}?error=${encodeURIComponent(problem)}`);
  const source = hasFile ? { file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } } : { url };
  return { store, page, ...base.data, source };
}

/** Attach a mock reference: a link, or a PNG, JPG, PDF or HTML file up to 10 MB. */
export async function attachMockAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'intent'));
  const { store, page, document, title, source } = await mockForm(form, false);
  redirect(withError(page, await attachMock(store, { document, title, ...source })));
}

/** Replace a mock reference's link or file, keeping its ID and linked requirements. */
export async function replaceMockAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'intent'));
  const { store, page, title, source, id: mock } = await mockForm(form, true);
  redirect(withError(page, await replaceMock(store, mock ?? '', { title, ...source })));
}

/** Remove a mock reference and its file. */
export async function removeMockAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'intent'));
  const input = z.strictObject({ document: mockDocument, id: z.string().regex(MOCK_ID) }).safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const page = at(input.data.document);
  if (!gateFor(projectState(store), input.data.document).available) redirect(page);
  redirect(withError(page, await removeMock(store, input.data.id)));
}

/** Set the requirements a mock reference shows. */
export async function linkMockAction(form: FormData): Promise<void> {
  await guard(String(form.get('document') ?? 'intent'));
  const input = z.strictObject({ document: mockDocument, id: z.string().regex(MOCK_ID), requirements: z.array(z.string().regex(REQ_ID)).max(500) })
    .safeParse(formFields(form, ['requirements']));
  if (!input.success) redirect('/?error=Invalid+request');
  const { document, requirements } = input.data;
  const store = serverStore();
  const linked = await linkMock(store, input.data.id, requirements, requirementIds(store.root));
  redirect(withError(at(document), linked));
}

/** Handoff: write the agent files into the folder. Conflicts: choice:<path> = mine | keel | beside. */
export async function writeHandoffAction(form: FormData): Promise<void> {
  await guard('handoff');
  const store = serverStore();
  if (!gateFor(projectState(store), 'handoff').available) redirect(at('handoff'));
  const choices: Record<string, ConflictChoice> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('choice:') || typeof value !== 'string') continue;
    const path = key.slice('choice:'.length);
    const choice = z.enum(['mine', 'keel', 'beside']).safeParse(value);
    if (!choice.success || path.length > 300 || path.includes('..')) redirect(`${at('handoff')}?error=Invalid+request`);
    choices[path] = choice.data;
  }
  const written = await writeHandoff(store, choices);
  if (!written.ok) redirect(withError(at('handoff'), written));
  const { written: files, conflicts } = written.value;
  const notice = files.length === 0 ? 'Nothing to write: the folder already has the handoff files.'
    : `Wrote ${files.length} file${files.length === 1 ? '' : 's'} in one Keel commit.`;
  const waiting = conflicts.length ? ` ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} left as you have ${conflicts.length === 1 ? 'it' : 'them'}.` : '';
  redirect(`${at('handoff')}?notice=${encodeURIComponent(notice + waiting)}`);
}

/** Save the commands the handoff gives the coding agent and CI. */
export async function saveHandoffCommandsAction(form: FormData): Promise<void> {
  await guard('handoff');
  const input = commandsSchema.strict().safeParse(formFields(form));
  if (!input.success) redirect('/?error=Every+command+needs+a+value');
  const commands = input.data;
  const store = serverStore();
  if (!gateFor(projectState(store), 'handoff').available) redirect(at('handoff'));
  redirect(withError(at('handoff'), await saveHandoffCommands(store, commands)));
}

/** Optional push (task R8): `git push origin HEAD` with the user's own git credentials. Never automatic. */
export async function pushAction(): Promise<void> {
  await guard('handoff');
  const pushed = await push(serverStore().root);
  redirect(pushed.ok
    ? `${at('handoff')}?notice=${encodeURIComponent(`Pushed ${pushed.value.branch} to origin (${pushed.value.remote}).`)}`
    : withError(at('handoff'), pushed));
}

const readbackForm = z.strictObject({ path: z.string().max(300).refine((p) => Boolean(kindFromPath(p)), 'Not a document path').optional() });

/** Check the repository for the coding agent's changes now. */
export async function checkRepositoryAction(form: FormData): Promise<void> {
  const input = readbackForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  redirect(withError(at('handoff'), await checkFolder(serverStore())));
}

/** Accept a read-back change as the document's next version. */
export async function acceptChangeAction(form: FormData): Promise<void> {
  await guard('handoff');
  const { path } = changeForm(form);
  redirect(withError(at('handoff'), await acceptChange(serverStore(), path)));
}

/** Dismiss a read-back change. */
export async function dismissChangeAction(form: FormData): Promise<void> {
  await guard('handoff');
  const { path } = changeForm(form);
  redirect(withError(at('handoff'), await dismissChange(serverStore(), path)));
}

/** Reads the path of a read-back change form. Not exported, like withError. */
function changeForm(form: FormData): { path: string } {
  const input = readbackForm.safeParse(formFields(form));
  if (!input.success || !input.data.path) redirect('/?error=Invalid+request');
  return { path: input.data.path };
}
