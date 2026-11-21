'use server';
// Form action for the brainstorm styles screen. Input is validated before it reaches the library.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { saveStyleVersion } from '@/lib/brainstorm/styles';
import { formFields } from '@/lib/form-fields';
import { keelHome, SLUG } from '@/lib/store/workspace';

const saveForm = z.strictObject({ id: z.string().regex(SLUG), content: z.string().min(1).max(200_000) });

export async function saveStyleAction(form: FormData): Promise<void> {
  const input = saveForm.safeParse(formFields(form));
  if (!input.success) redirect('/styles?error=Invalid+request');
  const saved = saveStyleVersion(keelHome(), input.data.id, input.data.content);
  if (!saved.ok) redirect(`/styles/${input.data.id}?error=${encodeURIComponent(saved.message)}`);
  redirect(`/styles/${input.data.id}?v=${saved.value.version}`);
}
