// The Spec's Acceptance scenarios (mockup: Spec › Acceptance scenarios, REQ-004, task R11): every requirement with
// its scenarios, "No scenario yet" where it has none, edit and add, suggestions to accept or clear, and the Gherkin
// view. The plan needs at least one accepted scenario per requirement (REQ-005).
import Link from 'next/link';
import { ScenarioEditor } from './scenario-editor';
import { acceptAllSuggestionsAction, acceptSuggestionAction, clearSuggestionAction, deleteScenarioAction, suggestFailureAction } from './scenario-actions';
import { warnings, type Step } from '@/lib/scenarios/gherkin';
import { coverage, gherkinView, pendingChange } from '@/lib/scenarios/store';

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="plain-list steps">
      {steps.map((s, i) => <li key={i}><strong>{s.keyword}</strong> {s.text}</li>)}
    </ol>
  );
}

export function ScenariosPanel({ root, tab, edit, add, approved }: { root: string; tab: 'scenarios' | 'gherkin'; edit?: string; add?: string; approved: boolean }) {
  const groups = coverage(root);
  const covered = groups.filter((g) => g.accepted.length > 0).length;
  const suggestedCount = groups.reduce((n, g) => n + g.suggested.length, 0);
  const pending = pendingChange(root);
  return (
    <section className="card" aria-labelledby="scenarios-title" id="scenarios">
      <div className="row spread">
        <h2 id="scenarios-title" className="tight">Acceptance scenarios</h2>
        <nav className="filters" aria-label="Scenario views">
          <Link href="/spec?tab=scenarios#scenarios" aria-current={tab === 'scenarios' ? 'page' : undefined}>By requirement</Link>
          <Link href="/spec?tab=gherkin#scenarios" aria-current={tab === 'gherkin' ? 'page' : undefined}>Gherkin</Link>
        </nav>
      </div>
      <p role="status" aria-label="Scenario coverage" className={covered === groups.length ? 'muted' : 'warn-text'}>
        {covered} of {groups.length} requirement{groups.length === 1 ? '' : 's'} {groups.length === 1 ? 'has' : 'have'} a scenario. Every requirement needs at least one; add more for failure and edge cases.
      </p>
      {approved && <p className="notice">The spec is approved: scenario edits are saved as a change request{pending ? <> (<Link href={`/changes/${pending.change}`}>{pending.change}</Link>, waiting for approval)</> : ''}.</p>}
      {tab === 'scenarios' && suggestedCount > 0 && (
        <form action={acceptAllSuggestionsAction} className="row"><button type="submit">Accept all {suggestedCount} suggestions</button><span className="muted small">Suggestions count once accepted.</span></form>
      )}

      {tab === 'gherkin' ? (
        gherkinView(root).map((f) => (
          <div key={f.file} className="space-above">
            <p className="tight"><code>{f.file}</code>{f.held && <span className="pill waiting"> In change request {pending?.change}</span>}</p>
            <pre className="code" aria-label={`Gherkin of ${f.file}`}>{f.text}</pre>
          </div>
        ))
      ) : groups.map((g) => (
        <section key={g.id} id={g.id} aria-label={g.id} className="req-group">
          <div className="row spread">
            <h3 className="tight"><code>{g.id}</code> {g.statement}</h3>
            <span className={`pill ${g.accepted.length ? 'applied' : 'waiting'}`}>{g.accepted.length ? `${g.accepted.length} scenario${g.accepted.length === 1 ? '' : 's'}` : 'No scenario yet'}</span>
          </div>
          {g.accepted.map((s) => (
            <article key={s.id} className="scenario" aria-label={s.name}>
              {edit === s.id ? <ScenarioEditor req={g.id} id={s.id} name={s.name} steps={s.steps} /> : (
                <>
                  <div className="row spread">
                    <strong>{s.name}</strong>
                    <span className="row small">
                      <Link href={`/spec?tab=scenarios&edit=${encodeURIComponent(s.id)}#${g.id}`}>Edit</Link>
                      <form action={deleteScenarioAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="req" value={g.id} /><button type="submit" className="link">Delete</button></form>
                    </span>
                  </div>
                  <p className="muted small tight">{s.file} · {s.tags.join(' ')}</p>
                  <Steps steps={s.steps} />
                  {warnings(s).length > 0 && <p className="muted small" role="note">{warnings(s).join(' ')}</p>}
                </>
              )}
            </article>
          ))}
          {g.suggested.map((s) => (
            <article key={s.id} className="scenario suggested" aria-label={`Suggested: ${s.name}`}>
              <div className="row spread">
                <em>{s.name}</em>
                <span className="row small">
                  <span className="muted">{s.kind === 'failure' ? 'Suggested failure case' : 'Suggested'}</span>
                  <form action={acceptSuggestionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="req" value={g.id} /><button type="submit">Accept</button></form>
                  <form action={clearSuggestionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="req" value={g.id} /><button type="submit" className="link">Clear</button></form>
                </span>
              </div>
              <Steps steps={s.steps} />
            </article>
          ))}
          {add === g.id ? <ScenarioEditor req={g.id} name="" steps={[]} /> : (
            <div className="row small">
              <Link href={`/spec?tab=scenarios&add=${g.id}#${g.id}`}>+ Add scenario</Link>
              <form action={suggestFailureAction}><input type="hidden" name="req" value={g.id} /><button type="submit" className="link">Suggest a failure case</button></form>
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
