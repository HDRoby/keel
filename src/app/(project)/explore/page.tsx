// Explore (mockup 2 and 2b, REQ-001, REQ-011, task R10): the intent template's sections with a comment from the
// assistant on top of each. No chat: the board asks for reviews when the user leaves a section or pauses.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExploreBoard } from './board';
import css from './explore.module.css';
import { Icon } from '@/components/Icons';
import { Notice } from '@/components/ui/Notice';
import { StageBar } from '@/components/ui/StageBar';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { loadContext, templateLabel } from '@/lib/brainstorm/session';
import { exploreView } from '@/lib/brainstorm/view';
import { PROVIDERS } from '@/lib/providers/types';
import { exploreTiming } from '@/lib/settings/settings';
import { effectiveChoice, modelAvailability } from '@/lib/providers/local';
import { ModelUnavailable } from '@/components/ModelUnavailable';
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
  const model = await effectiveChoice(store, 'brainstorm');
  const available = await modelAvailability(store, 'brainstorm');
  const timing = exploreTiming(store);
  const pending = state.changeRequest ? readChange(store.root, state.changeRequest) : undefined;

  return (
    <>
      <Topbar title="Explore" />
      <main className="content">
        <ExploreBoard initial={exploreView(context.value)} timing={timing} approved={approved} drafted={intent.ok}
          header={{ title: state.title, meta: <>{project.id} · created {project.created}</>, description: state.idea || undefined }}
          before={<>
            <ErrorAlert error={error} />
            {intent.ok && !approved && (
              <Notice kind="success" role="status" title={`intent.md drafted: ${intent.value.header.id} v${intent.value.header.version}, status ${intent.value.header.status}.`}>
                Review and approve it on the <Link href="/intent">Intent</Link> stage. Drafting again replaces the draft.
              </Notice>
            )}
            {intent.ok && approved && <p role="status" className={css.hidden}>intent.md drafted: {intent.value.header.id} v{intent.value.header.version}, status {intent.value.header.status}.</p>}
            {saved && <Notice kind="success" role="status" title={`Saved as change request ${saved}.`}>intent.md stays as approved.</Notice>}
            {approved && intent.ok && (
              <Notice kind="info" role="region" label="Intent approved" title={`Intent v${intent.value.header.version} is approved`}>
                <p>You can still edit the sections. Your changes are saved as a change request, so the spec and plan see what changed by requirement ID.</p>
                <p><Link href="/intent">Open intent.md</Link>{pending && <> · Waiting for approval: <Link href={`/changes/${pending.id}`}>{pending.id}</Link></>}</p>
              </Notice>
            )}
            {!available.ok && <ModelUnavailable what="The assistant's section comments" reason={available.reason} />}
            <p className={css.meta}>Template: {templateLabel(state.template)} · Style: {style.name} v{style.version}</p>
          </>}
          after={<p className={css.meta}>
            <Icon name="tune" size={16} /> Using {PROVIDERS.find((p) => p.id === model.provider)?.label ?? model.provider} · {model.model || 'no model yet'} · reviews when you leave a section or pause for {timing.pauseSeconds} seconds · <Link href="/settings">Change in Settings</Link>
          </p>}>
          <StageBar gates={gates} current="explore" summaries={summaries} />
        </ExploreBoard>
      </main>
    </>
  );
}
