// App shell (mockups in docs/mocks/): sidebar with the workspace, and the open project's stages.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bulb, Folder } from './Icons';
import { NavLink } from './NavLink';

export interface ShellProject {
  id: string;
  title: string;
}

export function Shell({ project, children }: { project?: ShellProject; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">Keel</Link>
        <nav aria-label="Workspace" className="nav-group">
          <div className="nav-heading"><Folder /> Workspace</div>
                    <NavLink href="/templates">Templates</NavLink>
          <NavLink href="/styles">Brainstorm styles</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>
        {project && (
          <nav aria-label="Project" className="nav-group">
            <div className="nav-heading"><Bulb /> {project.title}</div>
            {[
              ['setup', 'Project setup'], ['explore', 'Explore'], ['intent', 'Intent'], ['spec', 'Spec'],
              ['plan', 'Plan'], ['handoff', 'Handoff'], ['trace', 'Traceability'],
            ].map(([path, label]) => <NavLink key={path} href={`/projects/${project.id}/${path}`}>{label}</NavLink>)}
          </nav>
        )}
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
