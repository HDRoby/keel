// Template library (mockup screen "Templates", REQ-003).
import { serverStore } from '@/lib/store/server-store';
import Link from 'next/link';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { ensureLibrary, GROUPS, listTemplates, seedDir } from '@/lib/templates/library';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const home = serverStore().root;
  const seeded = ensureLibrary(home, seedDir());
  const templates = listTemplates(home);
  return (
    <>
      <Topbar crumb="Workspace" title="Templates" />
      <main className="content">
        <PageHead title="Templates"
          description="Templates for every document, grouped by kind. Editing saves a new version; a template in use cannot be removed." />
        {!seeded.ok && <ErrorAlert error={`Could not load the seed library: ${seeded.message}`} />}
        <ErrorAlert error={error} />
        {GROUPS.map(({ group, label }) => {
          const inGroup = templates.filter((t) => t.group === group);
          if (inGroup.length === 0) return null;
          return (
            <section key={group} aria-label={label} className="card">
              <h2>{label}</h2>
              <ul className="plain-list">
                {inGroup.map((t) => (
                  <li key={t.id}><Link href={`/templates/${t.id}`}>{t.name}</Link></li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </>
  );
}
