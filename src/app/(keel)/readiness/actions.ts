'use server';
// Acting on the readiness advice (REQ-016, REQ-014, CR-0015): the choices are saved with the report; in a Keel folder
// the accepted items become a draft change request, before Initialise they go to the baseline plan.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createChangeFromAdvice, handOverToBaseline } from '@/lib/readiness/accept';
import { readReport, type Choice } from '@/lib/readiness/report';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';

const REPORT_ID = /^readiness-\d{4}-\d{2}-\d{2}(-\d+)?$/;

export async function actOnAdviceAction(form: FormData): Promise<void> {
  const id = String(form.get('report') ?? '');
  if (!REPORT_ID.test(id)) redirect('/readiness?error=Invalid+request');
  const store = serverStore();
  const report = readReport(store, id);
  if (!report) redirect('/readiness?error=The+report+is+gone');
  const choices: Record<string, Choice> = {};
  for (const a of report.advice) {
    const value = form.get(`choice:${a.id}`);
    if (value === 'add' || value === 'adopt' || value === 'ignore') choices[a.id] = value;
  }
  const back = `/readiness?report=${id}`;
  if (isInitialised(store.root)) {
    const made = await createChangeFromAdvice(store, id, choices);
    revalidatePath('/', 'layout');
    redirect(made.ok ? `${back}&created=${made.value}` : `${back}&error=${encodeURIComponent(made.message)}`);
  }
  const handed = await handOverToBaseline(store, id, choices);
  redirect(handed.ok ? `${back}&handed=${handed.value}` : `${back}&error=${encodeURIComponent(handed.message)}`);
}
