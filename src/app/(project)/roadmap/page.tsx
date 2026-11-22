// Roadmap (mockup 6c): docs/roadmap.md of this project, Now, Next, Later and Not doing.
import { raiseFromRoadmapAction } from '../changes/actions';
import { Markdown } from '@/components/Markdown';
import { PageHead, Topbar } from '@/components/Shell';
import { readDocument } from '@/lib/store/documents';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function RoadmapPage() {
  const store = serverStore();
  const project = readProject(store.root);
  const roadmap = readDocument(store, 'docs/roadmap.md');
  const title = project.ok ? project.value.title : 'Project';
  // The items under "## Next", one per "- " line.
  const nextSection = roadmap.ok ? /^## Next\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(roadmap.value.body)?.[1] ?? '' : '';
  const next = nextSection.split('\n').map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim()).filter((l): l is string => Boolean(l));
  return (
    <>
      <Topbar crumb={`${title} · Project`} title="Roadmap" />
      <main className="content">
        <PageHead title="Roadmap" meta={roadmap.ok ? `${roadmap.value.header.id} v${roadmap.value.header.version}` : undefined}
          description={<>An idea for this project goes on its roadmap. An unrelated idea gets its own folder: <code>npx keel ../another-idea</code>.</>} />
        <section className="card">
          {roadmap.ok ? <Markdown text={roadmap.value.body} /> : <p>No roadmap yet. Keel writes <code>docs/roadmap.md</code> with the handoff.</p>}
        </section>
        {next.length > 0 && (
          <section className="card" aria-labelledby="raise">
            <h2 id="raise" className="tight">Raise a change request from Next</h2>
            <p className="muted">A Next item that changes approved documents becomes a draft change request in <code>changes/</code>.</p>
            <ul className="plain-list" aria-labelledby="raise">
              {next.map((item) => (
                <li key={item} className="row spread">
                  <span>{item}</span>
                  <form action={raiseFromRoadmapAction}><input type="hidden" name="item" value={item} /><button type="submit">Raise change request</button></form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
