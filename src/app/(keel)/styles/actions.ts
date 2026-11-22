'use server';
import { serverStore } from '@/lib/store/server-store';
import { NAME } from '@/lib/skill-files';
// Form action for the brainstorm styles screen. Input is validated before it reaches the library.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { saveStyleVersion } from '@/lib/brainstorm/styles';
import { formFields } from '@/lib/form-fields';

const saveForm = z.strictObject({ id: z.string().regex(NAME), content: z.string().min(1).max(200_000) });

export async function saveStyleAction(form: FormData): Promise<void> {
  const input = saveForm.safeParse(formFields(form));
  if (!input.success) redirect('/styles?error=Invalid+request');
  const saved = saveStyleVersion(serverStore().root, input.data.id, input.data.content);
  if (!saved.ok) redirect(`/styles/${input.data.id}?error=${encodeURIComponent(saved.message)}`);
  redirect(`/styles/${input.data.id}?v=${saved.value.version}`);
}
