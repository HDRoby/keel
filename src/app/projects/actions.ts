'use server';
// Start, Project setup, drafting the intent (REQ-001, REQ-011), reviews and decisions (REQ-005).
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { addToSection, changeSetup, draftIntent, loadContext, startIdea, updateIntent } from '@/lib/brainstorm/session';
import { formFields } from '@/lib/form-fields';
import { readStandard } from '@/lib/standards/library';
import { projectState, recordDecision, review } from '@/lib/gates/approvals';
import { gateFor } from '@/lib/gates/rules';
import { buildHandoff, commandsSchema, saveHandoffCommands } from '@/lib/handoff/scaffold';
import { githubToken } from '@/lib/github/auth';
import { pushHandoff } from '@/lib/github/push';
import { acceptChange, dismissChange, readbackState } from '@/lib/readback/changes';
import { checkRepository } from '@/lib/readback/poll';
import { kindFromPath, readDocument } from '@/lib/store/documents';
import { attachMock, linkMock, removeMock, replaceMock, MAX_MOCK_BYTES, MOCK_ID, REQ_ID } from '@/lib/mocks/references';
import { requirementIds } from '@/lib/trace/index';
import { generatePlan, regeneratePlan } from '@/lib/generate/plan';
import { resolveConflicts, type Resolution } from '@/lib/generate/resolve';
import { generateSpec, regenerateSpec } from '@/lib/generate/spec';
import { providerWriter } from '@/lib/generate/writer';
import type { Result } from '@/lib/result';
import { serverStore } from '@/lib/store/server-store';
import { projectDir, setProjectStandards, SLUG } from '@/lib/store/workspace';
import { VERSIONED_REF } from '@/lib/templates/library';

const ref = z.string().regex(VERSIONED_REF);
const slug = z.string().regex(SLUG);
const name = z.string().trim().min(1).max(120);
const standards = z.array(ref).max(50);
const startForm = z.strictObject({
  title: z.string().trim().min(1).max(120),
  idea: z.string().trim().max(5_000),
  author: name,
  template: ref,
  style: ref,
  standards,
});

export async function startAction(form: FormData): Promise<void> {
  const input = startForm.safeParse(formFields(form, ['standards']));
  if (!input.success) redirect('/start?error=Fill+in+the+title,+your+name,+a+template+and+a+style');
  const started = await startIdea(serverStore(), input.data);
  if (!started.ok) redirect(`/start?error=${encodeURIComponent(started.message)}`);
  redirect(`/projects/${started.value.slug}/explore`);
}

const setupForm = z.strictObject({ slug, template: ref, style: ref, standards });

export async function setupAction(form: FormData): Promise<void> {
  const input = setupForm.safeParse(formFields(form, ['standards']));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const unknown = input.data.standards.filter((r) => !readStandard(store.home, r).ok);
  if (unknown.length > 0) redirect(`/projects/${input.data.slug}/setup?error=${encodeURIComponent(`Unknown standard ${unknown.join(', ')}`)}`);
  await setProjectStandards(store, input.data.slug, input.data.standards);
  const changed = await changeSetup(store, input.data.slug, input.data);
  if (!changed.ok) redirect(`/projects/${input.data.slug}/setup?error=${encodeURIComponent(changed.message)}`);
  redirect(`/projects/${input.data.slug}/explore`);
}

/** Drafts intent.md, or saves new brainstorm answers as its next version once it exists. */
export async function draftIntentAction(form: FormData): Promise<void> {
  const input = z.strictObject({ slug, mode: z.enum(['draft', 'update']) }).safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const context = loadContext(store, input.data.slug);
  const write = input.data.mode === 'draft' ? draftIntent : updateIntent;
  const drafted = context.ok ? await write(store, context.value) : context;
  const query = drafted.ok ? 'drafted=1' : `error=${encodeURIComponent(drafted.message)}`;
  redirect(`/projects/${input.data.slug}/explore?${query}`);
}

const reviewForm = z.strictObject({
  slug,
  document: z.enum(['intent', 'spec', 'plan']),
  action: z.enum(['approve', 'request-changes', 'reject']),
  by: name,
  comment: z.string().trim().max(2_000),
});

/** Approve, request changes or reject the intent, spec or plan. */
export async function reviewAction(form: FormData): Promise<void> {
  const input = reviewForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const { slug: id, document, ...given } = input.data;
  redirect(withError(`/projects/${id}/${document}`, await review(serverStore(), id, document, given)));
}

