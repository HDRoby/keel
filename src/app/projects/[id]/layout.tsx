// Project pages: the shell with the project's own section in the sidebar.
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { serverStore } from '@/lib/store/server-store';
import { readProject, SLUG } from '@/lib/store/workspace';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SLUG.test(id)) notFound();
  const project = readProject(id, serverStore().home);
  if (!project.ok) notFound();
  return <Shell project={{ slug: id, title: project.value.title }}>{children}</Shell>;
}
