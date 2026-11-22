// One brainstorm style (mock source Styles.dc.html): its versions and editing (REQ-011). Saving creates a new version.
import { notFound } from 'next/navigation';
import { saveStyleAction } from '../actions';
import { styleGroups } from '../groups';
import { LibraryLayout } from '@/components/LibraryLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Tag } from '@/components/ui/Tag';
import { parseStyle, readStyleFile, styleVersions } from '@/lib/brainstorm/styles';
import { NAME } from '@/lib/skill-files';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';
import css from '../../library.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; error?: string }>;
}

export default async function StylePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v, error } = await searchParams;
  const home = serverStore().root;
  const versions = NAME.test(id) ? styleVersions(home, id) : [];
  const latest = versions.at(-1);
  const version = v && versions.includes(Number(v)) ? Number(v) : latest;
  const file = version === undefined ? undefined : readStyleFile(home, `${id}@${version}`);
  const style = file?.ok ? parseStyle(file.value) : undefined;
  if (!file?.ok || !style?.ok || latest === undefined) notFound();

  return (
    <LibraryLayout screen="Brainstorm style" title={`${style.value.name} v${version}`} meta="Brainstorm styles · .keel/styles" error={error}
      initialised={isInitialised(home)} what="brainstorm styles" groups={styleGroups(home, id)} description={style.value.description}>
      <Card title={`${style.value.name} v${version}`} meta="New brainstorms use the latest version. A brainstorm already started keeps its version until it is changed in Project setup."
        actions={versions.length > 1 ? <Segmented label="Versions" items={versions.map((n) => ({ href: `/styles/${id}?v=${n}`, label: `v${n}`, current: n === version }))} /> : <Tag>v{version}</Tag>}>
        <form action={saveStyleAction} className={css.stack}>
          <input type="hidden" name="id" value={id} />
          <label htmlFor="content" className={css.muted}>Content of v{version}. Saving creates v{latest + 1}.</label>
          <textarea id="content" name="content" defaultValue={file.value} rows={24} className={css.source} />
          <div><Button type="submit" variant="primary">Save as new version</Button></div>
        </form>
      </Card>
    </LibraryLayout>
  );
}
