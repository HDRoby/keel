// App shell (docs/ui-guide.md › Shell, docs/ui/keel-components.css navigation): the side menu with the Project,
// Library and Settings groups, and the header bar. One project per folder (CR-0004): no project list.
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { serverStore } from '@/lib/store/server-store';
import { Icon } from './Icons';
import { NavGroup } from './NavLink';
import { Notice } from './ui/Notice';
import styles from './Shell.module.css';

export interface ShellProject {
  title: string;
  id: string;
}

const PROJECT_LINKS: [string, string][] = [
  ['/setup', 'Project setup'], ['/explore', 'Explore'], ['/intent', 'Intent'], ['/spec', 'Spec'], ['/plan', 'Plan'],
  ['/handoff', 'Handoff'], ['/roadmap', 'Roadmap'], ['/changes', 'Changes'], ['/readiness', 'AI readiness'], ['/trace', 'Traceability'],
];
const LIBRARY_LINKS: [string, string][] = [['/templates', 'Templates'], ['/styles', 'Brainstorm styles'], ['/standards', 'Standards']];

/** The side menu (docs/ui-guide.md › Shell) and the page. Before initialisation the project group has only Initialise. */
export function Shell({ project, setup, children }: { project?: ShellProject; setup?: { project: boolean }; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.sideInner}>
        <Link href="/" className={styles.brand}>
          {/* As wide as the word below it: the image takes no width of its own. */}
          <Image src="/keel-logo.png" alt="" width={266} height={296} priority className={styles.logo} />
          <span>Keel</span>
        </Link>
        {setup ? (
          <>
            {/* Setup mode (CR-0012): only these open until every startup check passes. */}
            <NavGroup label="Setup" name="Setup" icon="build" links={[['/check', 'Startup check'], ['/settings', 'Settings'], ...(setup.project ? [['/setup', 'Project setup'] as [string, string]] : [])]} />
            <div className={styles.locked} aria-label="Locked until the startup check passes"><Icon name="lock" /> <span>{project ? `Project · ${project.title}` : 'This folder'} (locked)</span></div>
          </>
        ) : (
          <>
            {project
              ? <NavGroup label={`Project · ${project.title}`} name="Project" icon="lightbulb" links={PROJECT_LINKS} />
              : <NavGroup label="This folder" name="Project" icon="lightbulb" links={[['/', 'Initialise'], ['/readiness', 'AI readiness']]} exact />}
            <NavGroup label="Library (.keel)" name="Library" icon="folder" links={LIBRARY_LINKS} />
            <NavGroup label="Settings" name="Settings" icon="settings" links={[['/check', 'Startup check'], ['/settings', 'Settings']]} />
          </>
        )}
        </div>
      </aside>
      <div className={styles.main}>{children}</div>
    </div>
  );
}

/** The header bar at the top of a page: "Keel · <folder>" over the screen name. */
export function Topbar({ title }: { title: string }) {
  const folder = serverStore().root.replace(process.env.HOME ?? '\0', '~');
  return (
    <header className={styles.header}>
      <span className={styles.subtitle}>Keel · {folder}</span>
      <span className={styles.title}>{title}</span>
    </header>
  );
}

/** Error text from a form action, shown inside the page. */
export function ErrorAlert({ error }: { error?: string }) {
  return error ? <Notice kind="danger" role="alert">{error}</Notice> : null;
}

/** Shown on library pages before the folder has .keel/. */
export function NotInitialised({ what }: { what: string }) {
  return (
    <Notice kind="info" title="This folder is not initialised yet">
      Keel copies the {what} into <code>.keel/</code> when you <Link href="/">initialise it</Link>.
    </Notice>
  );
}
