// Version history of a document: each version's reason, its line changes and its impact by requirement (REQ-008).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, Topbar } from '@/components/Shell';
import { kindFromPath } from '@/lib/store/documents';
import { serverStore } from '@/lib/store/server-store';
import { projectDir, readProject, SLUG } from '@/lib/store/workspace';
import { buildTrace } from '@/lib/trace/index';
import { bodyAt, compactChanges, documentVersions, lineChanges } from '@/lib/versions/diff';
import { versionImpact } from '@/lib/versions/impact';

export const dynamic = 'force-dynamic';

const MARK = { added: '+', removed: '−', same: ' ' } as const;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; v?: string }>;
}

export default async function VersionsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { doc = 'docs/intent.md', v } = await searchParams;
  if (!SLUG.test(id) || !kindFromPath(doc)) notFound();
  const { home } = serverStore();
  const project = readProject(id, home);
  if (!project.ok) notFound();
  const dir = projectDir(id, home);
  const versions = await documentVersions(dir, doc);
  if (versions.length === 0) notFound();
  const selected = versions.find((x) => String(x.version) === v) ?? versions.at(-1);
  if (!selected) notFound();
  const previous = versions.filter((x) => x.version < selected.version).at(-1);
  const after = (await bodyAt(dir, doc, selected)) ?? '';
  const before = previous ? ((await bodyAt(dir, doc, previous)) ?? '') : '';
  const changes = lineChanges(before, after);
  const impact = previous ? versionImpact(before, after, changes, buildTrace(dir)) : undefined;

  return (
    <>
      <Topbar crumb={`${project.value.title} · ${project.value.id}`} title="Versions" />
      <main className="content">
        <PageHead title={`Versions of ${doc}`} />
        <div className="card">
          <nav aria-label="Versions">
            <ol>
              {versions.map((x) => (
                <li key={x.version}>
                  <Link href={`/projects/${id}/versions?doc=${encodeURIComponent(doc)}&v=${x.version}`} aria-current={x.version === selected.version ? 'page' : undefined}>
                    v{x.version}
                  </Link>{' '}
                  · {x.date} · {x.reason}
                </li>
              ))}
            </ol>
          </nav>

          <h2>Version {selected.version}{previous ? `, compared with version ${previous.version}` : ''}</h2>
          <p role="status">Reason: {selected.reason}</p>

          {impact && (
            <section aria-labelledby="impact">
              <h3 id="impact">Impact</h3>
              {impact.requirements.length === 0 ? <p>No requirement is affected.</p> : (
                <ul aria-labelledby="impact">
                  <li>Requirements: {impact.requirements.join(', ')}</li>
                  {impact.impact.tasks.map((t) => <li key={t.id}>Task {t.id} · {t.title} ({t.requirements.join(', ')})</li>)}
                  {impact.impact.scenarios.map((s) => <li key={s.label}>Scenario {s.label} ({s.requirements.join(', ')})</li>)}
                </ul>
              )}
            </section>
          )}

          <h3 id="changes">{previous ? 'Changes' : 'First version'}</h3>
          <ol aria-labelledby="changes" className="changes mono">
            {compactChanges(changes).map((c, i) => c === 'gap'
              ? <li key={i} className="gap">…</li>
              : (
                <li key={i} data-change={c.kind}>
                  <span aria-hidden="true">{MARK[c.kind]} </span>
                  {c.kind === 'added' ? <ins>{c.text}</ins> : c.kind === 'removed' ? <del>{c.text}</del> : c.text}
                </li>
              ))}
          </ol>
        </div>
      </main>
    </>
  );
}
