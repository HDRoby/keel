import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { runStartupCheck } from '@/lib/startup/check';
import { setupRedirect } from '@/lib/startup/guard';
import { KEEL_PATH_HEADER } from '@/proxy';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import 'material-symbols/outlined.css';
import './globals.css';

export const metadata = { title: 'Keel' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = serverStore();
  const project = readProject(store.root);
  // The startup check before anything else (CR-0012): in setup mode only some pages open.
  const startup = await runStartupCheck(store);
  const path = (await headers()).get(KEEL_PATH_HEADER) ?? '/';
  const to = setupRedirect(startup, path);
  if (to && to !== path) redirect(to);
  return (
    <html lang="en">
      <body>
        <Shell setup={startup.ok ? undefined : { project: startup.projectBad }} project={project.ok ? { title: project.value.title, id: project.value.id } : undefined}>{children}</Shell>
      </body>
    </html>
  );
}
