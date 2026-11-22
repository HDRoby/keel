// Changes (mockup ChangesList, REQ-014, task R18): every change request in changes/, raised by Keel or written by
// hand, with a status computed from its header, the requests it depends on and its tasks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { newChangeAction } from './actions';
import { CopyButton } from '@/components/CopyButton';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { computeStatus, listChanges, nextToApply, progressLabel, type ChangeRequest } from '@/lib/changes/store';
import { migrateDocsChanges } from '@/lib/generate/intent';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

type Filter = 'open' | 'applied' | 'all';
const FILTERS: { value: Filter; label: string }[] = [{ value: 'open', label: 'Open' }, { value: 'applied', label: 'Applied' }, { value: 'all', label: 'All' }];

function meta(cr: ChangeRequest): string {
  if (cr.origin === 'keel') return [cr.affects.join(', '), cr.created && `raised ${cr.created}`].filter(Boolean).join(' · ') || cr.folder;
  const tasks = cr.tasks.length ? (cr.tasks.length === 1 ? cr.tasks[0]?.id : `${cr.tasks[0]?.id} to ${cr.tasks.at(-1)?.id}`) : 'no tasks';
  return `${cr.folder} · ${tasks}`;
}

export default async function ChangesPage({ searchParams }: { searchParams: Promise<{ filter?: string; error?: string; notice?: string }> }) {
  const { filter: given, error, notice } = await searchParams;
  const filter: Filter = given === 'applied' || given === 'all' ? given : 'open';
  const store = serverStore();
  await migrateDocsChanges(store);
  const project = readProject(store.root);
  const all = listChanges(store.root);
  const rows = all.map((cr) => ({ cr, status: computeStatus(cr, all) }))
    .filter(({ status }) => filter === 'all' || (filter === 'applied' ? status.kind === 'applied' : status.kind !== 'applied' && status.kind !== 'rejected'));
  const next = nextToApply(all);
  const prompt = next?.hasPrompt ? readFileSync(join(store.root, next.folder, 'PROMPT.md'), 'utf8') : '';

  return (
    <>
      <Topbar crumb={`${project.ok ? project.value.title : 'Project'} · Project`} title="Changes" />
      <main className="content">
        <PageHead title="Changes"
          description={<>Every change request for this project, read from the <code>changes/</code> folder. Keel raises them when an approved document changes; you can also add your own. Status comes from each request&apos;s header and the status of its tasks.</>} />
        <ErrorAlert error={error} />
        {notice && <p role="status" className="notice">{notice}</p>}

        <section className="card" aria-label="Next to apply">
          <h2 className="tight">Next to apply</h2>
          {next ? (
            <div className="row spread">
              <p className="tight"><Link href={`/changes/${next.id}`}><strong>{next.id}</strong> · {next.title}</Link>
                <span className="muted"> · {computeStatus(next, all).label} · {progressLabel(next)}</span></p>
              {next.hasPrompt ? <CopyButton text={prompt} label="Copy prompt for the agent" /> : <span className="muted">No PROMPT.md yet</span>}
            </div>
          ) : <p className="muted tight">Nothing is ready to apply.</p>}
        </section>

        <section className="card">
          <nav className="filters" aria-label="Filter change requests">
            {FILTERS.map((f) => <Link key={f.value} href={`/changes?filter=${f.value}`} aria-current={f.value === filter ? 'page' : undefined}>{f.label}</Link>)}
            <span className="muted">{rows.length} of {all.length} change request{all.length === 1 ? '' : 's'}</span>
          </nav>
          {all.length === 0 ? <p>No change requests yet. Keel raises one when you change an approved document, or add your own below.</p> : (
            <table aria-label="Change requests">
              <thead><tr><th>ID</th><th>Change</th><th>Status</th><th>Requirements</th><th>Tasks</th><th>Origin</th></tr></thead>
              <tbody>
                {rows.map(({ cr, status }) => (
                  <tr key={cr.id} aria-label={cr.id}>
                    <td><Link href={`/changes/${cr.id}`}><code>{cr.id}</code></Link></td>
                    <td><Link href={`/changes/${cr.id}`}>{cr.title}</Link><div className="muted small">{meta(cr)}</div></td>
                    <td><span className={`pill ${status.kind}`}>{status.label}</span></td>
                    <td>{cr.requirements.join(', ') || '—'}</td>
                    <td>{progressLabel(cr)}</td>
                    <td>{cr.origin === 'keel' ? 'Keel' : 'Written by hand'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small space-above">A request is Applied when all its tasks are done (a request without tasks, when every affected document is resolved). Keel reads task status from <code>tasks/</code>, which the coding agent updates. &quot;Waiting for&quot; names the request it depends on.</p>
        </section>

        <details className="card">
          <summary><strong>New change request</strong></summary>
          <form action={newChangeAction} aria-label="New change request" className="stack space-above">
            <label>Title <input name="title" required maxLength={200} /></label>
            <label>Reason <textarea name="reason" rows={3} /></label>
            <fieldset className="bare row">
              <legend>Affected documents</legend>
              <label><input type="checkbox" name="affects" value="intent" /> Intent</label>
              <label><input type="checkbox" name="affects" value="spec" /> Spec</label>
              <label><input type="checkbox" name="affects" value="plan" /> Plan</label>
            </fieldset>
            <div><button type="submit" className="primary">Raise change request</button></div>
          </form>
        </details>
      </main>
    </>
  );
}
