// Traceability: each requirement with its tasks and scenarios, and what the latest intent change affects (REQ-004).
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/Shell';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import css from '../versions/versions.module.css';
import { listMocks } from '@/lib/mocks/references';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import { buildTrace, latestIntentChange } from '@/lib/trace/index';

export const dynamic = 'force-dynamic';

export default async function TracePage() {
  const { root: home } = serverStore();
  const project = readProject(home);
  if (!project.ok) notFound();
  const dir = home;
  const trace = buildTrace(dir);
  const mocks = listMocks(dir);
  const change = await latestIntentChange(dir, trace);
  const requirements = Object.entries(trace.requirements).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <Topbar title="Traceability" />
      <main className="content">
        <PageHeader title={`Traceability · ${project.value.title}`} meta="docs/traceability.json" description="Each requirement with the tasks that build it, the scenarios that prove it and the mocks that show it." />
        {change && (
          <Card title={<span id="impact">Intent v{change.from} → v{change.to}</span>}>
            {change.changed.length + change.removed.length + change.added.length === 0 ? (
              <p className={css.flat}>No requirement changed.</p>
            ) : (
              <div className={css.stack}>
                <p className={css.flat}>
                  {change.changed.length > 0 && <>Changed: {change.changed.join(', ')}. </>}
                  {change.added.length > 0 && <>Added: {change.added.join(', ')}. </>}
                  {change.removed.length > 0 && <>Removed: {change.removed.join(', ')}.</>}
                </p>
                <h3 id="affected" className={css.subtitle}>Affected</h3>
                <ul aria-labelledby="affected" className={css.impact}>
                  {change.impact.tasks.map((t) => <li key={t.id}>Task {t.id} · {t.title} ({t.requirements.join(', ')})</li>)}
                  {change.impact.scenarios.map((s) => <li key={s.label}>Scenario {s.label} ({s.requirements.join(', ')})</li>)}
                  {change.impact.tasks.length + change.impact.scenarios.length === 0 && <li>Nothing is linked yet.</li>}
                </ul>
              </div>
            )}
          </Card>
        )}
        <Card title="Requirements">
          <DataTable label="Requirements" columns={['ID', 'Statement', 'Tasks', 'Scenarios', 'Mocks']} empty="No requirements yet."
            rows={requirements.map(([req, r]) => ({ key: req, cells: [
              <span key="id" className={css.req}>{req}</span>,
              <span key="s">{r.statement}{r.source && <span className={css.source}> ({r.source})</span>}</span>,
              r.tasks.join(', ') || '—',
              r.scenarios.join('; ') || '—',
              mocks.filter((m) => m.requirements.includes(req)).map((m) => m.id).join(', ') || '—',
            ] }))} />
        </Card>
      </main>
    </>
  );
}