const decisionForm = z.strictObject({
  slug,
  decision: z.enum(['go', 'park', 'no-go']),
  by: name,
  reason: z.string().trim().min(1).max(5_000),
  consequences: z.string().trim().max(5_000),
});

/** Records a Go, Park or No-go decision. */
export async function decisionAction(form: FormData): Promise<void> {
  const input = decisionForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Say+who+decided+and+why');
  const { slug: id, ...decision } = input.data;
  redirect(withError(`/projects/${id}/spec`, await recordDecision(serverStore(), id, decision)));
}

// Not exported: a 'use server' file may only export async functions.
function withError(path: string, result: Result<unknown>): string {
  return result.ok ? path : `${path}?error=${encodeURIComponent(result.message)}`;
}

const addForm = z.strictObject({ slug, section: z.string().min(1).max(200), text: z.string().trim().min(1).max(20_000) });

/** Adds an answer to a section of the proposer's choice. */
export async function addToSectionAction(form: FormData): Promise<void> {
  const input = addForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const context = loadContext(store, input.data.slug);
  const added = context.ok ? await addToSection(store, context.value, input.data.section, input.data.text) : context;
  redirect(withError(`/projects/${input.data.slug}/explore`, added));
}

const generateForm = z.strictObject({ slug, template: ref.optional() });

/** Generate spec: fills the chosen spec template from the approved intent. */
export async function generateSpecAction(form: FormData): Promise<void> {
  const input = generateForm.safeParse(formFields(form));
  if (!input.success || !input.data.template) redirect('/?error=Invalid+request');
  const store = serverStore();
  const made = await generateSpec(store, input.data.slug, input.data.template, providerWriter(store));
  redirect(withError(`/projects/${input.data.slug}/spec`, made));
}

/** Generate plan: fills the plan template and writes the task files. */
export async function generatePlanAction(form: FormData): Promise<void> {
  const input = generateForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const made = await generatePlan(store, input.data.slug, providerWriter(store));
  redirect(withError(`/projects/${input.data.slug}/plan`, made));
}

const regenerateForm = z.strictObject({ slug, document: z.enum(['spec', 'plan']) });

/** Regenerate a draft spec or plan; edits are merged and conflicts raised. */
export async function regenerateAction(form: FormData): Promise<void> {
  const input = regenerateForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const { slug: id, document } = input.data;
  const made = await (document === 'spec' ? regenerateSpec : regeneratePlan)(store, id, providerWriter(store));
  redirect(withError(`/projects/${id}/${document}`, made));
}

const choice = z.enum(['mine', 'theirs', 'merged']);

/** Resolve the conflicts a regeneration raised. Fields: choice:<name> = mine | theirs | merged, merged:<name>. */
export async function resolveConflictsAction(form: FormData): Promise<void> {
  const base = regenerateForm.safeParse({ slug: form.get('slug'), document: form.get('document') });
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
  const resolved = await resolveConflicts(serverStore(), base.data.slug, base.data.document, resolutions);
  redirect(withError(`/projects/${base.data.slug}/${base.data.document}`, resolved));
}

const mockDocument = z.enum(['intent', 'spec']);

/** Reads a mock form: slug, document, title and a link or a file; checks the stage is open. */
async function mockForm(form: FormData, withId: boolean) {
  const base = z.strictObject({ slug, document: mockDocument, id: withId ? z.string().regex(MOCK_ID) : z.undefined(), title: z.string().trim().max(200), url: z.string().trim().max(2_000) })
    .safeParse({ slug: form.get('slug'), document: form.get('document'), id: form.get('id') ?? undefined, title: form.get('title') ?? '', url: form.get('url') ?? '' });
  if (!base.success) redirect('/?error=Invalid+request');
  const { slug: id, document, url } = base.data;
  const store = serverStore();
  const page = `/projects/${id}/${document}`;
  if (!gateFor(projectState(store, id), document).available) redirect(page);
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
  const { store, page, slug: id, document, title, source } = await mockForm(form, false);
  redirect(withError(page, await attachMock(store, id, { document, title, ...source })));
}

/** Replace a mock reference's link or file, keeping its ID and linked requirements. */
export async function replaceMockAction(form: FormData): Promise<void> {
  const { store, page, slug: id, title, source, id: mock } = await mockForm(form, true);
  redirect(withError(page, await replaceMock(store, id, mock ?? '', { title, ...source })));
}

