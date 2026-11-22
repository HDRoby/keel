// UI gallery (CR-0008, task R13): every component in src/components/ui in every state, with sample data from the
// mock sources, to compare side by side with docs/ui/components.html. Development only.
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icons';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Comment, Thread, ThreadItem } from '@/components/ui/Comment';
import { DataTable } from '@/components/ui/DataTable';
import { Field, fieldStyles } from '@/components/ui/Field';
import { FileTree } from '@/components/ui/FileTree';
import { LinkButton } from '@/components/ui/LinkButton';
import { ListRow, ListRows } from '@/components/ui/ListRows';
import { MetaGrid } from '@/components/ui/MetaGrid';
import { Notice } from '@/components/ui/Notice';
import { OptionCard, OptionGrid } from '@/components/ui/OptionCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressLine } from '@/components/ui/ProgressLine';
import { ScenarioCard, StepRow } from '@/components/ui/ScenarioCard';
import { SectionField } from '@/components/ui/SectionField';
import { Segmented } from '@/components/ui/Segmented';
import { StageBar } from '@/components/ui/StageBar';
import { StatusLine } from '@/components/ui/StatusLine';
import { Tabs } from '@/components/ui/Tabs';
import { Hint, Tag } from '@/components/ui/Tag';
import type { StageSummary } from '@/lib/gates/approvals';
import type { StageGate } from '@/lib/gates/rules';
import type { Stage } from '@/lib/documents/types';
import styles from './gallery.module.css';

export const metadata = { title: 'UI gallery · Keel' };

const GATES: StageGate[] = [
  { stage: 'explore', label: 'Explore', available: true },
  { stage: 'intent', label: 'Intent', available: true },
  { stage: 'spec', label: 'Spec', available: true },
  { stage: 'plan', label: 'Plan', available: true },
  { stage: 'handoff', label: 'Handoff', available: false, reason: 'Needs an approved plan' },
];
const SUMMARIES = {
  explore: { done: true, detail: 'Drafted intent v1' },
  intent: { done: true, detail: 'Approved v2' },
  spec: { done: false, detail: 'Draft v3 · 3 of 5 decided' },
  plan: { done: false, detail: 'Draft v1', outOfDate: ['CR-0004'] },
  handoff: { done: false, detail: '' },
} as Record<Stage, StageSummary>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card title={title}><div className={styles.stack}>{children}</div></Card>;
}

