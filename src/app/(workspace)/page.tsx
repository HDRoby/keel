// One project per folder (CR-0004): a folder without .keel goes to Start, an initialised one to its project.
import { redirect } from 'next/navigation';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default function Home() {
  const project = readProject(serverStore().root);
  redirect(project.ok ? `/projects/${project.value.id}/explore` : '/start');
}
