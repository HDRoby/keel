// One brainstorm style: its versions and editing (REQ-011). Saving creates a new version.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { saveStyleAction } from '../actions';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { parseStyle, readStyleFile, styleVersions } from '@/lib/brainstorm/styles';
import { ensureSeed } from '@/lib/seed';
import { keelHome, SLUG } from '@/lib/store/workspace';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; error?: string }>;
}

export default async function StylePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v, error } = await searchParams;
  const home = keelHome();
  ensureSeed(home);
  const versions = SLUG.test(id) ? styleVersions(home, id) : [];
  const latest = versions.at(-1);
  const version = v && versions.includes(Number(v)) ? Number(v) : latest;
  const file = version === undefined ? undefined : readStyleFile(home, `${id}@${version}`);
  const style = file?.ok ? parseStyle(file.value) : undefined;
  if (!file?.ok || !style?.ok || latest === undefined) notFound();

  return (
    <>
      <Topbar crumb="Workspace · Brainstorm styles" title="Brainstorm style" />
      <main className="content">
        <h1>{style.value.name} v{version}</h1>
        <div className="card">
          <ErrorAlert error={error} />
          <p>{style.value.description}</p>
          <p className="row">
            Versions:
            {versions.map((n) => (
              <Link key={n} href={`/styles/${id}?v=${n}`} aria-current={n === version ? 'page' : undefined}>v{n}</Link>
            ))}
          </p>
          <p>New brainstorms use the latest version. A brainstorm already started keeps its version until it is changed in Project setup.</p>
          <h2>Edit</h2>
          <form action={saveStyleAction}>
            <input type="hidden" name="id" value={id} />
            <label htmlFor="content">Content of v{version}. Saving creates v{latest + 1}.</label>
            <textarea id="content" name="content" defaultValue={file.value} rows={24} className="mono" />
            <button type="submit">Save as new version</button>
          </form>
        </div>
      </main>
    </>
  );
}