export default function Gallery() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className={styles.page}>
      <PageHeader title="UI gallery" meta="src/components/ui · compare with docs/ui/components.html" setupLink
        description="Every component in every state, with sample data from the mock sources."
        actions={<><Button>Outline</Button><Button variant="primary">Primary</Button></>} />

      <Section title="StageBar">
        <StageBar gates={GATES} current="spec" summaries={SUMMARIES} />
      </Section>

      <Section title="Button">
        <div className={styles.row}>
          <Button variant="primary">Primary</Button><Button>Outline</Button><Button variant="secondary">Secondary</Button><Button variant="text">Text</Button>
          <Button variant="primary" disabled>Draft intent.md</Button><Button disabled>Disabled</Button>
        </div>
        <div className={styles.row}>
          <Button variant="primary" danger>Delete</Button><Button danger>Delete scenario</Button><Button variant="text" danger>Remove</Button>
          <Button variant="primary" small>Small</Button><Button small>Small outline</Button>
          <Button variant="primary" icon={<Icon name="folder" size={18} />}>With icon</Button><ButtonLink href="/dev/ui">Link as button</ButtonLink>
        </div>
      </Section>

      <Section title="LinkButton">
        <div className={styles.row}><LinkButton>Apply</LinkButton><LinkButton>Accept</LinkButton><LinkButton tone="muted">Clear</LinkButton><LinkButton tone="muted">Dismiss</LinkButton><LinkButton tone="danger">Delete</LinkButton><LinkButton href="/dev/ui">Edit</LinkButton><LinkButton disabled>Disabled</LinkButton></div>
      </Section>

      <Section title="Tag">
        <div className={styles.row}>
          <Hint>Required</Hint><Hint>Optional</Hint>
          <Tag tone="accent">Suggested</Tag><Tag>Yours</Tag><Tag tone="outline">REQ-005</Tag><Tag tone="link">New</Tag><Tag tone="accent">Edited</Tag>
          <Tag tone="ok">Decided · ADR-0007</Tag><Tag tone="warn">To decide</Tag><Tag tone="warn">Conflict</Tag><Tag tone="ok">Written</Tag>
          <Tag tone="danger">No scenario yet</Tag><Tag tone="ok">Now</Tag><Tag tone="accent">As you approve</Tag><Tag tone="handoff">At handoff</Tag>
        </div>
      </Section>

      <Section title="Notice">
        <Notice kind="info" title="Intent v2 is approved">The spec can be generated from it.</Notice>
        <Notice kind="success" title="Written">12 files written to the folder in one commit.</Notice>
        <Notice kind="warning" title="Not a git repository yet">Keel runs git init when you initialise.</Notice>
        <Notice kind="danger" title="Two conflicts" actions={<Button small>Resolve</Button>}>Resolve them before approving.</Notice>
      </Section>

      <Section title="StatusLine and ProgressLine">
        <StatusLine tone="ok" label="Review status" legend={<><span>● Challenge</span><span>● Links sections</span><span>● Suggestion</span></>}>Assistant reviewed all sections · 2 comments</StatusLine>
        <StatusLine tone="busy">Reviewing Problem…</StatusLine>
        <StatusLine tone="warn">2 of 3 requirements have a scenario</StatusLine>
        <div className={styles.row}>
          <ProgressLine value={3} total={4} label="3 of 4 required filled" note="Fill Desired outcome to draft intent.md" />
          <ProgressLine value={4} total={4} label="4 of 4 required filled" note="Ready to draft" />
        </div>
      </Section>

      <Section title="Field">
        <div className={styles.grid2}>
          <Field label="Title" required hint="Shown in the side menu"><input defaultValue="Keel" /></Field>
          <Field label="Description" optional><input placeholder="One line about the project" /></Field>
          <Field label="Desired outcome" required suggestion={<><LinkButton>Accept</LinkButton> · <LinkButton tone="muted">Clear</LinkButton></>}>
            <input className={fieldStyles.suggested} defaultValue="Anyone runs a project in five minutes." />
          </Field>
          <Field label="Folder" error="Not a folder"><input defaultValue="/nowhere" /></Field>
          <Field label="Spec template"><select defaultValue="b"><option value="a">Short spec v1</option><option value="b">Requirements and design spec v3</option></select></Field>
          <Field label="Disabled"><input disabled defaultValue="Read only" /></Field>
        </div>
      </Section>

      <Section title="SectionField and Comment">
        <SectionField label="Problem" filled required extra={<Tag tone="link">New comment</Tag>}
          comment={<Comment kind="challenge" proposed="Newcomers spend a day finding how to run a repository." proposedActions={<><LinkButton>Apply</LinkButton><LinkButton tone="muted">Dismiss</LinkButton></>}
            thread={<Thread><ThreadItem from="assistant">Who loses the day: the newcomer or the team?</ThreadItem><ThreadItem from="user">Both.</ThreadItem></Thread>}
            reply={<input aria-label="Reply" placeholder="Reply to the assistant and press Enter" />}>Is this a problem for <strong>Who it is for</strong> or for everyone?</Comment>}>
          <textarea rows={2} defaultValue="Newcomers cannot find how to run a project." />
        </SectionField>
        <SectionField label="Who it is for" required missing extra="Reviewing…">
          <textarea rows={2} />
        </SectionField>
        <SectionField label="Constraints" active comment={<Comment kind="link" overline="Links sections · Problem">Matches <strong>Problem</strong>.</Comment>}>
          <textarea rows={2} defaultValue="Runs offline." />
        </SectionField>
        <Comment kind="suggest">Add a measure: <strong>five minutes</strong>.</Comment>
        <Comment kind="question">Does this include monorepos?</Comment>
        <Comment kind="ok" collapsed={<><span>Clear and specific.</span><LinkButton>Show</LinkButton></>} />
      </Section>

      <Section title="OptionCard">
        <OptionGrid label="Intent template">
          <OptionCard control={<input type="radio" name="t" defaultChecked />} title="Standard intent v4" tag="Default" summary="Problem, who it is for, outcome, requirements." />
          <OptionCard control={<input type="radio" name="t" />} title="Light intent v1" summary="Three questions." />
          <OptionCard control={<input type="checkbox" defaultChecked />} title="Security baseline v2" foot="Security team" />
        </OptionGrid>
        <OptionGrid label="Storage">
          <OptionCard control={<input type="radio" name="s" defaultChecked />} title="Markdown in git with a SQLite index" recommended summary="Documents as files; an index for search." pro="Readable without the tool" con="Two places to keep in step" fit={{ good: true, text: 'Follows Plain markdown v1' }} serves={['REQ-002', 'REQ-008']} />
          <OptionCard control={<input type="radio" name="s" />} title="Postgres" summary="A database server." pro="Scales to many users" con="A server to run" fit={{ good: false, text: 'Breaks Local-first: needs a server' }} />
        </OptionGrid>
      </Section>

      <Section title="ListRows">
        <ListRows label="Requirements" add={<LinkButton>+ Add requirement</LinkButton>}>
          <ListRow id="REQ-001" actions={<><Button variant="text" small aria-label="Move up"><Icon name="arrow_upward" size={18} /></Button><Button variant="text" small aria-label="Remove"><Icon name="close" size={18} /></Button></>}><input defaultValue="Show the run command" /></ListRow>
          <ListRow id="new" pending><input defaultValue="Export the log as CSV" /></ListRow>
          <ListRow id="suggested" pending><input className={fieldStyles.suggested} defaultValue="Work offline" /></ListRow>
        </ListRows>
      </Section>

      <Section title="ScenarioCard">
        <ScenarioCard name="Record an expense works" tag={<Tag>Yours</Tag>} actions={<LinkButton href="/dev/ui">Edit</LinkButton>} steps={[{ keyword: 'Given', text: 'an expense' }, { keyword: 'When', text: 'I record it' }, { keyword: 'Then', text: 'it is in the list' }]} />
        <ScenarioCard suggested name="Suggested: An expense without an amount is refused" tag={<Tag tone="accent">Suggested</Tag>} actions={<><LinkButton>Accept</LinkButton><LinkButton tone="muted">Clear</LinkButton></>} steps={[{ keyword: 'Given', text: 'an expense with no amount' }, { keyword: 'Then', text: 'I am asked for it' }]} />
        <ScenarioCard name={<input defaultValue="Edit mode" aria-label="Scenario" />}>
          <StepRow><select defaultValue="Given"><option>Given</option><option>When</option><option>Then</option></select><input defaultValue="an expense" /><Button variant="text" small aria-label="Remove step"><Icon name="close" size={18} /></Button></StepRow>
          <div className={styles.row}><LinkButton>+ Add step</LinkButton><LinkButton tone="danger">Delete scenario</LinkButton><Button variant="primary" small>Done</Button></div>
        </ScenarioCard>
      </Section>

      <Section title="Tabs and Segmented">
        <Tabs label="Spec" items={[{ href: '/dev/ui', label: 'Requirements', count: 5, current: true }, { href: '/dev/ui?t=d', label: 'Design', count: 2 }, { href: '/dev/ui?t=s', label: 'Acceptance scenarios' }]} />
        <div className={styles.row}>
          <Segmented label="View" items={[{ href: '/dev/ui', label: 'Rendered', current: true }, { href: '/dev/ui?v=md', label: 'Markdown' }]} />
          <Segmented label="Scenarios" items={[{ href: '/dev/ui', label: 'Preview' }, { href: '/dev/ui?v=g', label: 'Gherkin', current: true }]} />
        </div>
      </Section>

      <Section title="FileTree">
        <FileTree label="What Keel creates" legend={['plain', 'dependent', 'ignored']} rows={[
          { path: '.keel/', name: '.keel/', what: 'Keel\'s config and libraries', when: <Tag tone="ok">Now</Tag>, open: true, children: [
            { path: '.keel/config.yml', name: 'config.yml', what: 'Project config', when: <Tag tone="ok">Now</Tag> },
            { path: '.keel/mocks/', name: 'mocks/', what: 'Mock references', when: <Tag tone="accent">As you approve</Tag>, kind: 'dependent', children: [{ path: '.keel/mocks/references.md', name: 'references.md', what: 'The list', kind: 'dependent', when: <Tag tone="accent">As you approve</Tag> }] },
            { path: '.keel/cache/', name: 'cache/', what: 'Index, ignored by git', when: <Tag tone="ok">Now</Tag>, kind: 'ignored', children: [{ path: '.keel/cache/index.db', name: 'index.db', what: 'Search index', kind: 'ignored', when: <Tag tone="ok">Now</Tag> }] },
          ] },
          { path: 'AGENTS.md', name: 'AGENTS.md', what: 'Instructions for coding agents', when: <Tag tone="handoff">At handoff</Tag> },
        ]} />
        <FileTree label="Handoff" columns={['Path', 'What it is for', 'State']} legend={['new', 'changed', 'conflict', 'kept']} rows={[
          { path: 'AGENTS.md', name: 'AGENTS.md', what: 'Agent instructions', when: 'Conflict', kind: 'conflict' },
          { path: 'docs/plan.md', name: 'docs/plan.md', what: 'The plan', when: 'Changed', kind: 'changed' },
          { path: 'tasks/T1.md', name: 'tasks/T1.md', what: 'First task', when: 'New', kind: 'new' },
          { path: 'package.json', name: 'package.json', what: 'Yours', when: 'Kept', kind: 'kept' },
        ]} />
      </Section>

      <Section title="CodeBlock, DataTable and MetaGrid">
        <CodeBlock label="Markdown source">{'---\nid: INT-0001\nversion: 2\n---\n\n# Intent: Keel\n\n## Problem\n\nNewcomers cannot find how to run a project.'}</CodeBlock>
        <CodeBlock terminal>{'$ npx keel\nKeel 0.1 · /Users/ada/readme-helper\nOpen http://127.0.0.1:3000'}</CodeBlock>
        <DataTable label="Requirements" columns={['ID', 'Requirement', 'Source']} rows={[
          { key: '1', cells: [<code key="i">REQ-001</code>, 'Show the run command', 'Intent'] },
          { key: '2', cells: [<code key="i">REQ-002</code>, 'Export the log as CSV', 'Intent'], current: true },
        ]} />
        <MetaGrid label="Document" items={[{ key: 'ID', value: 'INT-0001', mono: true }, { key: 'Version', value: '2' }, { key: 'Status', value: <Tag tone="ok">Approved</Tag> }, { key: 'Template', value: 'standard-intent@4', mono: true }]} />
      </Section>

      <Section title="Card">
        <div className={styles.grid2}>
          <Card title="With meta and actions" meta="PRJ-0001 · intent.md" actions={<Button small>Edit</Button>}>Body text 14/20.</Card>
          <Card label="Without a title">A card with only content.</Card>
        </div>
      </Section>
    </main>
  );
}
