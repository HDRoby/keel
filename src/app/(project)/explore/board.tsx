'use client';
// Explore (mockup 2 and 2b, REQ-001, task R10): the template's sections as fields, with the assistant's comment on
// top of each. No send buttons: a review of all sections runs when the user leaves a changed section, after a
// pause following a meaningful change, on Enter in a reply line, and once on opening if something changed.
// One review at a time, at most one every interval; typing cancels the review in flight.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Comment, COMMENT_LABEL, type CommentKind } from '@/components/ui/Comment';
import { fieldStyles } from '@/components/ui/Field';
import { LinkButton } from '@/components/ui/LinkButton';
import { ListRow, ListRows } from '@/components/ui/ListRows';
import { Notice } from '@/components/ui/Notice';
import { ProgressLine } from '@/components/ui/ProgressLine';
import { SectionField } from '@/components/ui/SectionField';
import { StatusLine } from '@/components/ui/StatusLine';
import { Tag } from '@/components/ui/Tag';
import css from './board.module.css';
import { draftIntentAction, saveChangeRequestAction } from '../actions';
import type { SectionAction } from '@/lib/brainstorm/session';
import { meaningfulChange, snapshot, waitBeforeReview } from '@/lib/brainstorm/scheduler';
import type { ExploreView, SectionView } from '@/lib/brainstorm/view';

type Row = NonNullable<SectionView['rows']>[number];

const KIND: Record<string, CommentKind> = { challenge: 'challenge', link: 'link', suggest: 'suggest', ask: 'question', ok: 'ok' };



interface Props {
  initial: ExploreView;
  timing: { pauseSeconds: number; intervalSeconds: number };
  approved: boolean;          // the intent is approved: edits are saved as a change request
  drafted: boolean;           // intent.md exists (draft)
  header: { title: string; meta: ReactNode; description?: ReactNode };
  children?: ReactNode;       // between the header and the board: the stage bar
  before?: ReactNode;         // above the board, in its column: notices
  after?: ReactNode;          // under the board: the model line
}

const counts = (s: SectionView) => (s.rows ? s.rows.some((r) => r.origin !== 'suggested' && r.text.trim()) : s.origin !== 'suggested' && s.value.trim() !== '');

