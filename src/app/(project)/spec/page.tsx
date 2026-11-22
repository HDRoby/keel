// Spec stage (mock source Spec.dc.html): the spec in one card with tabs (Requirements, Design, Acceptance scenarios,
// Markdown), and on the side the feasibility review, the Go, Park or No-go decision, mock references, approval and
// history (REQ-004, REQ-005, REQ-013).
import { decisionAction, generateSpecAction } from '../actions';
import { MockPanel } from './mock-panel';
import { ScenariosPanel } from './scenarios-panel';
import { DesignPanel } from './design-panel';
import css from './spec.module.css';
import { Conflicts } from '@/components/Conflicts';
import { ModelUnavailable } from '@/components/ModelUnavailable';
import { modelAvailability } from '@/lib/providers/local';
import { DocumentReview } from '@/components/DocumentReview';
import { Icon } from '@/components/Icons';
import { Markdown } from '@/components/Markdown';
import { RegenerateForm } from '@/components/RegenerateForm';
import { SubmitButton } from '@/components/SubmitButton';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { StageLayout } from '@/components/ui/StageBar';
import { chosenOption, readDesign } from '@/lib/decisions/design';
import { DECISION_TITLE, decisionsOf } from '@/lib/gates/approvals';
import { conflictsOf } from '@/lib/generate/resolve';
import { coverage } from '@/lib/scenarios/store';
import { readDocument } from '@/lib/store/documents';
import { templateOptions } from '@/lib/templates/library';
import { requirementIds } from '@/lib/trace/index';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStage, type StageProps } from '../stage';

export const dynamic = 'force-dynamic';

const sectionOf = (body: string, heading: string) => new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body)?.[1]?.trim() ?? '';

export default async function SpecPage({ searchParams }: StageProps) {
  const { error, notice, tab, edit, add, change, view } = await (searchParams as Promise<{ error?: string; notice?: string; tab?: string; edit?: string; add?: string; change?: string; view?: string }>);
  const page = await loadStage('spec');
  const { store, reviewer, gates } = page;
  const spec = readDocument(store, 'docs/spec.md');
  const dir = store.root;
  const decisions = decisionsOf(dir);
  const planOpen = gates.find((g) => g.stage === 'plan')?.available;
  const model = await modelAvailability(store, 'documents');
  const unavailable = model.ok ? undefined : model.reason;

  const decision = (
    <Card title={<span id="decision">Decision</span>} meta="Go, Park or No-go. The plan needs a Go decision.">
      <div className={css.stack}>
        <p className={css.muted}>{decisions.length === 0 ? 'No decision yet.' : `Latest decision: ${decisions.at(-1)}.`}</p>
        <form action={decisionAction} aria-label="Decision" className={css.stack}>
          <fieldset className={css.decision}>
            <legend className="visually-hidden">Go, Park or No-go</legend>
            {Object.entries(DECISION_TITLE).map(([value, label]) => (
              <label key={value}><input type="radio" name="decision" value={value} defaultChecked={value === 'go'} /> {label}</label>
            ))}
          </fieldset>
          <Field label="Your name"><input name="by" defaultValue={reviewer} required /></Field>
          <Field label="Reason"><textarea name="reason" rows={2} required /></Field>
          <Field label="Consequences" optional><textarea name="consequences" rows={2} /></Field>
          <div><SubmitButton primary label="Record decision" busyLabel="Recording…" /></div>
        </form>
      </div>
    </Card>
  );

  if (!spec.ok) {
    return (
      <StageLayout page={page} error={error}>
        <div className={css.columns}>
          <div className={css.mainColumn}>
            <Card title="Generate spec">
              <form action={generateSpecAction} aria-label="Generate spec" className={css.stack}>
                <p className={css.muted}>Keel fills a spec template from the approved intent: the requirements and scenario tags come from the intent, the model writes the other sections.</p>
                <Field label="Spec template"><select name="template">
                  {templateOptions(store.root, 'spec', 'latest').map((t) => <option key={t.ref} value={t.ref}>{t.name}</option>)}
                </select></Field>
                {unavailable && <ModelUnavailable what="Generate spec" reason={unavailable} />}
                <div><SubmitButton primary label="Generate spec" busyLabel="Generating spec…" disabled={Boolean(unavailable)} /></div>
              </form>
            </Card>
          </div>
          <div className={css.sideColumn}>{decision}</div>
        </div>
      </StageLayout>
    );
  }

  const approved = spec.value.header.status === 'approved';
  const groups = coverage(dir);
  const design = readDesign(dir);
  const undecided = design.topics.filter((t) => !chosenOption(t)).length;
  const current = tab === 'design' ? 'design' : tab === 'scenarios' || tab === 'gherkin' ? 'scenarios' : tab === 'markdown' ? 'markdown' : tab === 'mock' ? 'mock' : 'requirements';
  const feasibility = sectionOf(spec.value.body, 'Feasibility review');
  const panel = current === 'design' ? <DesignPanel root={dir} change={change} approved={approved} />
    : current === 'scenarios' ? <ScenariosPanel root={dir} tab={tab === 'gherkin' ? 'gherkin' : 'scenarios'} edit={edit} add={add} approved={approved} />
    : current === 'mock' ? <MockPanel store={store} view={view} />
    : current === 'markdown' ? <CodeBlock label="Markdown of docs/spec.md">{readFileSync(join(dir, 'docs', 'spec.md'), 'utf8')}</CodeBlock>
    : undefined;

  return (
    <StageLayout page={page} error={error}
      meta={`${page.project.id} · spec.md · ${spec.value.header.id} v${spec.value.header.version}${spec.value.header.from_intent ? ` · from ${String(spec.value.header.from_intent).replace('@', ' v')}` : ''}`}
      actions={planOpen ? <ButtonLink href="/plan" variant="primary"><Icon name="arrow_forward" size={18} /> Go to plan</ButtonLink> : undefined}>
      {notice && <Notice kind="success" role="status">{notice}</Notice>}
      <DocumentReview home={store.root} document="spec" doc={spec.value} reviewer={reviewer} panel={panel}
        tabs={[
          { href: '/spec', label: 'Requirements', count: requirementIds(dir).length, current: current === 'requirements' },
          ...(design.topics.length ? [{ href: '/spec?tab=design#design', label: 'Design', ...(undecided ? { count: undecided } : {}), current: current === 'design' }] : []),
          { href: '/spec?tab=scenarios#scenarios', label: 'Acceptance scenarios', count: groups.reduce((n, g) => n + g.accepted.length, 0), current: current === 'scenarios' },
          { href: '/spec?tab=mock#mock', label: 'Clickable mock', current: current === 'mock' },
          { href: '/spec?tab=markdown', label: 'Markdown', current: current === 'markdown' },
        ]}
        before={<Conflicts document="spec" conflicts={conflictsOf(spec.value)} />}
        after={!approved ? <RegenerateForm document="spec" unavailable={unavailable}>Regenerating writes the spec again from the current intent and standards.</RegenerateForm> : undefined}
        aside={<>
          <Card title="Feasibility review" meta="Engineering review by the assistant · you make the call">
            {feasibility ? <Markdown text={feasibility} /> : <p className={css.muted}>Not written yet.</p>}
          </Card>
          {decision}
        </>} />
    </StageLayout>
  );
}
