// App shell (docs/ui-guide.md › Shell, docs/ui/keel-components.css navigation): the side menu with the Project,
// Library and Settings groups, and the header bar. One project per folder (CR-0004): no project list.
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { serverStore } from '@/lib/store/server-store';
import { NavGroup } from './NavLink';
import { Notice } from './ui/Notice';
import styles from './Shell.module.css';

export interface ShellProject {
  title: string;
  id: string;
}

const PROJECT_LINKS: [string, string][] = [
  ['/setup', 'Project setup'], ['/explore', 'Explore'], ['/intent', 'Intent'], ['/spec', 'Spec'], ['/plan', 'Plan'],
  ['/handoff', 'Handoff'], ['/roadmap', 'Roadmap'], ['/changes', 'Changes'], ['/trace', 'Traceability'],
];
const LIBRARY_LINKS: [string, string][] = [['/templates', 'Templates'], ['/styles', 'Brainstorm styles'], ['/standards', 'Standards']];

/** The side menu (docs/ui-guide.md › Shell) and the page. Before initialisation the project group has only Initialise. */
export function Shell({ project, children }: { project?: ShellProject; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.sideInner}>
        <Link href="/" className={styles.brand}>
          {/* As wide as the word below it: the image takes no width of its own. */}
          <Image src="/keel-logo.png" alt="" width={266} height={296} priority className={styles.logo} />
          <span>Keel</span>
        </Link>
        {project
          ? <NavGroup label={`Project · ${project.title}`} name="Project" icon="lightbulb" links={PROJECT_LINKS} />
          : <NavGroup label="This folder" name="Project" icon="lightbulb" links={[['/', 'Initialise']]} exact />}
        <NavGroup label="Library (.keel)" name="Library" icon="folder" links={LIBRARY_LINKS} />
        <NavGroup label="Settings" name="Settings" icon="settings" links={[['/settings', 'Settings']]} />
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

/** Page heading: a title with small meta text, a description, and actions on the right. */
export function PageHead({ title, meta, description, actions }: { title: string; meta?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}{meta && <span className="meta">{meta}</span>}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
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
