// One template (mock source Templates.dc.html): its versions, the documents in this folder that use it, editing and
// removal (REQ-003).
import { notFound } from 'next/navigation';
import { removeTemplateAction, saveTemplateAction } from '../actions';
import { templateGroups } from '../groups';
import { LibraryLayout } from '@/components/LibraryLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Tag } from '@/components/ui/Tag';
import { serverStore } from '@/lib/store/server-store';
import { isInitialised } from '@/lib/store/workspace';
import { listTemplates, readTemplate, templateName, templateUsage } from '@/lib/templates/library';
import css from '../../library.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; error?: string }>;
}

export default async function TemplatePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v, error } = await searchParams;
  const home = serverStore().root;
  const summary = listTemplates(home).find((t) => t.id === id);
  const version = v && /^\d+$/.test(v) ? Number(v) : undefined;
  const template = readTemplate(home, id, version);
  if (!summary || !template.ok) notFound();
  const shown = template.value.version;
  const uses = templateUsage(home, id);
  const inUse = uses.length > 0;
  const versionInUse = templateUsage(home, id, shown).length > 0;

  return (
    <LibraryLayout screen="Template" title={templateName(id, shown)} meta={`Templates · ${summary.kind} · .keel/templates`} error={error}
      initialised={isInitialised(home)} what="templates" groups={templateGroups(home, id)}
      description="Editing saves a new version; documents keep the version they were made with.">
      <Card title={templateName(id, shown)} meta={`${summary.kind} · ${summary.versions.length} version${summary.versions.length === 1 ? '' : 's'}`}
        actions={summary.versions.length > 1 ? <Segmented label="Versions" items={summary.versions.map((n) => ({ href: `/templates/${id}?v=${n}`, label: `v${n}`, current: n === shown }))} /> : <Tag>v{shown}</Tag>}>
        <div className={css.stack}>
          <h3 id="used-by" className={css.subtitle}>Used by</h3>
          {inUse ? (
            <ul aria-labelledby="used-by" className={css.list}>
              {uses.map((u) => <li key={u}><code>{u}</code></li>)}
            </ul>
          ) : <p className={css.muted}>No document in this folder uses this template.</p>}
          <div className={css.row}>
            <form action={removeTemplateAction}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" danger disabled={inUse} aria-describedby="remove-note">Remove</Button>
            </form>
            {summary.versions.length > 1 && (
              <form action={removeTemplateAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="version" value={shown} />
                <Button type="submit" danger disabled={versionInUse}>Remove v{shown}</Button>
              </form>
            )}
          </div>
          <p id="remove-note" className={css.muted}>
            {inUse
              ? `This template cannot be removed while this project uses it (${uses.length} document${uses.length === 1 ? '' : 's'}).`
              : 'Removing deletes every version of this template.'}
            {summary.versions.length > 1 && ` ${versionInUse ? `v${shown} is in use and cannot be removed.` : `Remove v${shown} removes only that version; the other versions stay.`}`}
          </p>
        </div>
      </Card>
      <Card title="Edit" meta={`Content of v${shown}. Saving creates v${summary.latest + 1}.`}>
        <form action={saveTemplateAction} className={css.stack}>
          <input type="hidden" name="id" value={id} />
          <textarea id="content" name="content" aria-label={`Content of v${shown}`} defaultValue={template.value.content} rows={24} className={css.source} />
          <div><Button type="submit" variant="primary">Save as new version</Button></div>
        </form>
      </Card>
    </LibraryLayout>
  );
}
