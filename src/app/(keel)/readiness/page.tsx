// AI readiness report (REQ-016, CR-0015; mock source docs/mocks/set-1/source/readiness.html): how ready this folder is
// for coding agents, on demand, for any folder. Before running: the two steps, the files the model may read and what is
// sent. After: the ratings of six areas, your AI files and the Keel standard, advice with Add, Adopt or Ignore, and
// earlier reports. Not available in setup mode (the root layout sends it to the Startup check).
import Link from 'next/link';
import { actOnAdviceAction } from './actions';
import { ReadinessRun } from './ReadinessRun';
import css from './readiness.module.css';
import { Icon } from '@/components/Icons';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChoiceGroup } from '@/components/ui/ChoiceGroup';
import { DataTable } from '@/components/ui/DataTable';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag, type TagTone } from '@/components/ui/Tag';
import { formatChangeId, nextNumber } from '@/lib/changes/store';
import { compareReports, listReports, readReport, reportsDir, type ReadinessReport } from '@/lib/readiness/report';
import { readableFiles } from '@/lib/readiness/review';
import { readinessScan, type Evidence, type Rating } from '@/lib/readiness/rules';
import { readinessModel } from '@/lib/readiness/run';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

const CASE: Record<ReadinessReport['folderCase'], { label: string; tone: TagTone }> = {
  keel: { label: 'Keel project', tone: 'accent' },
  existing: { label: 'Existing project, no AI files', tone: 'warn' },
  'existing-ai': { label: 'Existing project with its own AI setup', tone: 'link' },
  new: { label: 'New, empty folder', tone: 'neutral' },
};
const RATE: Record<Rating, { tone: TagTone; icon: string }> = { Ready: { tone: 'ok', icon: 'check_circle' }, Partly: { tone: 'warn', icon: 'error' }, Missing: { tone: 'danger', icon: 'cancel' } };
const IMPACT: Record<string, TagTone> = { High: 'danger', Medium: 'warn', Low: 'neutral' };

const where = (evidence: Evidence[]) => evidence.length ? evidence.map((e) => `${e.path}${e.line ? `:${e.line}` : ''}`).join(' · ') : 'none found';
const counts = (r: ReadinessReport) => (['Ready', 'Partly', 'Missing'] as Rating[]).map((rating) => `${r.areas.filter((a) => a.rating === rating).length} ${rating.toLowerCase()}`).join(' · ');
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function ReadinessPage({ searchParams }: { searchParams: Promise<{ report?: string; compare?: string; run?: string; created?: string; handed?: string; error?: string }> }) {
  const params = await searchParams;
  const store = serverStore();
  const scan = readinessScan(store.root);
  const reports = listReports(store);
  const report = (params.report ? readReport(store, params.report) : undefined) ?? reports[0];
  const running = params.run === '1' || !report;
  const kase = CASE[scan.kase];
  const { inProject } = reportsDir(store);

  return (
    <>
      <Topbar title="AI readiness report" />
      <main className="content">
        <PageHeader title="AI readiness report" meta={<Tag tone={kase.tone}>{kase.label}</Tag>}
          description="Checks how ready this folder is for coding agents, and suggests what to add and why. Runs only when you ask. Works for any folder: new, existing, with or without AI files, and Keel projects."
          actions={!running ? <ButtonLink href="/readiness?run=1"><Icon name="refresh" size={18} /> Run again</ButtonLink> : undefined} />
        <ErrorAlert error={params.error} />
        {running ? await RunCard({ store, scan }) : report && <ReportView report={report} reports={reports} compare={params.compare} created={params.created} handed={params.handed} inProject={inProject} root={store.root} />}
      </main>
    </>
  );
}

