'use server';
// Discuss a change (REQ-017, CR-0016): Agree (the only way a change request is created), Edit and Park.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { agree, saveEdit } from '@/lib/discussion/agree';
import { DSC_ID, parkDiscussion, readDiscussion } from '@/lib/discussion/file';
import { proposalSchema, proposalState } from '@/lib/discussion/proposal';
import { defaultAuthor } from '@/lib/settings/settings';
import { serverStore } from '@/lib/store/server-store';

const idOf = (form: FormData) => {
  const id = String(form.get('id') ?? '');
  if (!DSC_ID.test(id)) redirect('/discuss?error=Invalid+request');
  return id;
};

export async function agreeAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const agreed = await agree(serverStore(), id);
  revalidatePath('/', 'layout');
  redirect(agreed.ok ? `/discuss/${id}?agreed=${agreed.value.cr}` : `/discuss/${id}?error=${encodeURIComponent(agreed.message)}`);
}

export async function parkAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const parked = await parkDiscussion(serverStore(), id);
  redirect(parked.ok ? `/discuss/${id}?parked=1` : `/discuss/${id}?error=${encodeURIComponent(parked.message)}`);
}

const lines = (v: FormDataEntryValue | null) => String(v ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Edit: every field of the card; recorded as "<user> edited the proposal" with the fields changed. */
export async function saveEditAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const store = serverStore();
  const d = readDiscussion(store.root, id);
  const state = d ? proposalState(d) : undefined;
  if (state?.kind !== 'waiting') redirect(`/discuss/${id}?error=There+is+no+proposal+to+edit`);
  const pipe = (l: string) => l.split('|').map((x) => x.trim());
  const candidate = {
    title: String(form.get('title') ?? ''), why: String(form.get('why') ?? ''), what: lines(form.get('what')),
    requirements: lines(form.get('requirements')).map((l) => { const [rid = 'new', change = 'new', ...text] = pipe(l); return { id: rid, change, text: text.join(' | ') }; }),
    impact: lines(form.get('impact')).map((l) => { const [area = '', reqs = '', ...what] = pipe(l); return { area, requirements: reqs.split(/[\s,]+/).filter(Boolean), what: what.join(' | ') }; }),
    scenarios: lines(form.get('scenarios')).map((l) => { const [requirement = 'new', ...title] = pipe(l); return { requirement, title: title.join(' | ') }; }),
    tasks: lines(form.get('tasks')).map((l) => { const [title = '', files = ''] = pipe(l); return { title, files: files.split(',').map((f) => f.trim()).filter(Boolean) }; }),
    ...(String(form.get('decision') ?? '').trim() ? { decision: { title: String(form.get('decision')).trim(), alternatives: lines(form.get('alternatives')) } } : {}),
    dependsOn: String(form.get('dependsOn') ?? '').split(/[\s,]+/).filter(Boolean),
    screens: String(form.get('screens') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
  const parsed = proposalSchema.safeParse(candidate);
  if (!parsed.success) redirect(`/discuss/${id}?edit=1&error=${encodeURIComponent(`Check the fields: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join('.')).join(', ')}`)}`);
  const saved = saveEdit(store, id, parsed.data, (await defaultAuthor(store)) || 'You');
  redirect(saved.ok ? `/discuss/${id}` : `/discuss/${id}?error=${encodeURIComponent(saved.message)}`);
}
