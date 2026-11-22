// Plan stage (mock source Plan.dc.html): the plan, its approval and history, and its tasks (REQ-004, REQ-005, REQ-008).
import { generatePlanAction } from '../actions';
import { Conflicts } from '@/components/Conflicts';
import { DocumentReview } from '@/components/DocumentReview';
import { RegenerateForm } from '@/components/RegenerateForm';
import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { Notice } from '@/components/ui/Notice';
import { ModelUnavailable } from '@/components/ModelUnavailable';
import { modelAvailability } from '@/lib/providers/local';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { LinkButton } from '@/components/ui/LinkButton';
import { StageLayout } from '@/components/ui/StageBar';
import { Tag } from '@/components/ui/Tag';
import css from '../spec/spec.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { projectState } from '@/lib/gates/approvals';
import { mockCheck } from '@/lib/gates/rules';
import { conflictsOf } from '@/lib/generate/resolve';
import { readDocument } from '@/lib/store/documents';
import { buildTrace } from '@/lib/trace/index';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

export default async function PlanPage({ searchParams }: StageProps) {
  const { error } = await searchParams;
  const page = await loadStage('plan');
  const { store, reviewer } = page;
  const plan = readDocument(store, 'docs/plan.md');
  const trace = buildTrace(store.root);
  const mock = mockCheck(projectState(store));
  const model = await modelAvailability(store, 'documents');
  const unavailable = model.ok ? undefined : model.reason;
  const tasks = Object.values(trace.tasks).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  return (
    <StageLayout page={page} error={error}
      meta={plan.ok ? `${page.project.id} · plan.md · ${plan.value.header.id}${plan.value.header.from_spec ? ` · from ${String(plan.value.header.from_spec).replace('@', ' v')}` : ''}` : undefined}
      actions={page.gates.find((g) => g.stage === 'handoff')?.available ? <ButtonLink href="/handoff" variant="primary"><Icon name="rocket_launch" size={18} /> Prepare handoff</ButtonLink> : undefined}>
      {mock === 'warn' && (
        <Notice kind="warning" title="No current clickable mock">
          This project has a UI, and Clickable mock before the plan is Recommended. Make one from the spec&apos;s <Link href="/spec?tab=mock#mock">Clickable mock</Link> tab, or change the setting in <Link href="/settings">Settings</Link>.
        </Notice>
      )}
      {plan.ok ? (
        <div className={css.panel}>
          <DocumentReview home={store.root} document="plan" doc={plan.value} reviewer={reviewer} collapsed
            before={<Conflicts document="plan" conflicts={conflictsOf(plan.value)} />}
            after={plan.value.header.status === 'draft'
              ? <RegenerateForm document="plan" unavailable={unavailable}>Regenerating writes the plan and task files again from the current intent, spec and standards.</RegenerateForm>
              : undefined} />
          <Card title={<span id="tasks">Tasks in plan v{plan.value.header.version}</span>} meta="Each task names the requirements it serves and the scenarios that prove it."
            actions={<LinkButton href="/trace">Traceability</LinkButton>}>
            <DataTable label={`Tasks in plan v${plan.value.header.version}`} columns={['Task', 'Title', 'Requirements', 'Acceptance scenarios']}
              rows={tasks.map((t) => ({ key: t.id, cells: [
                <strong key="id">{t.id}</strong>,
                t.title,
                <span key="reqs" className={css.tags}>{t.requirements.map((r) => <Tag key={r} tone="outline">{r}</Tag>)}</span>,
                trace.scenarios.filter((sc) => sc.requirements.some((r) => t.requirements.includes(r))).map((sc) => sc.scenario).join('; ') || '—',
              ] }))} />
          </Card>
        </div>
      ) : (
        <Card title="Generate plan">
          <form action={generatePlanAction} aria-label="Generate plan" className={css.stack}>
            <p className={css.muted}>Keel fills the plan template from the intent and spec, and writes one task file per task in tasks/.</p>
            {unavailable && <ModelUnavailable what="Generate plan" reason={unavailable} />}
            <div><SubmitButton primary label="Generate plan" busyLabel="Generating plan…" disabled={Boolean(unavailable)} /></div>
          </form>
        </Card>
      )}
    </StageLayout>
  );
}