async function RunCard({ store, scan }: { store: ReturnType<typeof serverStore>; scan: ReturnType<typeof readinessScan> }) {
  const withModel = scan.kase !== 'new';
  const found = [scan.stack, scan.agentFiles.length ? scan.agentFiles.join(', ') : 'no AI agent files', scan.facts.ciWorkflows.length ? `CI: ${scan.facts.ciWorkflows.join(', ')}` : undefined].filter(Boolean).join(' · ');
  return (
    <Card title="Run the check">
      <div className={css.stack}>
        <div className={css.twoSteps}>
          <div className={css.stepCard}>
            <strong className={css.stepTitle}><Icon name="folder_open" size={20} /> 1 · Scan this folder</strong>
            <span>Reads file names and manifests and compares them with the Keel standard. No model call; nothing leaves this computer.</span>
            <span className={css.muted}>Found: {scan.kase === 'new' ? 'an empty folder' : found}</span>
          </div>
          <div className={css.stepCard}>
            <strong className={css.stepTitle}><Icon name="smart_toy" size={20} /> 2 · Model review</strong>
            <span>Explains each gap for this project, puts the advice in order and reviews the AI files you choose below.</span>
            <span className={css.muted}>{withModel ? `Model: ${await readinessModel(store)} · from Settings, "Feasibility review"` : 'Not needed: the folder is empty.'}</span>
          </div>
        </div>
        <ReadinessRun files={withModel ? readableFiles(scan).map(({ path, ticked, blocked }) => ({ path, ticked, blocked })) : []} withModel={withModel} />
      </div>
    </Card>
  );
}

