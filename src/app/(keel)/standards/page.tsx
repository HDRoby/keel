// Standards (mockup 7c): the conventions and guidelines in .keel/standards, chosen per project (REQ-012).
// Read-only here; editing standards on this screen is on the roadmap.
import { ErrorAlert, NotInitialised, PageHead, Topbar } from '@/components/Shell';
import { Markdown } from '@/components/Markdown';
import { listStandards } from '@/lib/standards/library';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised, readProject } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function StandardsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { root } = serverStore();
  const project = readProject(root);
  const chosen = project.ok ? project.value.standards : [];
  return (
    <>
      <Topbar crumb="Library" title="Standards" />
      <main className="content">
        <PageHead title="Standards" description={<>Stored in <code>.keel/standards</code>. Choose them for this project in Project setup; they go into the handoff as skills.</>} />
        <ErrorAlert error={error} />
        {!isInitialised(root) && <NotInitialised what="standards" />}
        {listStandards(root).map((s) => (
          <section key={s.ref} className="card" aria-label={`${s.name} v${s.version}`}>
            <h2 className="tight">{s.name} v{s.version} {chosen.includes(s.ref) && <span className="badge ok">Used by this project</span>}</h2>
            <p className="muted">{s.description} · {s.owner || 'no owner'} · applies to {s.appliesTo.join(', ') || 'nothing yet'}</p>
            <details><summary>Rules</summary><Markdown text={s.rules} /></details>
          </section>
        ))}
      </main>
    </>
  );
}
