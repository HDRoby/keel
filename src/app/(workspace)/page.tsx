// Projects (mockup: projects.png): every idea and how far it has come.
import Link from 'next/link';
import { Plus } from '@/components/Icons';
import { PageHead, Topbar } from '@/components/Shell';
import { decisionsOf, projectState } from '@/lib/gates/approvals';
import { stageGates } from '@/lib/gates/rules';
import { readDocument } from '@/lib/store/documents';
import { gitUserName } from '@/lib/store/git';
import { serverStore } from '@/lib/store/server-store';
import { listProjectSlugs, projectDir, readProject } from '@/lib/store/workspace';
import { requirementIds } from '@/lib/trace/index';
import { repositoryOf } from '@/lib/github/push';
import { readbackState } from '@/lib/readback/changes';

export const dynamic = 'force-dynamic';

type Phase = 'exploring' | 'documents' | 'ready' | 'parked' | 'no-go';
const PHASE: Record<Phase, { label: string; badge: string }> = {
  exploring: { label: 'Exploring', badge: '' },
  documents: { label: '', badge: 'accent' },
  ready: { label: 'Ready to hand off', badge: 'ok' },
  parked: { label: 'Parked', badge: '' },
  'no-go': { label: 'No-go', badge: 'danger' },
};

export default async function ProjectsPage() {
  const store = serverStore();
  const owner = (await gitUserName()) ?? 'single user';
  const rows = listProjectSlugs(store.home).flatMap((slug) => {
    const project = readProject(slug, store.home);
    if (!project.ok) return [];
    const dir = projectDir(slug, store.home);
    const gates = stageGates(projectState(store, slug)).filter((g) => g.available);
    const furthest = gates.at(-1)?.label ?? 'Explore';
    const decision = decisionsOf(dir).at(-1);
    const latest = ['docs/plan.md', 'docs/spec.md', 'docs/intent.md'].map((p) => readDocument(store, slug, p)).find((d) => d.ok);
    const phase: Phase = decision === 'park' ? 'parked' : decision === 'no-go' ? 'no-go'
      : furthest === 'Handoff' ? 'ready' : furthest === 'Explore' ? 'exploring' : 'documents';
    const repository = repositoryOf(store, slug);
    const waiting = readbackState(store, slug).pending.length;
    const repo = !repository?.pushes.length ? { label: 'Not linked', badge: '' }
      : waiting > 0 ? { label: `${waiting} change${waiting === 1 ? '' : 's'} to review`, badge: 'warn' }
      : { label: repository.kind === 'github' ? repository.location : 'Pushed', badge: 'ok' };
    return [{ repo, waiting, handedOff: Boolean(repository?.pushes.length), project: project.value, phase, stage: phase === 'documents' ? furthest : PHASE[phase].label, latest: latest?.ok ? `${latest.value.path.slice(5, -3).replace(/^./, (c) => c.toUpperCase())} v${latest.value.header.version}` : '—', requirements: requirementIds(dir).length }];
  });
  const count = (phases: Phase[]) => rows.filter((r) => phases.includes(r.phase)).length;

  return (
    <>
      <Topbar crumb={`Single-user workspace · ${owner}`} title="Projects" />
      <main className="content">
        <PageHead title="Projects"
          description="Every idea you explore becomes a project. It moves through intent, spec and plan until it is ready for a coding agent."
          actions={<Link href="/start" className="button primary"><Plus /> New idea</Link>} />
        <div className="tiles">
          <div className="tile"><div className="label">Exploring</div><div className="value">{count(['exploring'])}</div></div>
          <div className="tile"><div className="label">Intent, spec or plan</div><div className="value">{count(['documents'])}</div></div>
          <div className="tile"><div className="label">Handed off</div><div className="value">{rows.filter((r) => r.handedOff).length}</div></div>
          <div className="tile"><div className="label">Repository changes to review</div><div className="value">{rows.reduce((n, r) => n + r.waiting, 0)}</div></div>
        </div>
        {rows.length === 0 ? (
          <section className="card"><p>No projects yet. <Link href="/start">Start a new idea</Link>.</p></section>
        ) : (
          <section className="card flush">
            <table aria-label="Projects">
              <thead><tr><th>Project</th><th>Stage</th><th>Latest document</th><th>Requirements</th><th>Repository</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.slug}>
                    <td><Link href={`/projects/${r.project.slug}/explore`}>{r.project.title}</Link><div className="muted">{r.project.id}</div></td>
                    <td><span className={`badge ${PHASE[r.phase].badge}`}>{r.stage}</span></td>
                    <td>{r.latest}</td>
                    <td>{r.requirements || '—'}</td>
                    <td><span className={`badge ${r.repo.badge}`}>{r.repo.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
