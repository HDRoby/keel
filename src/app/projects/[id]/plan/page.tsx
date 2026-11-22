// Plan stage (mockup: plan.png): the plan, its approval and history, and its tasks (REQ-004, REQ-005, REQ-008).
import Link from 'next/link';
import { generatePlanAction } from '../../actions';
import { Conflicts } from '@/components/Conflicts';
import { DocumentReview } from '@/components/DocumentReview';
import { RegenerateForm } from '@/components/RegenerateForm';
import { StageLayout } from '@/components/StageBar';
import { SubmitButton } from '@/components/SubmitButton';
import { conflictsOf } from '@/lib/generate/resolve';
import { readDocument } from '@/lib/store/documents';
import { buildTrace } from '@/lib/trace/index';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

export default async function PlanPage({ params, searchParams }: StageProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const page = await loadStage(id, 'plan');
  const { store, reviewer } = page;
  const plan = readDocument(store, 'docs/plan.md');
  const trace = buildTrace(store.root);
  const tasks = Object.values(trace.tasks).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  return (
    <StageLayout page={page} error={error}
      meta={plan.ok ? `${page.project.id} · plan.md · ${plan.value.header.id}${plan.value.header.from_spec ? ` · from ${String(plan.value.header.from_spec)}` : ''}` : undefined}
      actions={page.gates.find((g) => g.stage === 'handoff')?.available ? <Link href={`/projects/${id}/handoff`} className="button primary">Prepare handoff</Link> : undefined}>
      {plan.ok ? (
        <>
          <DocumentReview slug={id} home={store.root} document="plan" doc={plan.value} reviewer={reviewer} collapsed
            before={<Conflicts document="plan" conflicts={conflictsOf(plan.value)} />}
            after={plan.value.header.status === 'draft'
              ? <RegenerateForm document="plan">Regenerating writes the plan and task files again from the current intent, spec and standards.</RegenerateForm>
              : undefined} />
          <section className="card" aria-labelledby="tasks">
            <div className="row spread">
              <h2 id="tasks">Tasks in plan v{plan.value.header.version}</h2>
              <Link href={`/projects/${id}/trace`}>Traceability</Link>
            </div>
            <table aria-labelledby="tasks" className="space-above">
              <thead><tr><th>Task</th><th>Title</th><th>Requirements</th><th>Acceptance scenarios</th></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.id}</strong></td>
                    <td>{t.title}</td>
                    <td>{t.requirements.map((r) => <span key={r} className="tag">{r}</span>)}</td>
                    <td>{trace.scenarios.filter((s) => s.requirements.some((r) => t.requirements.includes(r))).map((s) => s.scenario).join('; ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <form action={generatePlanAction} aria-label="Generate plan" className="card stack">
          <h2>Generate plan</h2>
          <p className="muted">Keel fills the plan template from the intent and spec, and writes one task file per task in tasks/.</p>
          <div><SubmitButton primary label="Generate plan" busyLabel="Generating plan…" /></div>
        </form>
      )}
    </StageLayout>
  );
}
