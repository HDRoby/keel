// Changes (mockup 6b): the change requests in docs/changes/ of this project. Raising and approving
// change requests across stages is CR-0003, on the roadmap's Next list.
import { Markdown } from '@/components/Markdown';
import { PageHead, Topbar } from '@/components/Shell';
import { listDocumentPaths, readDocument } from '@/lib/store/documents';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function ChangesPage() {
  const store = serverStore();
  const project = readProject(store.root);
  const changes = listDocumentPaths(store.root).filter((p) => p.startsWith('docs/changes/')).map((p) => readDocument(store, p));
  return (
    <>
      <Topbar crumb={`${project.ok ? project.value.title : 'Project'} · Project`} title="Changes" />
      <main className="content">
        <PageHead title="Changes" description={<>Change requests in <code>docs/changes/</code>. Raising and approving them across stages comes with CR-0003.</>} />
        {changes.length === 0 && <section className="card"><p>No change requests yet.</p></section>}
        {changes.map((c) => c.ok && (
          <section key={c.value.path} className="card" aria-label={c.value.header.id}>
            <h2 className="tight">{c.value.header.id} · {c.value.header.title}</h2>
            <p className="muted">{c.value.header.status} · v{c.value.header.version} · {c.value.path}</p>
            <details><summary>Read</summary><Markdown text={c.value.body} /></details>
          </section>
        ))}
      </main>
    </>
  );
}
