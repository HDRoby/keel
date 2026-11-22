// Version history of a document: each version's reason, its line changes and its impact by requirement (REQ-008).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/Shell';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from '@/components/ui/Tag';
import css from './versions.module.css';
import { kindFromPath } from '@/lib/store/documents';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import { buildTrace } from '@/lib/trace/index';
import { bodyAt, compactChanges, documentVersions, lineChanges } from '@/lib/versions/diff';
import { versionImpact } from '@/lib/versions/impact';

export const dynamic = 'force-dynamic';

const MARK = { added: '+', removed: '−', same: ' ' } as const;

interface Props {
  searchParams: Promise<{ doc?: string; v?: string }>;
}

export default async function VersionsPage({ searchParams }: Props) {
  const { doc = 'docs/intent.md', v } = await searchParams;
  if (!kindFromPath(doc)) notFound();
  const { root: home } = serverStore();
  const project = readProject(home);
  if (!project.ok) notFound();
  const dir = home;
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
      <Topbar title="Versions" />
      <main className="content">
        <PageHeader title={`Versions of ${doc}`} meta={`${project.value.title} · ${project.value.id}`} description="Each version with its reason, its line changes and what it affects by requirement ID." />
        <div className={css.columns}>
          <Card title="Versions" className={css.versions}>
            <nav aria-label="Versions">
              <ol className={css.versionList}>
                {[...versions].reverse().map((x) => (
                  <li key={x.version}>
                    <Link href={`/versions?doc=${encodeURIComponent(doc)}&v=${x.version}`} aria-label={`v${x.version}`}
                      aria-current={x.version === selected.version ? 'page' : undefined} className={x.version === selected.version ? `${css.version} ${css.current}` : css.version}>
                      <span className={css.versionHead}><strong>Version {x.version}{x.version === versions.at(-1)?.version ? ' · current' : ''}</strong><span className={css.date}>{x.date}</span></span>
                      <span className={css.reason}>{x.reason}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </Card>

          <div className={css.detail}>
            <Card title={`Version ${selected.version}${previous ? `, compared with version ${previous.version}` : ''}`}>
              <div className={css.stack}>
                <p role="status" className={css.flat}>Reason: {selected.reason}</p>
                <h3 id="changes" className={css.subtitle}>{previous ? 'Changes' : 'First version'}</h3>
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
            </Card>

            {impact && (
              <Card title={<span id="impact">Impact</span>} meta="Worked out from requirement IDs">
                {impact.requirements.length === 0 ? <p className={css.flat}>No requirement is affected.</p> : (
                  <ul aria-labelledby="impact" className={css.impact}>
                    <li><span className={css.label}>Requirements</span><span className={css.tags}>{impact.requirements.map((r) => <Tag key={r} tone="outline">{r}</Tag>)}</span></li>
                    {impact.impact.tasks.map((t) => <li key={t.id}>Task {t.id} · {t.title} ({t.requirements.join(', ')})</li>)}
                    {impact.impact.scenarios.map((sc) => <li key={sc.label}>Scenario {sc.label} ({sc.requirements.join(', ')})</li>)}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
