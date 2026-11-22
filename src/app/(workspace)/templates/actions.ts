'use server';
import { serverStore } from '@/lib/store/server-store';
// Form actions for the template library. Input is validated before it reaches the library.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { removeTemplate, removeTemplateVersion, saveTemplateVersion, TEMPLATE_ID } from '@/lib/templates/library';
import { formFields } from '@/lib/form-fields';

const idField = z.string().regex(TEMPLATE_ID);
const removeForm = z.strictObject({ id: idField, version: z.string().regex(/^\d{1,6}$/).optional() });
const saveForm = z.strictObject({ id: idField, content: z.string().min(1).max(200_000) });

export async function removeTemplateAction(form: FormData): Promise<void> {
  const input = removeForm.safeParse(formFields(form));
  if (!input.success) redirect('/templates?error=Invalid+request');
  const { id, version } = input.data;
  const removed = version ? removeTemplateVersion(serverStore().root, id, Number(version)) : removeTemplate(serverStore().root, id);
  if (!removed.ok) redirect(`/templates/${id}?error=${encodeURIComponent(removed.message)}`);
  redirect(removed.value > 0 && version ? `/templates/${id}` : '/templates');
}

export async function saveTemplateAction(form: FormData): Promise<void> {
  const input = saveForm.safeParse(formFields(form));
  if (!input.success) redirect('/templates?error=Invalid+request');
  const saved = saveTemplateVersion(serverStore().root, input.data.id, input.data.content);
  if (!saved.ok) redirect(`/templates/${input.data.id}?error=${encodeURIComponent(saved.message)}`);
  redirect(`/templates/${input.data.id}?v=${saved.value.version}`);
}