export function ExploreBoard({ initial, timing, approved, drafted, header, children, before, after }: Props) {
  const [view, setView] = useState<ExploreView>(initial);
  const [focus, setFocus] = useState<string | undefined>();
  const [status, setStatus] = useState<'idle' | 'reviewing'>('idle');
  const [error, setError] = useState<string | undefined>();
  const [seen, setSeen] = useState<Record<string, string | undefined>>(() => Object.fromEntries(initial.sections.map((s) => [s.key, s.commentAt])));
  const [replies, setReplies] = useState<Record<string, string>>({});

  // Refs keep the scheduler's state across renders without re-running effects.
  const viewRef = useRef(view);
  const dirty = useRef(new Set<string>());          // sections edited locally and not saved yet
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const pending = useRef(false);
  const lastStart = useRef<number | undefined>(undefined);
  const reviewedSnapshot = useRef<string | undefined>(undefined);
  const textAtReview = useRef<Record<string, string>>({});
  const focusValue = useRef<string | undefined>(undefined);
  const runRef = useRef<((reply?: { key: string; text: string }) => Promise<void>) | undefined>(undefined);

  useEffect(() => { viewRef.current = view; }, [view]);

  /** Takes the server's view, keeping text the user changed locally since the request was sent. */
  const merge = useCallback((next: ExploreView) => {
    // A section's first comment is not "new": the tag marks comments that changed after the user saw one.
    setSeen((before) => ({ ...Object.fromEntries(next.sections.map((s) => [s.key, s.commentAt])), ...Object.fromEntries(Object.entries(before).filter(([, v]) => v !== undefined)) }));
    setView((current) => ({
      ...next,
      sections: next.sections.map((s) => {
        if (!dirty.current.has(s.key)) return s;
        const mine = current.sections.find((c) => c.key === s.key);
        return mine ? { ...s, value: mine.value, rows: mine.rows, origin: mine.origin } : s;
      }),
    }));
  }, []);

  const post = useCallback(async (body: unknown, signal?: AbortSignal) => {
    const response = await fetch('/api/explore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = (await response.json().catch(() => ({}))) as { view?: ExploreView; error?: string; skipped?: boolean; reviewed?: boolean; aborted?: boolean };
    if (data.error) setError(data.error);
    else if (response.ok) setError(undefined);
    if (data.view) merge(data.view);
    return data;
  }, [merge]);

  /** Saves the sections edited locally. */
  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (dirty.current.size === 0) return;
    const keys = [...dirty.current];
    const edits = viewRef.current.sections.filter((s) => keys.includes(s.key))
      .map((s) => (s.rows ? { key: s.key, rows: s.rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), text: r.text, origin: r.origin })) } : { key: s.key, value: s.value }));
    keys.forEach((k) => dirty.current.delete(k));
    await post({ op: 'save', edits });
  }, [post]);

  const runReview = useCallback(async (reply?: { key: string; text: string }) => {
    if (!reply && snapshot(viewRef.current.sections) === reviewedSnapshot.current) return;
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    const wait = reply ? 0 : waitBeforeReview(Date.now(), lastStart.current, timing.intervalSeconds);
    if (wait > 0) {
      clearTimeout(waitTimer.current);
      waitTimer.current = setTimeout(() => void runRef.current?.(), wait);
      return;
    }
    await save();
    const controller = new AbortController();
    inFlight.current = controller;
    lastStart.current = Date.now();
    const sent = snapshot(viewRef.current.sections);
    setStatus('reviewing');
    try {
      const result = await post(reply ? { op: 'reply', ...reply } : { op: 'review' }, controller.signal);
      if (result.reviewed || result.skipped) {
        reviewedSnapshot.current = sent;
        textAtReview.current = Object.fromEntries(viewRef.current.sections.map((s) => [s.key, s.value]));
      }
    } catch {
      // Cancelled because the user typed again: the next pause or leave asks again.
    } finally {
      inFlight.current = undefined;
      setStatus('idle');
      if (pending.current) {
        pending.current = false;
        void runRef.current?.();
      }
    }
  }, [post, save, timing.intervalSeconds]);
  useEffect(() => { runRef.current = runReview; }, [runReview]);

  // Once on opening: the server reviews only if something changed since the last review.
  useEffect(() => {
    const opening = setTimeout(() => void runRef.current?.(), 0);
    return () => { clearTimeout(opening); inFlight.current?.abort(); clearTimeout(saveTimer.current); clearTimeout(pauseTimer.current); clearTimeout(waitTimer.current); };
  }, []);

  /** A local edit: saved shortly after, reviewed after a pause if the change is meaningful. Cancels a review in flight. */
  const edit = (key: string, change: Partial<SectionView>) => {
    dirty.current.add(key);
    setView((v) => ({ ...v, sections: v.sections.map((s) => (s.key === key ? { ...s, ...change } : s)) }));
    inFlight.current?.abort();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 400);
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      const section = viewRef.current.sections.find((s) => s.key === key);
      if (!section) return;
      const changed = section.rows ? true : meaningfulChange(textAtReview.current[key] ?? '', section.value);
      if (changed) void runReview();
    }, timing.pauseSeconds * 1000);
  };

  const enter = (key: string) => {
    setFocus(key);
    setSeen((s) => ({ ...s, [key]: viewRef.current.sections.find((x) => x.key === key)?.commentAt }));
    focusValue.current = JSON.stringify(viewRef.current.sections.find((s) => s.key === key));
  };

  /** Leaving a section whose text changed: save and review all sections once. */
  const leave = (key: string) => {
    const now = JSON.stringify(viewRef.current.sections.find((s) => s.key === key));
    if (focusValue.current !== undefined && now !== focusValue.current) {
      clearTimeout(pauseTimer.current);
      void runReview();
    }
    focusValue.current = undefined;
  };

  const act = async (action: SectionAction) => {
    await save();
    await post({ op: 'action', action });
    void runReview();
  };

  const reply = async (key: string) => {
    const text = (replies[key] ?? '').trim();
    if (!text) return;
    setReplies((r) => ({ ...r, [key]: '' }));
    inFlight.current?.abort();
    await runReview({ key, text });
  };

  const setRows = (key: string, rows: Row[]) => edit(key, { rows });
  const canDraft = view.sections.filter((s) => s.required).every(counts);
  const filled = view.sections.filter((s) => s.required && counts(s)).length;
  const required = view.sections.filter((s) => s.required).length;
  // The stage bar is rendered on the server: refresh it once the server has saved a change in what is filled.
  const router = useRouter();
  const lastFilled = useRef(view.filled);
  useEffect(() => {
    if (lastFilled.current === view.filled) return;
    lastFilled.current = view.filled;
    router.refresh();
  }, [view.filled, router]);
  const newComments = view.sections.filter((s) => s.key !== focus && s.commentAt && s.commentAt !== seen[s.key]).length;
  const when = view.reviewedAt ? new Date(view.reviewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;

  const draftButton = approved ? (
    <form action={async () => { await save(); await saveChangeRequestAction(); }}>
      <Button type="submit" variant="primary" icon={<Icon name="forum" size={18} />}>Save as change request</Button>
    </form>
  ) : (
    <form action={async () => { await save(); await draftIntentAction(); }}>
      <Button type="submit" variant="primary" disabled={!canDraft} icon={<Icon name="description" size={18} />}>{drafted ? 'Draft intent.md again' : 'Draft intent.md'}</Button>
    </form>
  );

  return (
    <>
      {/* The primary action sits in the page header (docs/ui-guide.md › Page header). */}
      <PageHeader {...header} setupLink actions={draftButton} />
      {children}
      <div className={css.column}>
      {before}
      <Card label="Your idea" padding="long">
        <div className={css.board}>
          <div className={css.head}>
            <div className={css.lead}>
              <h2 className={css.title}>Your idea, section by section</h2>
              <p className={css.muted}>Write in any order. When you leave a section or pause for a few seconds, the assistant reads the whole list and comments on each section, linking sections where they affect each other. Reply under a comment and press Enter.</p>
            </div>
            <ProgressLine value={filled} total={required} label={`${filled} of ${required} required filled`}
              note={canDraft ? (approved ? 'Save your edits as a change request' : 'You can draft the intent now') : 'Fill in the required sections to draft the intent'} />
          </div>
          <StatusLine label="Review status" tone={status === 'reviewing' ? 'busy' : when ? 'ok' : 'muted'}
            legend={<><span className={css.key} data-kind="challenge">Challenge</span><span className={css.key} data-kind="link">Links sections</span><span className={css.key} data-kind="suggest">Suggestion</span><span className={css.key} data-kind="ok">Looks good</span></>}>
            {status === 'reviewing' ? 'Reviewing all sections…'
              : when ? `Assistant reviewed all sections at ${when}${newComments ? ` · ${newComments} new comment${newComments === 1 ? '' : 's'} on other sections` : ''}`
              : 'Not reviewed yet'}
          </StatusLine>
          {error && <Notice kind="danger" title="The assistant could not review">{error}</Notice>}

          {view.sections.map((s) => {
            const focused = focus === s.key;
            const fresh = !focused && s.commentAt && s.commentAt !== seen[s.key];
            const comment = s.comment && !s.comment.dismissed ? s.comment : undefined;
            const kind = comment ? KIND[comment.kind] ?? 'suggest' : undefined;
            const overline = comment ? `${COMMENT_LABEL[kind ?? 'suggest']}${comment.linkTo ? ` · ${comment.linkTo}` : ''}` : '';
            return (
              <div key={s.key} className={css.section}
                // Only typing fields open the section: a button press must not move the layout under the pointer.
                onFocus={(e) => { if (!focused && (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) enter(s.key); }}
                // Leaving reviews, but the section stays open until another one is typed in: collapsing it here would move
                // the page under the pointer and lose the click that caused the blur.
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leave(s.key); }}>
                <SectionField label={s.key} filled={counts(s)} required={s.required} active={focused}
                  extra={fresh ? <Tag tone="link">New comment</Tag> : undefined}
                  comment={comment && kind ? (
                    <Comment kind={kind} label={`Comment on ${s.key}`} overline={overline}
                      collapsed={focused ? undefined : <><span className={css.preview}>{comment.text}</span><LinkButton onClick={() => enter(s.key)}>Show</LinkButton></>}
                      proposed={comment.rewrite !== undefined && !comment.applied ? <><span className={css.small}>Offered text</span><blockquote className={css.quote}>{comment.rewrite}</blockquote></> : undefined}
                      proposedActions={<><LinkButton onClick={() => void act({ op: 'apply', key: s.key })}>Apply</LinkButton><LinkButton tone="muted" onClick={() => void act({ op: 'dismiss', key: s.key })}>Dismiss</LinkButton></>}
                      thread={s.thread.length > 0 ? (
                        <ol className={css.thread} aria-label={`Thread on ${s.key}`}>
                          {s.thread.map((t, i) => (
                            <li key={i} className={t.from === 'user' ? css.mine : css.theirs}>
                              <p className={css.flat}>{t.text}</p>
                              {t.rewrite !== undefined && !t.applied && <LinkButton onClick={() => void act({ op: 'apply', key: s.key, thread: i })}>Apply</LinkButton>}
                              {t.applied && <p className={css.applied}>Applied. You can still edit it below.</p>}
                            </li>
                          ))}
                        </ol>
                      ) : undefined}
                      reply={<input aria-label={`Reply on ${s.key}`} placeholder="Reply to the assistant and press Enter" value={replies[s.key] ?? ''}
                        onChange={(e) => setReplies((r) => ({ ...r, [s.key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void reply(s.key); } }} />}
                      actions={comment.applied || (comment.addRow && !comment.applied) ? (
                        <>
                          {comment.applied && <span className={css.applied}>Applied. You can still edit it below.</span>}
                          {comment.addRow && !comment.applied && <><span>{comment.addRow}</span><Button small variant="secondary" onClick={() => void act({ op: 'add-row', key: s.key })}>Add as requirement</Button></>}
                        </>
                      ) : undefined}>
                      {comment.text}
                    </Comment>
                  ) : undefined}>
                  {s.rows ? (
                    <RowsEditor section={s} onChange={(rows) => setRows(s.key, rows)}
                      onAccept={(row) => void act({ op: 'accept', key: s.key, row })} onClear={(row) => void act({ op: 'clear', key: s.key, row })} />
                  ) : (
                    <>
                      <textarea aria-label={s.key} rows={3} value={s.value} placeholder={s.guidance}
                        className={s.origin === 'suggested' ? `suggested ${fieldStyles.suggested}` : undefined} onChange={(e) => edit(s.key, { value: e.target.value, origin: 'user' })} />
                      {s.origin === 'suggested' && s.value && (
                        <div className={css.suggestion}>
                          <span>Suggested by the assistant. It counts once you accept it.</span>
                          <LinkButton onClick={() => void act({ op: 'accept', key: s.key })}>Accept</LinkButton>
                          <LinkButton tone="muted" onClick={() => void act({ op: 'clear', key: s.key })}>Clear</LinkButton>
                        </div>
                      )}
                    </>
                  )}
                </SectionField>
              </div>
            );
          })}
          <p className={css.note}>The assistant never rewrites your text on its own. It fills only empty sections, as suggestions you accept or clear, and offers rewrites you can apply. Draft intent.md puts these sections into the template as they are, with no model call.</p>
        </div>
      </Card>
      {after}
      </div>
    </>
  );
}

function RowsEditor({ section, onChange, onAccept, onClear }: { section: SectionView; onChange: (rows: Row[]) => void; onAccept: (row: number) => void; onClear: (row: number) => void }) {
  const rows = section.rows ?? [];
  const set = (i: number, text: string) => onChange(rows.map((r, j) => (j === i ? { ...r, text, origin: 'user' } : r)));
  const up = (i: number) => onChange(rows.map((r, j) => (j === i - 1 ? rows[i] as Row : j === i ? rows[i - 1] as Row : r)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const withIds = rows.filter((r) => r.id).length;
  return (
    <ListRows label={`${section.key} rows`}
      add={<div className={css.suggestion}><LinkButton onClick={() => onChange([...rows, { text: '', origin: 'user' }])}>+ Add requirement</LinkButton>
        <span>{withIds ? `${withIds} with IDs from the last draft. New rows get the next IDs when you draft. IDs are never reused.` : 'IDs are given when you draft the intent.'}</span></div>}>
      {rows.map((r, i) => (
        <ListRow key={r.id ?? `row-${i}`} label={`Row ${i + 1}`} id={r.id ?? (r.origin === 'suggested' ? 'suggested' : 'new')} pending={!r.id}
          actions={r.origin === 'suggested' ? (
            <><LinkButton onClick={() => onAccept(i)}>Accept</LinkButton><LinkButton tone="muted" onClick={() => onClear(i)}>Clear</LinkButton></>
          ) : (
            <>
              <Button variant="text" small aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => up(i)}><Icon name="arrow_upward" size={18} /></Button>
              <Button variant="text" small aria-label={`Remove row ${i + 1}`} onClick={() => remove(i)}><Icon name="close" size={18} /></Button>
            </>
          )}>
          <input aria-label={`${section.key} row ${i + 1}`} value={r.text} className={r.origin === 'suggested' ? `suggested ${fieldStyles.suggested}` : undefined} onChange={(e) => set(i, e.target.value)} />
        </ListRow>
      ))}
    </ListRows>
  );
}
