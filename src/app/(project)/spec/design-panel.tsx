// The Spec's Design tab (mockup: Spec › Design, REQ-013, task R12): a card per decision topic with the options the
// assistant proposed (summary, pro, con, requirements served, fit line, Recommended), your own option, the reason,
// Decide, and Change for a decided topic. The Approach is assembled from the choices.
import Link from 'next/link';
import { decideAction } from './design-actions';
import { Markdown } from '@/components/Markdown';
import { chosenOption, readDesign, type Fit } from '@/lib/decisions/design';
import { approachSection } from '@/lib/decisions/records';

const FIT: Record<Fit['kind'], { label: string; tone: string }> = {
  follows: { label: 'Follows', tone: 'applied' }, breaks: { label: 'Breaks', tone: 'rejected' },
  conflicts: { label: 'Conflicts', tone: 'rejected' }, 'adds-concern': { label: 'Adds a concern', tone: 'waiting' },
};

function FitLine({ fit }: { fit?: Fit }) {
  return fit ? <p className="small tight"><span className={`pill ${FIT[fit.kind].tone}`}>{FIT[fit.kind].label}</span> {fit.text}</p> : null;
}

export function DesignPanel({ root, change, approved }: { root: string; change?: string; approved: boolean }) {
  const design = readDesign(root);
  if (design.topics.length === 0) return null;
  const decided = design.topics.filter((t) => chosenOption(t)).length;
  return (
    <section className="card" aria-labelledby="design-title" id="design">
      <h2 id="design-title" className="tight">Design</h2>
      <p role="status" aria-label="Design progress" className={decided === design.topics.length ? 'muted' : 'warn-text'}>
        {decided} of {design.topics.length} topics decided. The plan needs every topic decided.
      </p>
      {approved && <p className="notice">The spec is approved: a changed decision becomes a change request{design.pending ? <> (<Link href={`/changes/${design.pending.change}`}>{design.pending.change}</Link>, waiting for approval)</> : ''}, and a new record supersedes the old one.</p>}
      {design.topics.map((t) => {
        const chosen = chosenOption(t);
        const editing = !chosen || change === t.id;
        return (
          <section key={t.id} id={t.id} aria-label={t.title} className="req-group">
            <div className="row spread">
              <h3 className="tight">{t.title}</h3>
              <span className={`pill ${chosen ? 'applied' : 'waiting'}`}>{chosen ? 'Decided' : 'Not decided'}</span>
            </div>
            {t.guidance && <p className="muted small tight">{t.guidance}</p>}
            {t.reasonAdded && <p className="muted small tight">Added by the assistant: {t.reasonAdded}</p>}
            {t.comment && <p className="notice small">{t.comment}</p>}
            {!editing && chosen ? (
              <div className="scenario">
                <p className="tight"><strong>{chosen.name}</strong>{chosen.summary ? ` · ${chosen.summary}` : ''}</p>
                <FitLine fit={chosen.fit} />
                {t.reason && <p className="small tight">Reason: {t.reason}</p>}
                <p className="small row">{t.record && <code>{t.record}</code>}<Link href={`/spec?tab=design&change=${t.id}#${t.id}`}>Change</Link></p>
              </div>
            ) : (
              <form action={decideAction} aria-label={`Decide ${t.title}`} className="stack">
                <input type="hidden" name="topic" value={t.id} />
                {t.options.length === 0 && <p className="muted small">No options were proposed (no model answered). Write your own below.</p>}
                <fieldset className="bare stack" aria-label={`Options for ${t.title}`}>
                  {t.options.map((o) => (
                    <label key={o.id} className="option-row" aria-label={o.name}>
                      <input type="radio" name="chosen" value={o.id} defaultChecked={t.chosen ? t.chosen === o.id : o.recommended} />
                      <span>
                        <strong>{o.name}</strong>{o.recommended && <span className="pill ready"> Recommended</span>}
                        <span className="small muted block">{o.summary}</span>
                        <span className="small block">Pro: {o.pro} · Con: {o.con}{o.serves.length ? ` · Serves ${o.serves.join(', ')}` : ''}</span>
                        <FitLine fit={o.fit} />
                        {o.recommended && o.reason && <span className="small muted block">Recommended because: {o.reason}</span>}
                      </span>
                    </label>
                  ))}
                  <label className="option-row">
                    <input type="radio" name="chosen" value="own" defaultChecked={t.chosen === 'own' || t.options.length === 0} />
                    <span className="stack grow">
                      <span>Your own option</span>
                      <input name="own" aria-label={`Your own option for ${t.title}`} defaultValue={t.own?.name ?? ''} placeholder="Not in the list" />
                      <input name="ownSummary" aria-label={`Summary of your option for ${t.title}`} defaultValue={t.own?.summary ?? ''} placeholder="One line: what it is" />
                    </span>
                  </label>
                </fieldset>
                <label>Reason <textarea name="reason" rows={2} defaultValue={t.reason ?? ''} /></label>
                <div className="row">
                  <button type="submit" className="primary">Decide</button>
                  {chosen && <Link href={`/spec?tab=design#${t.id}`}>Cancel</Link>}
                </div>
              </form>
            )}
          </section>
        );
      })}
      <h3>Approach</h3>
      <Markdown text={approachSection(design.topics)} />
    </section>
  );
}
