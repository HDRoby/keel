'use server';
// Acceptance scenarios in the Spec (REQ-004, task R11): add, edit, delete, accept or clear suggestions, and ask for
// a failure case. After the spec is approved, edits are held in a change request (CR-0003).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { raiseScenarioChange } from '@/lib/changes/scenarios';
import { formFields } from '@/lib/form-fields';
import { suggestFailureCase } from '@/lib/generate/scenario';
import { providerWriter } from '@/lib/generate/writer';
import { acceptAllSuggestions, acceptSuggestion, clearSuggestion, deleteScenario, saveScenario, type Saved } from '@/lib/scenarios/store';
import { KEYWORDS } from '@/lib/scenarios/gherkin';
import type { Result } from '@/lib/result';
import { commitBlocker } from '@/lib/store/git';
import { serverStore } from '@/lib/store/server-store';

const TAB = '/spec?tab=scenarios';

async function guard(): Promise<void> {
  const blocker = await commitBlocker(serverStore().root);
  if (blocker) redirect(`${TAB}&error=${encodeURIComponent(blocker)}`);
}

function done(result: Result<Saved | number | unknown>, anchor = ''): never {
  // The redirect may differ from the current address only by its #anchor, which the router would not reload.
  revalidatePath('/spec');
  if (!result.ok) redirect(`${TAB}&error=${encodeURIComponent(result.message)}${anchor}`);
  const held = typeof result.value === 'object' && result.value !== null && 'held' in result.value ? (result.value as { held: string }).held : undefined;
  redirect(held ? `${TAB}&notice=${encodeURIComponent(`Saved in change request ${held}: the spec is approved.`)}${anchor}` : `${TAB}${anchor}`);
}

const scenarioSchema = z.strictObject({
  id: z.string().max(300).optional(),
  req: z.string().regex(/^REQ-\d{3,}$/),
  name: z.string().trim().min(1).max(300),
  steps: z.array(z.strictObject({ keyword: z.enum(KEYWORDS), text: z.string().max(500), extra: z.array(z.string()).optional() })).min(1).max(30),
});

/** Done in the editor: the scenario arrives as JSON (name, steps). The @REQ tag comes from the group. */
export async function saveScenarioAction(form: FormData): Promise<void> {
  await guard();
  let input: z.infer<typeof scenarioSchema>;
  try {
    const parsed = scenarioSchema.safeParse(JSON.parse(String(form.get('scenario') ?? '')));
    if (!parsed.success) redirect(`${TAB}&error=${encodeURIComponent('A scenario needs a name and at least one step')}`);
    input = parsed.data;
  } catch {
    redirect(`${TAB}&error=Invalid+request`);
  }
  done(await saveScenario(serverStore(), input, raiseScenarioChange), `#${input.req}`);
}

const idForm = z.strictObject({ id: z.string().min(1).max(300), req: z.string().regex(/^REQ-\d{3,}$/).optional() });

export async function deleteScenarioAction(form: FormData): Promise<void> {
  await guard();
  const input = idForm.safeParse(formFields(form));
  if (!input.success) redirect(`${TAB}&error=Invalid+request`);
  done(await deleteScenario(serverStore(), input.data.id, raiseScenarioChange), input.data.req ? `#${input.data.req}` : '');
}

export async function acceptSuggestionAction(form: FormData): Promise<void> {
  await guard();
  const input = idForm.safeParse(formFields(form));
  if (!input.success) redirect(`${TAB}&error=Invalid+request`);
  done(await acceptSuggestion(serverStore(), input.data.id, raiseScenarioChange), input.data.req ? `#${input.data.req}` : '');
}

export async function clearSuggestionAction(form: FormData): Promise<void> {
  const input = idForm.safeParse(formFields(form));
  if (!input.success) redirect(`${TAB}&error=Invalid+request`);
  await clearSuggestion(serverStore(), input.data.id);
  revalidatePath('/spec');
  redirect(`${TAB}${input.data.req ? `#${input.data.req}` : ''}`);
}

export async function acceptAllSuggestionsAction(): Promise<void> {
  await guard();
  done(await acceptAllSuggestions(serverStore(), raiseScenarioChange));
}

export async function suggestFailureAction(form: FormData): Promise<void> {
  const input = z.strictObject({ req: z.string().regex(/^REQ-\d{3,}$/) }).safeParse(formFields(form));
  if (!input.success) redirect(`${TAB}&error=Invalid+request`);
  const store = serverStore();
  done(await suggestFailureCase(store, input.data.req, providerWriter(store)), `#${input.data.req}`);
}
