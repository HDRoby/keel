// The Spec's Design tab (mock source Spec.dc.html › Design, REQ-013, task R12): a card per decision topic with the
// options the assistant proposed as OptionCards (summary, advantage, drawback, fit line, requirements served,
// Recommended), your own option, the reason, Decide, and Change for a decided topic. The Approach follows the choices.
import Link from 'next/link';
import { decideAction } from './design-actions';
import css from './spec.module.css';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { OptionCard, OptionGrid } from '@/components/ui/OptionCard';
import { StatusLine } from '@/components/ui/StatusLine';
import { Tag } from '@/components/ui/Tag';
import { chosenOption, readDesign, type Fit } from '@/lib/decisions/design';
import { approachSection } from '@/lib/decisions/records';

const FIT_LABEL: Record<Fit['kind'], string> = { follows: 'Follows', breaks: 'Breaks', conflicts: 'Conflicts', 'adds-concern': 'Adds a concern' };
const fitOf = (fit?: Fit) => (fit ? { good: fit.kind === 'follows', text: fit.text.startsWith(FIT_LABEL[fit.kind]) ? fit.text : `${FIT_LABEL[fit.kind]}: ${fit.text}` } : undefined);
const recordId = (path?: string) => (path ? `ADR-${/(\d{4})-/.exec(path)?.[1] ?? ''}` : '');

export function DesignPanel({ root, change, approved }: { root: string; change?: string; approved: boolean }) {
  const design = readDesign(root);
  if (design.topics.length === 0) return <p className={css.muted}>This spec&apos;s template has no design topics.</p>;
  const decided = design.topics.filter((t) => chosenOption(t)).length;
  return (
    <section aria-labelledby="design-title" id="design" className={css.panel}>
      <h2 id="design-title" className={css.panelTitle}>Design</h2>
      <StatusLine label="Design progress" tone={decided === design.topics.length ? 'ok' : 'warn'}>
        {decided} of {design.topics.length} topics decided. The plan needs every topic decided.
      </StatusLine>
      {approved && (
        <Notice kind="info" title="The spec is approved">
          A changed decision becomes a change request{design.pending ? <> (<Link href={`/changes/${design.pending.change}`}>{design.pending.change}</Link>, waiting for approval)</> : ''}, and a new record supersedes the old one.
        </Notice>
      )}
      {design.topics.map((t) => {
        const chosen = chosenOption(t);
        const editing = !chosen || change === t.id;
        return (
          <section key={t.id} id={t.id} aria-label={t.title} className={css.topic}>
            <div className={css.topicHead}>
              <h3 className={css.topicTitle}>{t.title}</h3>
              {chosen ? <Tag tone="ok">Decided{t.record ? ` · ${recordId(t.record)}` : ''}</Tag> : <Tag tone="warn">Not decided</Tag>}
            </div>
            {t.guidance && <p className={css.muted}>{t.guidance}</p>}
            {t.reasonAdded && <p className={css.muted}>Added by the assistant: {t.reasonAdded}</p>}
            {t.comment && <Notice kind="warning">{t.comment}</Notice>}
            {!editing && chosen ? (
              <div className={css.decided}>
                <p className={css.flat}><strong>{chosen.name}</strong>{chosen.summary ? ` · ${chosen.summary}` : ''}</p>
                {chosen.fit && <p className={fitOf(chosen.fit)?.good ? css.good : css.bad}>{fitOf(chosen.fit)?.text}</p>}
                {t.reason && <p className={css.flat}>Reason: {t.reason}</p>}
                <p className={css.row}>{t.record && <code>{t.record}</code>}<LinkButton href={`/spec?tab=design&change=${t.id}#${t.id}`}>Change</LinkButton></p>
              </div>
            ) : (
              <form action={decideAction} aria-label={`Decide ${t.title}`} className={css.stack}>
                <input type="hidden" name="topic" value={t.id} />
                {t.options.length === 0 && <p className={css.muted}>No options were proposed (no model answered). Write your own below.</p>}
                <OptionGrid label={`Options for ${t.title}`} columns="three">
                  {t.options.map((o) => (
                    <OptionCard key={o.id} label={o.name} title={o.name} recommended={o.recommended} summary={o.summary} pro={o.pro} con={o.con}
                      fit={fitOf(o.fit)} serves={o.serves} foot={o.recommended && o.reason ? `Recommended because: ${o.reason}` : undefined}
                      control={<input type="radio" name="chosen" value={o.id} defaultChecked={t.chosen ? t.chosen === o.id : o.recommended} />} />
                  ))}
                  <OptionCard label="Your own option" title="Your own option" summary="Not in the list? Keel checks it against the requirements and standards."
                    control={<input type="radio" name="chosen" value="own" defaultChecked={t.chosen === 'own' || t.options.length === 0} />}>
                    <input name="own" aria-label={`Your own option for ${t.title}`} defaultValue={t.own?.name ?? ''} placeholder="Name" />
                    <input name="ownSummary" aria-label={`Summary of your option for ${t.title}`} defaultValue={t.own?.summary ?? ''} placeholder="One line: what it is" />
                  </OptionCard>
                </OptionGrid>
                <Field label="Reason" optional><textarea name="reason" rows={2} defaultValue={t.reason ?? ''} /></Field>
                <div className={css.row}>
                  <Button type="submit" variant="primary">Decide</Button>
                  {chosen && <LinkButton href={`/spec?tab=design#${t.id}`} tone="muted">Cancel</LinkButton>}
                </div>
              </form>
            )}
          </section>
        );
      })}
      <h3 className={css.topicTitle}>Approach</h3>
      <Markdown text={approachSection(design.topics)} />
    </section>
  );
}
