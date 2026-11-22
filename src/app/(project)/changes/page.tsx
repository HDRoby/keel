// Changes (mock source ChangesList.dc.html, REQ-014, task R18): every change request in changes/, raised by Keel or written by
// hand, with a status computed from its header, the requests it depends on and its tasks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { newChangeAction } from './actions';
import { CopyButton } from '@/components/CopyButton';
import { ChangeStatus } from '@/components/ChangeStatus';
import { Icon } from '@/components/Icons';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import css from './changes.module.css';
import { computeStatus, listChanges, nextToApply, progressLabel, type ChangeRequest } from '@/lib/changes/store';
import { migrateDocsChanges } from '@/lib/generate/intent';
import { serverStore } from '@/lib/store/server-store';

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
  const all = listChanges(store.root);
  const rows = all.map((cr) => ({ cr, status: computeStatus(cr, all) }))
    .filter(({ status }) => filter === 'all' || (filter === 'applied' ? status.kind === 'applied' : status.kind !== 'applied' && status.kind !== 'rejected'));
  const next = nextToApply(all);
  const prompt = next?.hasPrompt ? readFileSync(join(store.root, next.folder, 'PROMPT.md'), 'utf8') : '';

  return (
    <>
      <Topbar title="Changes" />
      <main className="content">
        <PageHeader title="Changes" meta="changes/"
          description={<>Every change request for this project, read from the <code>changes/</code> folder. Keel raises them when an approved document changes; you can also add your own. Status comes from each request&apos;s header and the status of its tasks.</>} />
        <ErrorAlert error={error} />
        {notice && <Notice kind="success" role="status">{notice}</Notice>}

        <Card label="Next to apply" title="Next to apply" actions={next?.hasPrompt ? <CopyButton text={prompt} label="Copy prompt for the agent" /> : undefined}>
          {next ? (
            <p className={css.flat}><Link href={`/changes/${next.id}`}><strong>{next.id}</strong> · {next.title}</Link>
              <span className={css.muted}> · {computeStatus(next, all).label} · {progressLabel(next)}{next.hasPrompt ? '' : ' · no PROMPT.md yet'}</span></p>
          ) : <p className={css.muted}>Nothing is ready to apply.</p>}
        </Card>

        <Card title="Change requests" actions={<>
          <Segmented label="Filter change requests" items={FILTERS.map((f) => ({ href: `/changes?filter=${f.value}`, label: f.label, current: f.value === filter }))} />
          <span className={css.muted}>{rows.length} of {all.length}</span>
        </>}>
          <div className={css.stack}>
            {all.length === 0 ? <p className={css.flat}>No change requests yet. Keel raises one when you change an approved document, or add your own below.</p> : (
              <DataTable label="Change requests" columns={['ID', 'Change', 'Status', 'Requirements', 'Tasks', 'Origin']}
                rows={rows.map(({ cr, status }) => ({ key: cr.id, label: cr.id, cells: [
                  <Link key="id" href={`/changes/${cr.id}`}><code>{cr.id}</code></Link>,
                  <span key="t" className={css.cell}><Link href={`/changes/${cr.id}`}>{cr.title}</Link><span className={css.muted}>{meta(cr)}</span></span>,
                  <ChangeStatus key="s" status={status} />,
                  cr.requirements.join(', ') || '—',
                  progressLabel(cr),
                  cr.origin === 'keel' ? 'Keel' : 'Written by hand',
                ] }))} />
            )}
            <p className={css.muted}>A request is Applied when all its tasks are done (a request without tasks, when every affected document is resolved). Keel reads task status from <code>tasks/</code>, which the coding agent updates. &quot;Waiting for&quot; names the request it depends on.</p>
          </div>
        </Card>

        <Card title="New change request" meta="Raise your own: it goes to changes/ as a draft.">
          <form action={newChangeAction} aria-label="New change request" className={css.stack}>
            <Field label="Title"><input name="title" required maxLength={200} /></Field>
            <Field label="Reason" optional><textarea name="reason" rows={3} /></Field>
            <fieldset className={css.checks}>
              <legend className={css.legend}>Affected documents</legend>
              <label><input type="checkbox" name="affects" value="intent" /> Intent</label>
              <label><input type="checkbox" name="affects" value="spec" /> Spec</label>
              <label><input type="checkbox" name="affects" value="plan" /> Plan</label>
            </fieldset>
            <div><Button type="submit" variant="primary" icon={<Icon name="add" size={18} />}>Raise change request</Button></div>
          </form>
        </Card>
      </main>
    </>
  );
}