function ReportView({ report, reports, compare, created, handed, inProject, root }: { report: ReadinessReport; reports: ReadinessReport[]; compare?: string; created?: string; handed?: string; inProject: boolean; root: string }) {
  const earlier = compare ? reports.find((r) => r.id === compare) : undefined;
  const comparison = earlier ? compareReports(earlier, report) : undefined;
  const keel = isInitialised(root);
  const next = report.folderCase === 'new' ? 'Initialise this folder' : keel ? `Create change request ${report.change ?? formatChangeId(nextNumber(root))}` : 'Add to the baseline plan';
  const high = report.advice.filter((a) => a.impact === 'High').length;
  return (
    <>
      <Card label="Summary">
        <div className={css.summary}>
          <div className={css.counts}>
            {(['Ready', 'Partly', 'Missing'] as Rating[]).map((r) => (
              <div key={r} className={css.count}><span className={css.number}>{report.areas.filter((a) => a.rating === r).length}</span><span>{r}</span></div>
            ))}
          </div>
          <div className={css.facts}>
            <strong>{report.advice.length} {report.advice.length === 1 ? 'piece' : 'pieces'} of advice · {high} high impact</strong>
            <span className={css.muted}>{when(report.date)} · {report.model ? `model review with ${report.model}` : 'scan only'}, {(report.durationMs / 1000).toFixed(1)} s · {report.read.length ? `read ${report.read.join(', ')}` : 'file and folder names only'}</span>
            <span className={css.muted}>Saved to <code>{inProject ? `.keel/reports/${report.id}.md` : `~/.config/keel/reports/…/${report.id}.md`}</code>{inProject ? ' · committed' : ' · moved into .keel/reports when the folder is initialised'}</span>
          </div>
        </div>
      </Card>

      {report.modelError && <Notice kind="warning" title="The model review did not finish">{report.modelError}. The ratings and advice below come from the scan. <Link href="/readiness?run=1">Run again</Link></Notice>}

      <section aria-label="Areas" className={css.areas}>
        {report.areas.map((a) => (
          <article key={a.area} aria-label={a.area} className={css.area}>
            <div className={css.areaHead}><Icon name={RATE[a.rating].icon} size={20} /><strong>{a.area}</strong><Tag tone={RATE[a.rating].tone}>{a.rating}</Tag></div>
            <span>{a.summary}</span>
            <code className={css.evidence}>{where(a.evidence)}</code>
            {a.source === 'Model review' && <span className={css.muted}>Found by the model review</span>}
          </article>
        ))}
      </section>

      {report.mapping.length > 0 && (
        <Card title="Your AI files and the Keel standard" meta="Nothing is overwritten. Each choice is applied only when you accept the advice below.">
          <DataTable label="Your AI files and the Keel standard" columns={['Your file', 'Keel equivalent', 'Proposal', 'Note']}
            rows={report.mapping.map((m) => ({ key: m.file, label: m.file, cells: [<code key="f">{m.file}</code>, m.keel, <Tag key="p" tone={m.proposal === 'Adopt' ? 'ok' : m.proposal === 'Point to' ? 'link' : 'neutral'}>{m.proposal}</Tag>, m.note] }))} />
        </Card>
      )}

      <Card title="Advice" meta="In order of impact. Every item names the files it is based on; advice the scan could not confirm is dropped.">
        <form action={actOnAdviceAction} className={css.stack} aria-label="Advice">
          <input type="hidden" name="report" value={report.id} />
          {report.folderCase !== 'new' && <p className={css.muted}>Add: Keel creates or changes it · Adopt: keep yours, Keel uses it · Ignore: hidden next time</p>}
          <ol className={css.advice}>
            {report.advice.map((a, i) => (
              <li key={a.id} className={css.item} aria-label={a.title}>
                <div className={css.itemHead}>
                  <span className={css.index}>{i + 1}</span>
                  <strong className={css.itemTitle}>{a.title}</strong>
                  <Tag>{a.area}</Tag>
                  {report.folderCase !== 'new' && <ChoiceGroup label={`Choice for ${a.title}`} name={`choice:${a.id}`} value={a.choice} options={[{ value: 'add', label: 'Add' }, { value: 'adopt', label: 'Adopt' }, { value: 'ignore', label: 'Ignore' }]} />}
                </div>
                <p className={css.why}>{a.why}</p>
                <div className={css.tags}>
                  <Tag tone={IMPACT[a.impact]}>Impact: {a.impact}</Tag><Tag>Effort: {a.effort}</Tag>
                  <Tag tone={a.source === 'Model review' ? 'handoff' : 'neutral'}><Icon name={a.source === 'Model review' ? 'smart_toy' : 'rule'} size={16} /> {a.source}</Tag>
                  <span className={css.muted}>Based on: {where(a.evidence)}</span>
                  {keel && <Link href={`/discuss?start=${encodeURIComponent(`From the AI readiness report: ${a.title}. ${a.why}`)}`}>Discuss</Link>}
                </div>
              </li>
            ))}
          </ol>
          {report.hidden.length > 0 && <p className={css.muted}>{report.hidden.length} {report.hidden.length === 1 ? 'piece' : 'pieces'} of advice ignored in an earlier report {report.hidden.length === 1 ? 'is' : 'are'} not shown.</p>}
          <div className={css.row}>
            {report.folderCase === 'new'
              ? <ButtonLink href="/" variant="primary">{next}</ButtonLink>
              : <Button type="submit" variant="primary" disabled={Boolean(report.change)}>{next}</Button>}
            <span className={css.muted}>{report.folderCase === 'new' ? 'Opens Initialise.' : keel ? 'Accepted advice becomes one change request with a task per item, ready for your coding agent.' : 'Accepted advice goes into the baseline plan; Keel writes the files at handoff.'}</span>
          </div>
          {(created ?? report.change) && <Notice kind="success" title={`${created ?? report.change} created as a draft`}>One task per accepted item. <Link href={`/changes/${created ?? report.change}`}>Open it</Link></Notice>}
          {(handed || report.handedOver) && !keel && <Notice kind="success" title="Added to the baseline plan">{handed ? `${handed} items.` : ''} Initialise preselects what it covers; the rest become tasks in the plan. <Link href="/">Open Initialise</Link></Notice>}
        </form>
      </Card>

      <Card title="Earlier reports" meta={inProject ? 'Stored in .keel/reports. Compare to see what improved.' : 'Kept on this computer until the folder is initialised. Compare to see what improved.'}>
        <ul className={css.history} aria-label="Earlier reports">
          {reports.map((r) => (
            <li key={r.id} className={css.historyRow}>
              <span>{when(r.date)}</span><code>{r.id}.md</code><span className={css.muted}>{counts(r)}</span>
              {r.id === report.id ? <Tag tone="accent">{r.id === reports[0]?.id ? 'Latest' : 'Shown'}</Tag> : <Link href={`/readiness?report=${report.id}&compare=${r.id}`}>Compare</Link>}
            </li>
          ))}
        </ul>
        {reports.length === 1 && <p className={css.muted}>This is the first report for this folder.</p>}
        {comparison && earlier && (
          <div className={css.compare} aria-label="Comparison">
            <strong>Compared with {earlier.id}</strong>
            {comparison.ratings.length ? <ul>{comparison.ratings.map((c) => <li key={c.area}>{c.area}: {c.from} → {c.to}</li>)}</ul> : <span className={css.muted}>No rating changed.</span>}
            {comparison.added.length > 0 && <span>New advice: {comparison.added.join('; ')}</span>}
            {comparison.gone.length > 0 && <span>No longer advised: {comparison.gone.join('; ')}</span>}
          </div>
        )}
      </Card>
    </>
  );
}
