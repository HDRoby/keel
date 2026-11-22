// Brainstorm styles (mockup screen "Brainstorm styles", REQ-011).
import { serverStore } from '@/lib/store/server-store';
import Link from 'next/link';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { listStyles } from '@/lib/brainstorm/styles';
import { ensureSeed } from '@/lib/seed';

export const dynamic = 'force-dynamic';

export default async function StylesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const home = serverStore().root;
  const problems = ensureSeed(home);
  return (
    <>
      <Topbar crumb="Workspace" title="Brainstorm styles" />
      <main className="content">
        <PageHead title="Brainstorm styles" />
        <div className="card">
          {[...problems, ...(error ? [error] : [])].map((p) => <ErrorAlert key={p} error={p} />)}
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
