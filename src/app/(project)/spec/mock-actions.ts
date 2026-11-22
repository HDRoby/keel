'use server';
// The Spec's Clickable mock tab (REQ-010, task R14): save the exported screens as a new mock set. The matching from
// file names is shown in the browser first; the user's choices for unmatched files come with the form.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { parseMockName } from '@/lib/mocks/match';
import { saveMockSet, type NewSetFile } from '@/lib/mocks/sets';
import { serverStore } from '@/lib/store/server-store';

const TAB = '/spec?tab=mock';
const choiceSchema = z.record(z.string().max(300), z.object({ screen: z.string().max(120), number: z.string().max(3).optional(), reqs: z.array(z.string().regex(/^REQ-\d{3,}$/)).max(50) }));

export async function saveMockSetAction(form: FormData): Promise<void> {
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const link = String(form.get('link') ?? '').trim();
  let choices: z.infer<typeof choiceSchema> = {};
  try {
    const parsed = choiceSchema.safeParse(JSON.parse(String(form.get('choices') ?? '{}')));
    if (parsed.success) choices = parsed.data;
  } catch {
    choices = {};
  }
  const entries: NewSetFile[] = await Promise.all(files.map(async (file) => {
    const name = file.name.slice(0, 300);
    const parsed = parseMockName(name);
    const chosen = choices[name.replace(/\.(png|html?)$/i, '')];
    const screen = chosen?.screen || parsed?.screen;
    return {
      name, bytes: new Uint8Array(await file.arrayBuffer()), reqs: chosen?.reqs.length ? chosen.reqs : parsed?.reqs ?? [],
      ...(screen ? { screen } : {}), ...((chosen?.number || parsed?.number) ? { number: chosen?.number || parsed?.number } : {}),
      matched: parsed?.reqs.length && !chosen ? 'name' : 'user',
    };
  }));
  const saved = await saveMockSet(serverStore(), { files: entries, ...(link ? { link } : {}) });
  revalidatePath('/spec');
  redirect(saved.ok ? `${TAB}&notice=${encodeURIComponent(`Saved mock set ${saved.value.set} from spec v${saved.value.specVersion}.`)}` : `${TAB}&error=${encodeURIComponent(saved.message)}`);
}
