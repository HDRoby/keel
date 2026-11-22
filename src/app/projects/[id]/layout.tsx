// Project pages: the shell with the project's own section in the sidebar.
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export default async function ProjectLayout({ children }: { children: ReactNode }) {
  const project = readProject(serverStore().root);
  if (!project.ok) notFound();
  return <Shell project={{ id: project.value.id, title: project.value.title }}>{children}</Shell>;
}