/** Remove a mock reference and its file. */
export async function removeMockAction(form: FormData): Promise<void> {
  const input = z.strictObject({ slug, document: mockDocument, id: z.string().regex(MOCK_ID) }).safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const store = serverStore();
  const page = `/projects/${input.data.slug}/${input.data.document}`;
  if (!gateFor(projectState(store, input.data.slug), input.data.document).available) redirect(page);
  redirect(withError(page, await removeMock(store, input.data.slug, input.data.id)));
}

/** Set the requirements a mock reference shows. */
export async function linkMockAction(form: FormData): Promise<void> {
  const input = z.strictObject({ slug, document: mockDocument, id: z.string().regex(MOCK_ID), requirements: z.array(z.string().regex(REQ_ID)).max(500) })
    .safeParse(formFields(form, ['requirements']));
  if (!input.success) redirect('/?error=Invalid+request');
  const { slug: id, document, requirements } = input.data;
  const store = serverStore();
  const linked = await linkMock(store, id, input.data.id, requirements, requirementIds(projectDir(id, store.home)));
  redirect(withError(`/projects/${id}/${document}`, linked));
}

/** Save the commands the handoff gives the coding agent and CI. */
export async function saveHandoffCommandsAction(form: FormData): Promise<void> {
  const input = commandsSchema.extend({ slug }).strict().safeParse(formFields(form));
  if (!input.success) redirect('/?error=Every+command+needs+a+value');
  const { slug: id, ...commands } = input.data;
  const store = serverStore();
  if (!gateFor(projectState(store, id), 'handoff').available) redirect(`/projects/${id}/handoff`);
  redirect(withError(`/projects/${id}/handoff`, await saveHandoffCommands(store, id, commands)));
}

const pushForm = z.strictObject({
  slug,
  kind: z.enum(['github', 'local']),
  location: z.string().trim().min(1).max(500),
  branch: z.string().trim().min(1).max(100),
});

/** Push the handoff package to the repository, as one Keel commit. */
export async function pushHandoffAction(form: FormData): Promise<void> {
  const input = pushForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  const { slug: id, kind, location, branch } = input.data;
  const store = serverStore();
  const page = `/projects/${id}/handoff`;
  // A push writes Keel's docs and tasks over the repository; review the agent's changes first so none is lost.
  const waiting = readbackState(store, id).pending.length;
  if (waiting > 0) redirect(`${page}?error=${encodeURIComponent(`Accept or dismiss the ${waiting} read-back change${waiting === 1 ? '' : 's'} before pushing again`)}`);
  const built = await buildHandoff(store, id);
  if (!built.ok) redirect(withError(page, built));
  const plan = readDocument(store, id, 'docs/plan.md');
  const planRef = plan.ok ? `${plan.value.header.id}@${plan.value.header.version}` : 'plan';
  const target = kind === 'github' ? { kind, repo: location, branch } : { kind, path: location, branch };
  const pushed = await pushHandoff(store, id, target, built.value, planRef, { token: githubToken(store) });
  redirect(pushed.ok && pushed.value.unchanged ? `${page}?notice=${encodeURIComponent('Nothing new to push: the repository already has this package.')}` : withError(page, pushed));
}

const readbackForm = z.strictObject({ slug, path: z.string().max(300).refine((p) => Boolean(kindFromPath(p)), 'Not a document path').optional() });

/** Check the repository for the coding agent's changes now. */
export async function checkRepositoryAction(form: FormData): Promise<void> {
  const input = readbackForm.safeParse(formFields(form));
  if (!input.success) redirect('/?error=Invalid+request');
  redirect(withError(`/projects/${input.data.slug}/handoff`, await checkRepository(serverStore(), input.data.slug)));
}

/** Accept a read-back change as the document's next version. */
export async function acceptChangeAction(form: FormData): Promise<void> {
  const { slug: id, path } = changeForm(form);
  redirect(withError(`/projects/${id}/handoff`, await acceptChange(serverStore(), id, path)));
}

/** Dismiss a read-back change. */
export async function dismissChangeAction(form: FormData): Promise<void> {
  const { slug: id, path } = changeForm(form);
  redirect(withError(`/projects/${id}/handoff`, await dismissChange(serverStore(), id, path)));
}

/** Reads the slug and path of a read-back change form. Not exported, like withError. */
function changeForm(form: FormData): { slug: string; path: string } {
  const input = readbackForm.safeParse(formFields(form));
  if (!input.success || !input.data.path) redirect('/?error=Invalid+request');
  return { slug: input.data.slug, path: input.data.path };
}
