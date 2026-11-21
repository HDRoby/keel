'use server';
// Settings form actions. Input is validated; keys are encrypted by saveProvider and never echoed back.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formFields } from '@/lib/form-fields';
import { saveGithubToken } from '@/lib/github/auth';
import { MODEL_TASK_IDS, PROVIDER_IDS, type ModelChoice } from '@/lib/providers/types';
import { saveModelChoice, saveProvider } from '@/lib/settings/settings';
import { serverStore } from '@/lib/store/server-store';

const optionalText = z.string().trim().max(500).optional();
const providerForm = z.strictObject({
  provider: z.enum(PROVIDER_IDS),
  apiKey: optionalText,
  clearKey: z.literal('on').optional(),
  baseUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).optional(),
  endpoint: z.union([z.literal(''), z.url({ protocol: /^https$/ })]).optional(),
  deployment: optionalText,
  apiVersion: optionalText,
});
const modelForm = z.strictObject({
  task: z.enum(MODEL_TASK_IDS),
  provider: z.string(),
  model: z.string(),
});

export async function saveProviderAction(form: FormData): Promise<void> {
  const input = providerForm.safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Check+the+provider+fields');
  const { provider, clearKey, ...update } = input.data;
  saveProvider(serverStore(), provider, { ...update, clearKey: clearKey === 'on' });
  redirect('/settings?saved=provider');
}

export async function saveModelAction(form: FormData): Promise<void> {
  const input = modelForm.safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Invalid+request');
  const { task, ...choice } = input.data;
  const saved = saveModelChoice(serverStore(), task, choice as ModelChoice);
  if (!saved.ok) redirect(`/settings?error=${encodeURIComponent(saved.message)}`);
  redirect('/settings?saved=model');
}

const githubForm = z.strictObject({ token: z.string().trim().max(300), clear: z.literal('on').optional() });

/** Save or remove the GitHub token used to push handoffs and read changes back. */
export async function saveGithubAction(form: FormData): Promise<void> {
  const input = githubForm.safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Invalid+request');
  if (!input.data.token && !input.data.clear) redirect('/settings?error=Paste+a+token+or+tick+Remove');
  const saved = saveGithubToken(serverStore(), input.data.clear ? undefined : input.data.token);
  redirect(saved.ok ? '/settings?saved=github' : `/settings?error=${encodeURIComponent(saved.message)}`);
}
