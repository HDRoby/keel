'use server';
// Change request actions (REQ-014, task R18): raise, submit, approve, reject, size, the decision on each affected
// document, and the change package. Each refuses during a merge or rebase (R5), with the reason on the page.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { approveChange, decideImpact, rejectChange, setChangeSize, submitChange, writePackage } from '@/lib/changes/flow';
import { createChange } from '@/lib/changes/store';
import { formFields } from '@/lib/form-fields';
import { providerWriter } from '@/lib/generate/writer';
import type { Result } from '@/lib/result';
import { defaultAuthor } from '@/lib/settings/settings';
import { commitBlocker } from '@/lib/store/git';
import { serverStore } from '@/lib/store/server-store';

const id = z.string().regex(/^CR-\d{4,}$/);
const page = (cr?: string) => (cr ? `/changes/${cr}` : '/changes');

async function guard(cr?: string): Promise<void> {
  const blocker = await commitBlocker(serverStore().root);
  if (blocker) redirect(`${page(cr)}?error=${encodeURIComponent(blocker)}`);
}

function back(cr: string | undefined, result: Result<unknown>, notice?: string): never {
  redirect(result.ok ? `${page(cr)}${notice ? `?notice=${encodeURIComponent(notice)}` : ''}` : `${page(cr)}?error=${encodeURIComponent(result.message)}`);
}

const DOCUMENTS: Record<string, string> = { intent: 'INT-0001', spec: 'SPC-0001', plan: 'PLN-0001' };

/** New change request from the Changes page: title, reason and the documents it affects. */
export async function newChangeAction(form: FormData): Promise<void> {
  await guard();
  const input = z.strictObject({ title: z.string().trim().min(1).max(200), reason: z.string().trim().max(5_000), affects: z.array(z.enum(['intent', 'spec', 'plan'])).max(3) })
    .safeParse(formFields(form, ['affects']));
  if (!input.success) redirect(`${page()}?error=${encodeURIComponent('A change request needs a title')}`);
  const made = await createChange(serverStore(), { title: input.data.title, reason: input.data.reason, affects: input.data.affects.map((a) => DOCUMENTS[a] ?? a) });
  if (!made.ok) back(undefined, made);
  redirect(page(made.value.id));
}

/** Raise change request from a roadmap item (Next). */
export async function raiseFromRoadmapAction(form: FormData): Promise<void> {
  await guard();
  const input = z.strictObject({ item: z.string().trim().min(1).max(300) }).safeParse(formFields(form));
  if (!input.success) redirect('/roadmap?error=Invalid+request');
  const made = await createChange(serverStore(), { title: input.data.item, reason: 'Raised from the roadmap (Next).', source: 'docs/roadmap.md', affects: ['RMP-0001'] });
  if (!made.ok) redirect(`/roadmap?error=${encodeURIComponent(made.message)}`);
  redirect(page(made.value.id));
}

export async function submitChangeAction(form: FormData): Promise<void> {
  const cr = id.parse(form.get('id'));
  await guard(cr);
  back(cr, await submitChange(serverStore(), cr), 'Waiting for approval.');
}

export async function approveChangeAction(form: FormData): Promise<void> {
  const cr = id.parse(form.get('id'));
  await guard(cr);
  const store = serverStore();
  back(cr, await approveChange(store, cr, await defaultAuthor(store)), `${cr} approved.`);
}

export async function rejectChangeAction(form: FormData): Promise<void> {
  const cr = id.parse(form.get('id'));
  await guard(cr);
  back(cr, await rejectChange(serverStore(), cr), `${cr} rejected.`);
}

export async function changeSizeAction(form: FormData): Promise<void> {
  const input = z.strictObject({ id, size: z.enum(['minor', 'significant']) }).safeParse(formFields(form));
  if (!input.success) redirect(`${page()}?error=Invalid+request`);
  await guard(input.data.id);
  back(input.data.id, await setChangeSize(serverStore(), input.data.id, input.data.size));
}

/** Update, Still valid or Later for one affected document. */
export async function impactAction(form: FormData): Promise<void> {
  const input = z.strictObject({ id, document: z.enum(['docs/spec.md', 'docs/plan.md']), decision: z.enum(['updated', 'valid', 'later']) }).safeParse(formFields(form));
  if (!input.success) redirect(`${page()}?error=Invalid+request`);
  await guard(input.data.id);
  const store = serverStore();
  back(input.data.id, await decideImpact(store, input.data.id, input.data.document, input.data.decision, providerWriter(store)));
}

export async function writePackageAction(form: FormData): Promise<void> {
  const cr = id.parse(form.get('id'));
  await guard(cr);
  const written = await writePackage(serverStore(), cr);
  back(cr, written, written.ok ? `Wrote ${written.value.length} files to changes/${cr}/.` : undefined);
}
