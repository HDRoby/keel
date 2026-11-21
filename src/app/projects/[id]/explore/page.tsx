// Explore (mockup: explore.png): the brainstorm chat and the idea summary by template section (REQ-001, REQ-011).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chat } from './chat';
import { addToSectionAction, draftIntentAction } from '../../actions';
import { CheckCircle, Open, Pencil, Question } from '@/components/Icons';
import { StageBar } from '@/components/StageBar';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { isCaptured, requiredCaptured } from '@/lib/brainstorm/sections';
import { intentUpdate, loadContext, pendingQuestion, templateLabel } from '@/lib/brainstorm/session';
import { PROVIDERS } from '@/lib/providers/types';
import { modelChoice } from '@/lib/settings/settings';
import { readDocument } from '@/lib/store/documents';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

export default async function ExplorePage({ params, searchParams }: StageProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const { store, project, gates, summaries } = await loadStage(id, 'explore');
  const context = loadContext(store, id);
  if (!context.ok && context.error === 'not-found') notFound();
  if (!context.ok) {
    return (
      <>
        <Topbar crumb={`${project.title} · ${project.id}`} title="Explore" />
        <main className="content"><ErrorAlert error={`The brainstorm could not be read: ${context.message}`} /></main>
      </>
    );
  }
  const { session, sections, style } = context.value;
  const intent = readDocument(store, id, 'docs/intent.md');
  const ready = requiredCaptured(sections, session.answers);
  const update = intentUpdate(store, context.value);
  const newAnswers = update.ok ? update.value.sections : [];
  const model = modelChoice(store, 'brainstorm');
  const required = sections.filter((s) => s.required);
  const capturedCount = sections.filter((s) => isCaptured(session.answers, s.heading)).length;

  const action = !intent.ok ? (
    <form action={draftIntentAction}>
      <input type="hidden" name="slug" value={id} />
      <input type="hidden" name="mode" value="draft" />
      <button type="submit" className="primary" disabled={!ready}>Draft intent.md</button>
    </form>
  ) : intent.value.header.status === 'draft' && newAnswers.length > 0 ? (
    <form action={draftIntentAction}>
      <input type="hidden" name="slug" value={id} />
      <input type="hidden" name="mode" value="update" />
      <button type="submit" className="primary">Update intent.md</button>
    </form>
  ) : (
    <Link href={`/projects/${id}/intent`} className="button primary">Open intent.md</Link>
  );

  return (
    <>
      <Topbar crumb={`${project.title} · ${project.id}`} title="Explore" />
      <main className="content">
        <PageHead title={session.title}
          meta={<>{project.id} · created {project.created} · <Link href={`/projects/${id}/setup`}><Pencil /> Project setup</Link></>}
          description={session.idea || undefined} actions={action} />
        <StageBar slug={id} gates={gates} current="explore" summaries={summaries} />
        <ErrorAlert error={error} />
        <p className="muted">Template: {templateLabel(session.template)} · Style: {style.name} v{style.version}</p>

        <section className="card" aria-labelledby="brainstorm-title">
          <h2 id="brainstorm-title" className="tight">Brainstorm</h2>
          <p className="muted">
            {intent.ok
              ? <span role="status">intent.md drafted: {intent.value.header.id} v{intent.value.header.version}, status {intent.value.header.status}.</span>
              : ready ? 'All required sections are captured. You can draft the intent now.' : 'Intent unlocks when every required section is captured.'}
            {intent.ok && intent.value.header.status !== 'draft' && ' New answers no longer change it.'}
            {intent.ok && intent.value.header.status === 'draft' && newAnswers.length > 0 && ` New answers for ${newAnswers.join(', ')} are not in intent.md yet.`}
          </p>
          {session.current || session.transcript.length > 0 ? (
            <Chat slug={id} transcript={session.transcript.map(({ role, text }) => ({ role, text }))}
              asking={session.current?.section} pending={Boolean(pendingQuestion(session))} />
          ) : null}
          {!session.current && <p className="muted">Every section has an answer.</p>}
        </section>
        <p className="muted">
          Using {PROVIDERS.find((p) => p.id === model.provider)?.label ?? model.provider} · {model.model} · <Link href="/settings">Change in Settings</Link>
        </p>

        <section className="card" aria-labelledby="summary">
          <h2 id="summary" className="tight">Idea summary</h2>
          <p className="muted">Sections from {templateLabel(session.template)} · {capturedCount} of {sections.length} captured ({required.length} required)</p>
          <ul aria-labelledby="summary" className="plain-list">
            {sections.map((s) => {
              const captured = isCaptured(session.answers, s.heading);
              return (
                <li key={s.heading} className="row top">
                  {captured ? <CheckCircle /> : s.required ? <Open /> : <Question />}
                  <div>
                    <span className="visually-hidden">{captured ? 'captured: ' : 'missing: '}</span>
                    <strong>{s.heading}</strong>{s.required ? '' : <span className="muted"> (optional)</span>}
                    <div className="prose">{captured ? (session.answers[s.heading] ?? []).join('\n') : <span className="muted">{s.guidance || 'Not answered yet.'}</span>}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <details className="space-above">
            <summary>Add to a section</summary>
            <form action={addToSectionAction} aria-label="Add to a section" className="stack space-above">
              <input type="hidden" name="slug" value={id} />
              <label>Section <select name="section" defaultValue="Requirements">
                {sections.map((s) => <option key={s.heading} value={s.heading}>{s.heading}</option>)}
              </select></label>
              <label>Text <textarea name="text" rows={3} required /></label>
              <div><button type="submit">Add</button></div>
            </form>
          </details>
        </section>
      </main>
    </>
  );
}
