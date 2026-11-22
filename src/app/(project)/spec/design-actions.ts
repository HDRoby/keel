'use server';
// The Spec's Design tab (REQ-013, task R12): decide or change a topic. After the spec is approved the change goes
// through a change request (CR-0003).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { decide } from '@/lib/decisions/records';
import { formFields } from '@/lib/form-fields';
import { providerWriter } from '@/lib/generate/writer';
import { commitBlocker } from '@/lib/store/git';
import { serverStore } from '@/lib/store/server-store';

const TAB = '/spec?tab=design';

export async function decideAction(form: FormData): Promise<void> {
  const store = serverStore();
  const blocker = await commitBlocker(store.root);
  if (blocker) redirect(`${TAB}&error=${encodeURIComponent(blocker)}`);
  const input = z.strictObject({
    topic: z.string().min(1).max(120), chosen: z.string().min(1).max(160).optional(),
    own: z.string().trim().max(200), ownSummary: z.string().trim().max(500), reason: z.string().trim().max(2_000),
  }).safeParse(formFields(form));
  if (!input.success) redirect(`${TAB}&error=${encodeURIComponent('Pick an option or write your own')}`);
  const { topic, own, ownSummary, reason } = input.data;
  const chosen = input.data.chosen ?? (own ? 'own' : '');
  if (!chosen) redirect(`${TAB}&error=${encodeURIComponent('Pick an option or write your own')}#${topic}`);
  const decided = await decide(store, topic, { chosen, own: { name: own, summary: ownSummary }, reason }, providerWriter(store));
  revalidatePath('/spec');
  if (!decided.ok) redirect(`${TAB}&error=${encodeURIComponent(decided.message)}#${topic}`);
  redirect('held' in decided.value ? `${TAB}&notice=${encodeURIComponent(`Saved in change request ${decided.value.held}: the spec is approved.`)}#${topic}` : `${TAB}#${topic}`);
}
