// App shell (mockups in docs/mocks/): the project and its folder at the top of the sidebar, then the
// Project, Library and Settings groups. One project per folder (CR-0004): no project list.
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Book, Bulb, Gear } from './Icons';
import { NavLink } from './NavLink';

export interface ShellProject {
  title: string;
  id: string;
}

const PROJECT_LINKS: [string, string][] = [
  ['/setup', 'Project setup'], ['/explore', 'Explore'], ['/intent', 'Intent'], ['/spec', 'Spec'], ['/plan', 'Plan'],
  ['/handoff', 'Handoff'], ['/roadmap', 'Roadmap'], ['/changes', 'Changes'], ['/trace', 'Traceability'],
];

export function Shell({ project, folder, children }: { project?: ShellProject; folder: string; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          {/* As wide as the word below it: the image takes no width of its own (globals.css). */}
          <Image src="/keel-logo.png" alt="" width={266} height={296} priority className="brand-logo" />
          <span>Keel</span>
        </Link>
        <div className="project-head" aria-label="This folder">
          <strong>{project ? project.title : 'Not initialised'}</strong>
          <span className="folder-path" title={folder}>{folder}</span>
        </div>
        <nav aria-label="Project" className="nav-group">
          <div className="nav-heading"><Bulb /> Project</div>
          {project
            ? PROJECT_LINKS.map(([href, label]) => <NavLink key={href} href={href}>{label}</NavLink>)
            : <NavLink href="/" exact>Initialise</NavLink>}
        </nav>
        <nav aria-label="Library" className="nav-group">
          <div className="nav-heading"><Book /> Library</div>
          <NavLink href="/templates">Templates</NavLink>
          <NavLink href="/styles">Brainstorm styles</NavLink>
          <NavLink href="/standards">Standards</NavLink>
        </nav>
        <nav aria-label="Settings" className="nav-group nav-bottom">
          <NavLink href="/settings"><Gear /> Settings</NavLink>
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}

/** The white bar at the top of a page: a breadcrumb line and the screen name. */
export function Topbar({ crumb, title }: { crumb: string; title: string }) {
  return (
    <header className="topbar">
      <div className="crumb">{crumb}</div>
      <div className="title">{title}</div>
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
  return error ? <p role="alert" className="alert">{error}</p> : null;
}

/** Shown on library pages before the folder has .keel/. */
export function NotInitialised({ what }: { what: string }) {
  return (
    <section className="card">
      <p>This folder is not initialised yet. Keel copies the {what} into <code>.keel/</code> when you <Link href="/">initialise it</Link>.</p>
    </section>
  );
}
