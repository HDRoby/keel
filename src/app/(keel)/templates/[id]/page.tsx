// One template: its versions, the documents in this folder that use it, editing and removal (REQ-003).
import { serverStore } from '@/lib/store/server-store';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { removeTemplateAction, saveTemplateAction } from '../actions';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { listTemplates, readTemplate, templateName, templateUsage } from '@/lib/templates/library';

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
    <>
      <Topbar title="Template" />
      <main className="content">
        <h1>{templateName(id, shown)}</h1>
        <div className="card">
          <ErrorAlert error={error} />
          <p className="row">
            Versions:
            {summary.versions.map((n) => (
              <Link key={n} href={`/templates/${id}?v=${n}`} aria-current={n === shown ? 'page' : undefined}>v{n}</Link>
            ))}
          </p>

          <h2 id="used-by">Used by</h2>
          {inUse ? (
            <ul aria-labelledby="used-by">
              {uses.map((u) => <li key={u}>{u}</li>)}
            </ul>
          ) : (
            <p>No document in this folder uses this template.</p>
          )}

          <form action={removeTemplateAction}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" disabled={inUse} aria-describedby="remove-note">Remove</button>
            <p id="remove-note">
              {inUse
                ? `This template cannot be removed while this project uses it (${uses.length} document${uses.length === 1 ? '' : 's'}).`
                : 'Removing deletes every version of this template.'}
            </p>
          </form>
          {summary.versions.length > 1 && (
            <form action={removeTemplateAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={shown} />
              <button type="submit" disabled={versionInUse}>Remove v{shown}</button>
              <p>{versionInUse ? `v${shown} is in use and cannot be removed.` : `Removes only v${shown}; the other versions stay.`}</p>
            </form>
          )}

          <h2>Edit</h2>
          <form action={saveTemplateAction}>
            <input type="hidden" name="id" value={id} />
            <label htmlFor="content">Content of v{shown}. Saving creates v{summary.latest + 1}.</label>
            <textarea id="content" name="content" defaultValue={template.value.content} rows={24} className="mono" />
            <button type="submit">Save as new version</button>
          </form>
        </div>
      </main>
    </>
  );
}
