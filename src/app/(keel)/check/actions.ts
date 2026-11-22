'use server';
// Check again (CR-0012): runs the startup check afresh; when it passes, opens the project at its stage.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { forgetStartupCheck, runStartupCheck } from '@/lib/startup/check';
import { serverStore } from '@/lib/store/server-store';

export async function checkAgainAction(): Promise<void> {
  const store = serverStore();
  forgetStartupCheck(store);
  const result = await runStartupCheck(store, { force: true });
  revalidatePath('/', 'layout');
  redirect(result.ok ? '/' : '/check');
}
