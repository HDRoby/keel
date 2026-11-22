// Brainstorm styles (mockup screen "Brainstorm styles", REQ-011).
import { serverStore } from '@/lib/store/server-store';
import Link from 'next/link';
import { ErrorAlert, NotInitialised, PageHead, Topbar } from '@/components/Shell';
import { listStyles } from '@/lib/brainstorm/styles';
import { isInitialised } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

export default async function StylesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const home = serverStore().root;
  return (
    <>
      <Topbar title="Brainstorm styles" />
      <main className="content">
        <PageHead title="Brainstorm styles" description={<>Stored in <code>.keel/styles</code>. Editing saves a new version; brainstorms keep the version they started with.</>} />
        {!isInitialised(home) && <NotInitialised what="brainstorm styles" />}
        <div className="card">
          <ErrorAlert error={error} />
          <ul className="plain-list">
            {listStyles(home).map((s) => (
              <li key={s.id}><Link href={`/styles/${s.id}`}>{s.name} v{s.version}</Link> — {s.description}</li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
