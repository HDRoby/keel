// Spec stage (mockup: spec.png): the spec, its approval, mock references, and the Go, Park or No-go decision (REQ-005).
import { decisionAction, generateSpecAction } from '../actions';
import { Conflicts } from '@/components/Conflicts';
import { DocumentReview } from '@/components/DocumentReview';
import { MockReferences } from '@/components/MockReferences';
import { RegenerateForm } from '@/components/RegenerateForm';
import { StageLayout } from '@/components/ui/StageBar';
import { SubmitButton } from '@/components/SubmitButton';
import { DECISION_TITLE, decisionsOf } from '@/lib/gates/approvals';
import { conflictsOf } from '@/lib/generate/resolve';
import { listMocks } from '@/lib/mocks/references';
import { readDocument } from '@/lib/store/documents';
import { templateOptions } from '@/lib/templates/library';
import { requirementIds } from '@/lib/trace/index';
import { loadStage, type StageProps } from '../stage';
import { ScenariosPanel } from './scenarios-panel';
import { DesignPanel } from './design-panel';

export const dynamic = 'force-dynamic';

export default async function SpecPage({ searchParams }: StageProps) {
  const { error, notice, tab, edit, add, change } = await (searchParams as Promise<{ error?: string; notice?: string; tab?: string; edit?: string; add?: string; change?: string }>);
  const page = await loadStage('spec');
  const { store, reviewer } = page;
  const spec = readDocument(store, 'docs/spec.md');
  const dir = store.root;
  const decisions = decisionsOf(dir);

  const decision = (
    <section className="card" aria-labelledby="decision">
      <h2 id="decision">Decision</h2>
      <p className="muted">{decisions.length === 0 ? 'No decision yet.' : `Latest decision: ${decisions.at(-1)}.`} The plan needs a Go decision.</p>
      <form action={decisionAction} aria-label="Decision" className="stack">
        <fieldset>
          <legend>Go, Park or No-go</legend>
          {Object.entries(DECISION_TITLE).map(([value, label]) => (
            <label key={value}><input type="radio" name="decision" value={value} defaultChecked={value === 'go'} /> {label}</label>
          ))}
        </fieldset>
        <label>Your name <input name="by" defaultValue={reviewer} required /></label>
        <label>Reason <textarea name="reason" rows={2} required /></label>
        <label>Consequences <textarea name="consequences" rows={2} /></label>
        <div><button type="submit" className="primary">Record decision</button></div>
      </form>
    </section>
  );

  return (
    <StageLayout page={page} error={error} meta={spec.ok ? `${page.project.id} · spec.md · ${spec.value.header.id}` : undefined}>
      {notice && <p role="status" className="notice">{notice}</p>}
      {spec.ok ? (
        <>
        <DocumentReview home={store.root} document="spec" doc={spec.value} reviewer={reviewer}
          before={<Conflicts document="spec" conflicts={conflictsOf(spec.value)} />}
          after={spec.value.header.status === 'draft'
            ? <RegenerateForm document="spec">Regenerating writes the spec again from the current intent and standards.</RegenerateForm>
            : undefined}
          aside={<>{decision}<MockReferences document="spec" references={listMocks(dir)} requirements={requirementIds(dir)} /></>} />
        <DesignPanel root={dir} change={change} approved={spec.value.header.status === 'approved'} />
        <ScenariosPanel root={dir} tab={tab === 'gherkin' ? 'gherkin' : 'scenarios'} edit={edit} add={add} approved={spec.value.header.status === 'approved'} />
        </>
      ) : (
        <div className="columns">
          <form action={generateSpecAction} aria-label="Generate spec" className="card stack">
            <h2>Generate spec</h2>
            <p className="muted">Keel fills a spec template from the approved intent: the requirements and scenario tags come from the intent, the model writes the other sections.</p>
            <label>Spec template <select name="template">
              {templateOptions(store.root, 'spec', 'latest').map((t) => <option key={t.ref} value={t.ref}>{t.name}</option>)}
            </select></label>
            <div><SubmitButton primary label="Generate spec" busyLabel="Generating spec…" /></div>
          </form>
          <div>{decision}</div>
        </div>
      )}
    </StageLayout>
  );
}
