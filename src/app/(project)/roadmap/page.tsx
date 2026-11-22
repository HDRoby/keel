// Roadmap (mockup 6c): docs/roadmap.md of this project, Now, Next, Later and Not doing.
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
  return (
    <>
      <Topbar crumb={`${title} · Project`} title="Roadmap" />
      <main className="content">
        <PageHead title="Roadmap" meta={roadmap.ok ? `${roadmap.value.header.id} v${roadmap.value.header.version}` : undefined}
          description={<>An idea for this project goes on its roadmap. An unrelated idea gets its own folder: <code>npx keel ../another-idea</code>.</>} />
        <section className="card">
          {roadmap.ok ? <Markdown text={roadmap.value.body} /> : <p>No roadmap yet. Keel writes <code>docs/roadmap.md</code> with the handoff.</p>}
        </section>
      </main>
    </>
  );
}
