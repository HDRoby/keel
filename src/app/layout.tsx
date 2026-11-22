import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import 'material-symbols/outlined.css';
import './globals.css';

export const metadata = { title: 'Keel' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const { root } = serverStore();
  const project = readProject(root);
  return (
    <html lang="en">
      <body>
        <Shell folder={root} project={project.ok ? { title: project.value.title, id: project.value.id } : undefined}>{children}</Shell>
      </body>
    </html>
  );
}
