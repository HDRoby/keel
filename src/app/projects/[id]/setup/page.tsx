// Project setup: change the intent template or brainstorm style chosen on Start (REQ-001, REQ-011).
import { notFound } from 'next/navigation';
import { setupAction } from '../../actions';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { StandardsPicker } from '@/components/StandardsPicker';
import { readSession } from '@/lib/brainstorm/session';
import { listStyles } from '@/lib/brainstorm/styles';
import { listStandards } from '@/lib/standards/library';
import { serverStore } from '@/lib/store/server-store';
import { readProject, SLUG } from '@/lib/store/workspace';
import { templateOptions } from '@/lib/templates/library';

export const dynamic = 'force-dynamic';

export default async function SetupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!SLUG.test(id)) notFound();
  const store = serverStore();
  const session = readSession(store, id);
  if (!session.ok) notFound();
  const project = readProject(id, store.home);
  const chosen = project.ok ? project.value.standards : [];
  return (
    <>
      <Topbar crumb={id} title="Project setup" />
      <main className="content">
        <PageHead title="Project setup" />
        <div className="card">
          <ErrorAlert error={error} />
          <form action={setupAction} className="stack">
            <input type="hidden" name="slug" value={id} />
            <label>Intent template <select name="template" defaultValue={session.value.template}>
              {templateOptions(store.home, 'intent', 'all').map((t) => <option key={t.ref} value={t.ref}>{t.name}</option>)}
            </select></label>
            <label>Brainstorm style <select name="style" defaultValue={session.value.brainstorm_style}>
              {listStyles(store.home).map((s) => <option key={s.ref} value={s.ref}>{s.name}</option>)}
            </select></label>
            <StandardsPicker standards={listStandards(store.home)} chosen={chosen} />
            <button type="submit">Save</button>
          </form>
        </div>
      </main>
    </>
  );
}
