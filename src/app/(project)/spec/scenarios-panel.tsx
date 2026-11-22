// The Spec's Acceptance scenarios (mock source Spec.dc.html › Acceptance scenarios, REQ-004, task R11): every
// requirement with its scenarios, "No scenario yet" where it has none, edit and add, suggestions to accept or clear,
// and the Gherkin view. The plan needs at least one accepted scenario per requirement (REQ-005).
import Link from 'next/link';
import { ScenarioEditor } from './scenario-editor';
import { acceptAllSuggestionsAction, acceptSuggestionAction, clearSuggestionAction, deleteScenarioAction, suggestFailureAction } from './scenario-actions';
import css from './spec.module.css';
import { Button } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { ScenarioCard } from '@/components/ui/ScenarioCard';
import { Segmented } from '@/components/ui/Segmented';
import { StatusLine } from '@/components/ui/StatusLine';
import { Tag } from '@/components/ui/Tag';
import { warnings } from '@/lib/scenarios/gherkin';
import { coverage, gherkinView, pendingChange } from '@/lib/scenarios/store';

const hidden = (fields: Record<string, string>) => Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

export function ScenariosPanel({ root, tab, edit, add, approved }: { root: string; tab: 'scenarios' | 'gherkin'; edit?: string; add?: string; approved: boolean }) {
  const groups = coverage(root);
  const covered = groups.filter((g) => g.accepted.length > 0).length;
  const suggestedCount = groups.reduce((n, g) => n + g.suggested.length, 0);
  const pending = pendingChange(root);
  return (
    <section aria-labelledby="scenarios-title" id="scenarios" className={css.panel}>
      <div className={css.groupHead}>
        <h2 id="scenarios-title" className={css.panelTitle}>Acceptance scenarios</h2>
        <Segmented label="Scenario views" items={[
          { href: '/spec?tab=scenarios#scenarios', label: 'Preview', current: tab === 'scenarios' },
          { href: '/spec?tab=gherkin#scenarios', label: 'Gherkin', current: tab === 'gherkin' },
        ]} />
      </div>
      <StatusLine label="Scenario coverage" tone={covered === groups.length ? 'ok' : 'warn'}>
        {covered} of {groups.length} requirement{groups.length === 1 ? '' : 's'} {groups.length === 1 ? 'has' : 'have'} a scenario. Every requirement needs at least one; add more for failure and edge cases.
      </StatusLine>
      {approved && (
        <Notice kind="info" title="The spec is approved">
          Scenario edits are saved as a change request{pending ? <> (<Link href={`/changes/${pending.change}`}>{pending.change}</Link>, waiting for approval)</> : ''}.
        </Notice>
      )}
      {tab === 'scenarios' && suggestedCount > 0 && (
        <form action={acceptAllSuggestionsAction} className={css.row}><Button type="submit" variant="secondary">Accept all {suggestedCount} suggestions</Button><span className={css.muted}>Suggestions count once accepted.</span></form>
      )}

      {tab === 'gherkin' ? (
        gherkinView(root).map((f) => (
          <div key={f.file} className={css.stack}>
            <p className={css.row}><code>{f.file}</code>{f.held && <Tag tone="warn">In change request {pending?.change}</Tag>}</p>
            <CodeBlock label={`Gherkin of ${f.file}`}>{f.text}</CodeBlock>
          </div>
        ))
      ) : groups.map((g) => (
        <section key={g.id} id={g.id} aria-label={g.id} className={css.group}>
          <div className={css.groupHead}>
            <h3 className={css.groupTitle}><span className={css.req}>{g.id}</span> {g.statement}</h3>
            <span data-count>{g.accepted.length ? <Tag tone="ok">{`${g.accepted.length} scenario${g.accepted.length === 1 ? '' : 's'}`}</Tag> : <Tag tone="danger">No scenario yet</Tag>}</span>
          </div>
          {g.accepted.map((s) => (edit === s.id ? (
            <ScenarioCard key={s.id} label={s.name} name="Edit scenario"><ScenarioEditor req={g.id} id={s.id} name={s.name} steps={s.steps} /></ScenarioCard>
          ) : (
            <ScenarioCard key={s.id} label={s.name} name={s.name} steps={s.steps}
              actions={<>
                <LinkButton href={`/spec?tab=scenarios&edit=${encodeURIComponent(s.id)}#${g.id}`}>Edit</LinkButton>
                <form action={deleteScenarioAction} className={css.inline}>{hidden({ id: s.id, req: g.id })}<LinkButton type="submit" tone="danger">Delete</LinkButton></form>
              </>}>
              <p className={css.file}>{s.file} · {s.tags.join(' ')}</p>
              {warnings(s).length > 0 && <p className={css.muted} role="note">{warnings(s).join(' ')}</p>}
            </ScenarioCard>
          )))}
          {g.suggested.map((s) => (
            <ScenarioCard key={s.id} suggested label={`Suggested: ${s.name}`} name={s.name} steps={s.steps}
              tag={<Tag tone="accent">{s.kind === 'failure' ? 'Suggested failure case' : 'Suggested'}</Tag>}
              actions={<>
                <form action={acceptSuggestionAction} className={css.inline}>{hidden({ id: s.id, req: g.id })}<LinkButton type="submit">Accept</LinkButton></form>
                <form action={clearSuggestionAction} className={css.inline}>{hidden({ id: s.id, req: g.id })}<LinkButton type="submit" tone="muted">Clear</LinkButton></form>
              </>} />
          ))}
          {add === g.id ? <ScenarioCard name="New scenario"><ScenarioEditor req={g.id} name="" steps={[]} /></ScenarioCard> : (
            <div className={css.row}>
              <LinkButton href={`/spec?tab=scenarios&add=${g.id}#${g.id}`}>+ Add scenario</LinkButton>
              <form action={suggestFailureAction} className={css.inline}>{hidden({ req: g.id })}<LinkButton type="submit">Suggest a failure case</LinkButton></form>
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
