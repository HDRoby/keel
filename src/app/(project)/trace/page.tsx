// Traceability: each requirement with its tasks and scenarios, and what the latest intent change affects (REQ-004).
import { notFound } from 'next/navigation';
import { PageHead, Topbar } from '@/components/Shell';
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
      <Topbar crumb={`${project.value.title} · ${project.value.id}`} title="Traceability" />
      <main className="content">
        <PageHead title={`Traceability · ${project.value.title}`} />
        <div className="card">
          {change && (
            <section aria-labelledby="impact">
              <h2 id="impact">Intent v{change.from} → v{change.to}</h2>
              {change.changed.length + change.removed.length + change.added.length === 0 ? (
                <p>No requirement changed.</p>
              ) : (
                <>
                  <p>
                    {change.changed.length > 0 && <>Changed: {change.changed.join(', ')}. </>}
                    {change.added.length > 0 && <>Added: {change.added.join(', ')}. </>}
                    {change.removed.length > 0 && <>Removed: {change.removed.join(', ')}.</>}
                  </p>
                  <h3 id="affected">Affected</h3>
                  <ul aria-labelledby="affected">
                    {change.impact.tasks.map((t) => <li key={t.id}>Task {t.id} · {t.title} ({t.requirements.join(', ')})</li>)}
                    {change.impact.scenarios.map((s) => <li key={s.label}>Scenario {s.label} ({s.requirements.join(', ')})</li>)}
                    {change.impact.tasks.length + change.impact.scenarios.length === 0 && <li>Nothing is linked yet.</li>}
                  </ul>
                </>
              )}
            </section>
          )}

          <h2>Requirements</h2>
          {requirements.length === 0 ? <p>No requirements yet.</p> : (
            <table>
              <thead><tr><th>ID</th><th>Statement</th><th>Tasks</th><th>Scenarios</th><th>Mocks</th></tr></thead>
              <tbody>
                {requirements.map(([req, r]) => (
                  <tr key={req}>
                    <td>{req}</td>
                    <td>{r.statement}{r.source && <small> ({r.source})</small>}</td>
                    <td>{r.tasks.join(', ') || '—'}</td>
                    <td>{r.scenarios.join('; ') || '—'}</td>
                    <td>{mocks.filter((m) => m.requirements.includes(req)).map((m) => m.id).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
