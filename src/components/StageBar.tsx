// Stage bar (mockup: stage-bar.png, REQ-005) and the stage page frame.
// Locked stages are greyed out, not links, and say why.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Stage } from '@/lib/documents/types';
import type { StageSummary } from '@/lib/gates/approvals';
import type { StageGate } from '@/lib/gates/rules';
import type { Project } from '@/lib/store/workspace';
import { CheckCircle, Current, Lock, Open } from './Icons';
import { ErrorAlert, PageHead, Topbar } from './Shell';

interface StageBarProps {
  gates: StageGate[];
  current: Stage;
  summaries: Record<Stage, StageSummary>;
}

export function StageBar({ gates, current, summaries }: StageBarProps) {
  return (
    <nav aria-label="Stages" className="stagebar">
      {gates.map((g, i) => {
        const summary = summaries[g.stage];
        const body = (
          <>
            {!g.available ? <Lock /> : g.stage === current ? <Current /> : summary.done ? <CheckCircle /> : <Open />}
            <span>
              <span className="name">{i + 1} · {g.label}</span>
              <span className="detail">{g.available ? summary.detail : g.reason}</span>
            </span>
          </>
        );
        return g.available ? (
          <Link key={g.stage} href={`/${g.stage}`} className="stage" aria-current={g.stage === current ? 'step' : undefined}>{body}</Link>
        ) : (
          <span key={g.stage} role="link" aria-disabled="true" title={g.reason} className="stage">{body}</span>
        );
      })}
    </nav>
  );
}

export interface StageFrame {
  project: Project;
  gates: StageGate[];
  gate: StageGate;
  summaries: Record<Stage, StageSummary>;
}

/** The frame of a stage page: top bar, heading, stage bar, then "Locked." with the reason, or the stage itself. */
export function StageLayout({ page, error, meta, description, actions, locked, children }: {
  page: StageFrame; error?: string; meta?: ReactNode; description?: ReactNode; actions?: ReactNode;
  locked?: ReactNode;   // still shown while the stage is locked, e.g. read-back changes waiting for review
  children: ReactNode;
}) {
  const { project, gates, gate, summaries } = page;
  return (
    <>
      <Topbar crumb={`${project.title} · ${project.id}`} title={gate.label} />
      <main className="content">
        <PageHead title={project.title} meta={meta ?? project.id} description={description} actions={gate.available ? actions : undefined} />
        <StageBar gates={gates} current={gate.stage} summaries={summaries} />
        {!gate.available ? (
          <>
            <section aria-label={`${gate.label} stage`} className="card">
              <h2>{gate.label}</h2>
              <p role="status"><strong>Locked.</strong> {gate.reason}.</p>
            </section>
            {locked}
          </>
        ) : (
          <>
            <ErrorAlert error={error} />
            {children}
          </>
        )}
      </main>
    </>
  );
}
