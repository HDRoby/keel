// Project pages need an initialised folder; otherwise they go to Initialise.
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default function ProjectLayout({ children }: { children: ReactNode }) {
  if (!isInitialised(serverStore().root)) redirect('/');
  return children;
}
