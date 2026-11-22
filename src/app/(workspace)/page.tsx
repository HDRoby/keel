// One project per folder (CR-0004): a folder without .keel goes to Start (with any title and description
// from `npx keel --title … --description …`), an initialised one to its current stage.
import { redirect } from 'next/navigation';
import { projectState } from '@/lib/gates/approvals';
import { stageGates } from '@/lib/gates/rules';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ title?: string; description?: string }> }) {
  const { title, description } = await searchParams;
  const store = serverStore();
  const project = readProject(store.root);
  if (!project.ok) {
    const query = new URLSearchParams();
    if (typeof title === 'string') query.set('title', title.slice(0, 120));
    if (typeof description === 'string') query.set('description', description.slice(0, 5_000));
    redirect(`/start${query.size ? `?${query.toString()}` : ''}`);
  }
  // The furthest stage that is open: where the work is now.
  const current = stageGates(projectState(store)).filter((g) => g.available).at(-1)?.stage ?? 'explore';
  redirect(`/projects/${project.value.id}/${current}`);
}
