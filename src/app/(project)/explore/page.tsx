// Explore (mockup 2 and 2b, REQ-001, REQ-011, task R10): the intent template's sections with a comment from the
// assistant on top of each. No chat: the board asks for reviews when the user leaves a section or pauses.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExploreBoard } from './board';
import { Pencil } from '@/components/Icons';
import { StageBar } from '@/components/ui/StageBar';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { loadContext, templateLabel } from '@/lib/brainstorm/session';
import { exploreView } from '@/lib/brainstorm/view';
import { PROVIDERS } from '@/lib/providers/types';
import { exploreTiming, modelChoice } from '@/lib/settings/settings';
import { readChange } from '@/lib/changes/store';
import { readDocument } from '@/lib/store/documents';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

export default async function ExplorePage({ searchParams }: StageProps) {
  const { error, saved } = await (searchParams as Promise<{ error?: string; saved?: string }>);
  const { store, project, gates, summaries } = await loadStage('explore');
  const context = loadContext(store);
  if (!context.ok && context.error === 'not-found') notFound();
  if (!context.ok) {
    return (
      <>
        <Topbar title="Explore" />
        <main className="content"><ErrorAlert error={`The brainstorm could not be read: ${context.message}`} /></main>
      </>
    );
  }
  const { state, style } = context.value;
  const intent = readDocument(store, 'docs/intent.md');
  const approved = intent.ok && intent.value.header.status === 'approved';
  const model = modelChoice(store, 'brainstorm');
  const timing = exploreTiming(store);
  const pending = state.changeRequest ? readChange(store.root, state.changeRequest) : undefined;

  return (
    <>
      <Topbar title="Explore" />
      <main className="content">
        <PageHead title={state.title}
          meta={<>{project.id} · created {project.created} · <Link href="/setup"><Pencil /> Project setup</Link></>}
          description={state.idea || undefined} />
        <StageBar gates={gates} current="explore" summaries={summaries} />
        <ErrorAlert error={error} />
        {intent.ok && (
          <p role="status" className="muted">intent.md drafted: {intent.value.header.id} v{intent.value.header.version}, status {intent.value.header.status}.</p>
        )}
        {saved && <p role="status" className="notice">Saved as change request {saved}. intent.md stays as approved.</p>}
        {approved && intent.ok && (
          <section className="card notice-card" aria-label="Intent approved">
            <h2 className="tight">Intent v{intent.value.header.version} is approved</h2>
            <p>You can still edit the sections. Your changes are saved as a change request, so the spec and plan see what changed by requirement ID.</p>
            <p className="tight"><Link href="/intent">Open intent.md</Link>{pending && <> · Waiting for approval: <Link href={`/changes/${pending.id}`}>{pending.id}</Link></>}</p>
          </section>
        )}
        <p className="muted">Template: {templateLabel(state.template)} · Style: {style.name} v{style.version}</p>
        <ExploreBoard initial={exploreView(context.value)} timing={timing} approved={approved} drafted={intent.ok} />
        <p className="muted">
          Using {PROVIDERS.find((p) => p.id === model.provider)?.label ?? model.provider} · {model.model} · reviews when you leave a section or pause for {timing.pauseSeconds} seconds · <Link href="/settings">Change in Settings</Link>
        </p>
      </main>
    </>
  );
}
