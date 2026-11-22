// Stage bar (docs/ui-guide.md, mock source StageBar.dc.html, REQ-005) and the stage page frame.
// Each stage: icon, label and a note. Active: accent. Done: ok check. Out of date: warn. Locked: dashed, not a link, says why.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Stage } from '@/lib/documents/types';
import type { StageSummary } from '@/lib/gates/approvals';
import type { StageGate } from '@/lib/gates/rules';
import type { Project } from '@/lib/store/workspace';
import { CheckCircle, Current, Lock, Open, OutOfDate } from '../Icons';
import { ErrorAlert, PageHead, Topbar } from '../Shell';
import { cx } from './cx';
import styles from './StageBar.module.css';

interface StageBarProps {
  gates: StageGate[];
  current: Stage;
  summaries: Record<Stage, StageSummary>;
}

export function StageBar({ gates, current, summaries }: StageBarProps) {
  return (
    <nav aria-label="Stages" className={styles.bar}>
      {gates.map((g, i) => {
        const summary = summaries[g.stage];
        const stale = summary.outOfDate?.length ? summary.outOfDate : undefined;
        const state = !g.available ? 'locked' : g.stage === current ? 'active' : stale ? 'stale' : summary.done ? 'done' : 'open';
        const body = (
          <>
            <span className={styles.icon}>{state === 'locked' ? <Lock /> : state === 'active' ? <Current /> : state === 'stale' ? <OutOfDate /> : state === 'done' ? <CheckCircle /> : <Open />}</span>
            <span className={styles.text}>
              <span className={styles.label}>{i + 1} · {g.label}</span>
              <span className={styles.note}>{g.available ? summary.detail : g.reason}</span>
              {stale ? <span className={cx(styles.note, styles.staleNote)}>Out of date · {stale.join(', ')}</span> : null}
            </span>
          </>
        );
        return g.available ? (
          <Link key={g.stage} href={`/${g.stage}`} className={cx(styles.stage, styles[state])} aria-current={g.stage === current ? 'step' : undefined}>{body}</Link>
        ) : (
          <span key={g.stage} role="link" aria-disabled="true" title={g.reason} className={cx(styles.stage, styles.locked)}>{body}</span>
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
        {summaries[gate.stage]?.outOfDate?.length ? (
          <p role="note" className="notice stale-note">
            Out of date · {summaries[gate.stage]?.outOfDate?.map((id, i) => <span key={id}>{i ? ', ' : ''}<Link href={`/changes/${id}`}>{id}</Link></span>)}: an approved change request affects this stage and is not applied yet.
          </p>
        ) : null}
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
