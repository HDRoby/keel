'use server';
// Settings form actions. Input is validated; keys are encrypted by saveProvider and never echoed back.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formFields } from '@/lib/form-fields';
import { saveGithubToken } from '@/lib/github/auth';
import { MODEL_TASK_IDS, MODEL_TASKS, PROVIDER_IDS, type ModelChoice } from '@/lib/providers/types';
import { effectiveChoice } from '@/lib/providers/local';
import { SETTINGS_FILE } from '@/lib/settings/user-dir';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkApiKey } from '@/lib/providers/errors';
import { testConnection } from '@/lib/providers/test-connection';
import { exploreTiming, saveAuthor, saveExploreTiming, saveModelChoice, saveProvider } from '@/lib/settings/settings';
import { forgetStartupCheck } from '@/lib/startup/check';
import { serverStore } from '@/lib/store/server-store';
import { updateConfig } from '@/lib/store/workspace';

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
  const wrong = update.apiKey ? checkApiKey(provider, update.apiKey) : undefined;
  if (wrong) redirect(`/settings?error=${encodeURIComponent(wrong)}`);
  saveProvider(serverStore(), provider, { ...update, clearKey: clearKey === 'on' });
  redirect('/settings?saved=provider');
}

/** Test a provider with one tiny call. */
export async function testProviderAction(form: FormData): Promise<void> {
  const input = z.strictObject({ provider: z.enum(PROVIDER_IDS) }).safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Invalid+request');
  const tested = await testConnection(serverStore(), input.data.provider);
  redirect(tested.ok ? `/settings?tested=${encodeURIComponent(tested.value)}` : `/settings?error=${encodeURIComponent(tested.message)}`);
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

/** The default author name, kept in the user config folder (used when git config has no user.name). */
export async function saveAuthorAction(form: FormData): Promise<void> {
  const input = z.strictObject({ author: z.string().max(200) }).safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Invalid+request');
  const saved = saveAuthor(serverStore(), input.data.author);
  redirect(saved.ok ? '/settings?saved=1' : `/settings?error=${encodeURIComponent(saved.message)}`);
}

/** When Explore asks for a review: the pause after typing and the minimum interval (task R10). */
export async function saveExploreTimingAction(form: FormData): Promise<void> {
  const input = z.strictObject({ pauseSeconds: z.coerce.number(), intervalSeconds: z.coerce.number() }).safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Invalid+request');
  const saved = saveExploreTiming(serverStore(), input.data);
  redirect(saved.ok ? '/settings?saved=1' : `/settings?error=${encodeURIComponent(saved.message)}`);
}

/** This project: "Clickable mock before the plan" (REQ-005, CR-0009), saved in .keel/config.yml as a Keel commit. */
export async function saveMockGateAction(form: FormData): Promise<void> {
  const input = z.strictObject({ mockGate: z.enum(['recommended', 'required', 'off']) }).safeParse(formFields(form));
  if (!input.success) redirect('/settings?error=Invalid+request');
  const saved = await updateConfig(serverStore(), { mock_gate: input.data.mockGate }, `Keel: Clickable mock before the plan: ${input.data.mockGate}`);
  redirect(saved.ok ? '/settings?saved=1' : `/settings?error=${encodeURIComponent(saved.message)}`);
}

/** First run (CR-0012): saves the providers and models shown (Ollama with the local models), then checks again. */
export async function useTheseSettingsAction(): Promise<void> {
  const store = serverStore();
  for (const { task } of MODEL_TASKS) {
    const choice = await effectiveChoice(store, task);
    if (choice.model) saveModelChoice(store, task, choice);
  }
  if (!existsSync(join(store.user, SETTINGS_FILE))) saveExploreTiming(store, exploreTiming(store));
  forgetStartupCheck(store);
  redirect('/check');
}
