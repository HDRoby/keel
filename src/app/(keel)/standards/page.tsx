// Standards (mock source Standards.dc.html): the conventions and guidelines in .keel/standards, chosen per project
// (REQ-012). Read-only here; editing standards on this screen is on the roadmap.
import { LibraryLayout } from '@/components/LibraryLayout';
import { Markdown } from '@/components/Markdown';
import { Card } from '@/components/ui/Card';
import { MetaGrid } from '@/components/ui/MetaGrid';
import { Tag } from '@/components/ui/Tag';
import { listStandards } from '@/lib/standards/library';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised, readProject } from '@/lib/store/workspace';
import css from '../library.module.css';

export const dynamic = 'force-dynamic';

export default async function StandardsPage({ searchParams }: { searchParams: Promise<{ error?: string; s?: string }> }) {
  const { error, s: selected } = await searchParams;
  const { root } = serverStore();
  const project = readProject(root);
  const chosen = project.ok ? project.value.standards : [];
  const standards = listStandards(root);
  const shown = standards.find((x) => x.ref === selected) ?? standards[0];
  return (
    <LibraryLayout screen="Standards" title="Standards" meta=".keel/standards" error={error} initialised={isInitialised(root)} what="standards"
      description={<>Conventions and guidelines the spec, plan and code are checked against. Stored in <code>.keel/standards</code>. Choose them for this project in Project setup; they go into the handoff as skills.</>}
      groups={[{ label: 'Standards', items: standards.map((x) => ({
        href: `/standards?s=${encodeURIComponent(x.ref)}`, label: `${x.name} v${x.version}`, title: x.name, tag: `${x.owner || 'No owner'} · v${x.version}`,
        meta: chosen.includes(x.ref) ? 'Used by this project' : x.description, current: x.ref === shown?.ref,
      })) }]}>
      {shown ? (
        <Card title={`${shown.name} v${shown.version}`} meta={shown.description} label={`${shown.name} v${shown.version}`}
          actions={chosen.includes(shown.ref) ? <Tag tone="ok">Used by this project</Tag> : <Tag>Not used</Tag>}>
          <div className={css.stack}>
          <MetaGrid items={[{ key: 'Owner', value: shown.owner || '—' }, { key: 'Version', value: String(shown.version) }, { key: 'Applies to', value: shown.appliesTo.join(', ') || 'nothing yet' }, { key: 'File', value: `.keel/standards/${shown.ref}.md`, mono: true }]} />
          <Markdown text={shown.rules} />
          </div>
        </Card>
      ) : <Card label="No standards"><p>No standards in the library.</p></Card>}
    </LibraryLayout>
  );
}
