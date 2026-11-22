// Discuss a change (REQ-017, CR-0016; mock source docs/mocks/set-1/source/discuss.html): the chat, the Proposed change
// request card with Agree, Edit and Keep talking, this discussion, what the assistant can see and earlier discussions.
// Only Agree creates a change request; the model never chooses IDs.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { agreeAction, parkAction, saveEditAction } from './actions';
import { Chat, type ChatMessage, type SourceView } from './Chat';
import css from './discuss.module.css';
import { Icon } from '@/components/Icons';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from '@/components/ui/Tag';
import { listChanges, isApplied } from '@/lib/changes/store';
import { readDesign } from '@/lib/decisions/design';
import { availableSources, namedIds, type SourceId } from '@/lib/discussion/context';
import { ASSISTANT, listDiscussions, readDiscussion, type Discussion } from '@/lib/discussion/file';
import { checkProposal, extractProposal, parseProposal, proposalState, UNREADABLE, type Proposal } from '@/lib/discussion/proposal';
import { discussionModel, discussionStyle } from '@/lib/discussion/turn';
import { listReports } from '@/lib/readiness/report';
import { codeMap } from '@/lib/repo/scan';
import { listStandards } from '@/lib/standards/library';
import { readDocument } from '@/lib/store/documents';
import { serverStore } from '@/lib/store/server-store';
import { requirementStatements } from '@/lib/trace/parse';

type Params = { error?: string; agreed?: string; parked?: string; edit?: string; start?: string };

const STATUS = (d: Discussion) => (d.status === 'cr' ? (d.cr ?? 'CR') : d.status === 'parked' ? 'Parked' : 'In progress');

function sourceViews(root: string, ticked?: string[]): SourceView[] {
  const store = serverStore();
  const intent = readDocument(store, 'docs/intent.md');
  const spec = readDocument(store, 'docs/spec.md');
  const reqs = Object.keys({ ...(intent.ok ? requirementStatements(intent.value.body) : {}), ...(spec.ok ? requirementStatements(spec.value.body) : {}) }).length;
  const decisions = (existsSync(join(root, 'docs', 'decisions')) ? readdirSync(join(root, 'docs', 'decisions')).filter((f) => f.endsWith('.md')).length : 0) + readDesign(root).topics.filter((t) => t.chosen).length;
  const tasks = existsSync(join(root, 'tasks')) ? readdirSync(join(root, 'tasks')).filter((f) => /^[TR]\d+\.md$/.test(f)).length : 0;
  const open = listChanges(root).filter((c) => c.status !== 'rejected' && !isApplied(c)).length;
  const detail: Record<SourceId, string> = {
    intent: intent.ok ? `v${intent.value.header.version} · its sections` : 'not written yet', requirements: `${reqs} · full text`, decisions: `${decisions} · titles and choices`,
    plan: `${tasks} tasks · titles and status`, changes: `${open} open · titles and requirements`, codemap: `${codeMap(root).length} file and folder names`, standards: `${listStandards(root).length} · names only`,
  };
  return availableSources(root).map((s) => ({ id: s.id, label: s.label, detail: detail[s.id], on: ticked ? ticked.includes(s.id) : s.on }));
}

/** Starters: the readiness advice accepted last, and roadmap items in Next or Later. Filled in, never sent until Send. */
function starters(): { icon: string; label: string; text: string }[] {
  const store = serverStore();
  const advice = (listReports(store)[0]?.advice ?? []).filter((a) => a.choice !== 'ignore').slice(0, 2)
    .map((a) => ({ icon: 'health_and_safety', label: `From the readiness report: ${a.title}`, text: `From the AI readiness report: ${a.title}. ${a.why}` }));
  const roadmap = readDocument(store, 'docs/roadmap.md');
  const items = roadmap.ok ? (/## (?:Next|Later)\n([\s\S]*?)(?=\n## |$)/g.exec(roadmap.value.body)?.[1] ?? '').split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter((l) => l && !l.startsWith('<!--')).slice(0, 2) : [];
  return [...items.map((i) => ({ icon: 'map', label: `From the roadmap: ${i.slice(0, 60)}`, text: `From the roadmap: ${i}` })), ...advice];
}

/** An assistant message without its readable proposal block (the card shows it). */
function shown(text: string): string {
  const { block, rest } = extractProposal(text);
  return block && parseProposal(block).ok ? rest || '_A proposal is below._' : text;
}

const idTag = (id: string) => (id === 'new' ? <Tag tone="accent">new</Tag> : <Tag tone="outline">{id}</Tag>);

function ProposalCard({ d, proposal, editing }: { d: Discussion; proposal: Proposal; editing: boolean }) {
  const checks = checkProposal(serverStore(), proposal);
  const blocked = checks.some((c) => c.kind === 'error');
  if (editing) return <EditProposal d={d} proposal={proposal} />;
  return (
    <section aria-label="Proposed change request" className={css.proposal}>
      <div className={css.proposalHead}><Icon name="description" size={20} /><h2 className={css.proposalTitle}>Proposed change request</h2><Tag>IDs are given when you agree</Tag></div>
      <h3 className={css.cardTitle}>{proposal.title}</h3>
      <dl className={css.fields}>
        <dt>Why</dt><dd>{proposal.why}</dd>
        <dt>What changes</dt><dd><ul>{proposal.what.map((w) => <li key={w}>{w}</li>)}</ul></dd>
        <dt>Requirement changes</dt><dd>{proposal.requirements.length ? <ul>{proposal.requirements.map((r, i) => <li key={i}>{idTag(r.id)} {r.change === 'new' ? 'New' : r.change === 'removed' ? 'Remove' : 'Change'}: {r.text}</li>)}</ul> : 'None'}</dd>
        {proposal.impact.length > 0 && <><dt>Impact</dt><dd><ul>{proposal.impact.map((i) => <li key={i.area}>{i.area} ({i.requirements.map((r) => r).join(', ') || '—'}): {i.what}</li>)}</ul></dd></>}
        {proposal.scenarios.length > 0 && <><dt>Scenarios</dt><dd><ul>{proposal.scenarios.map((s) => <li key={s.title}>{idTag(s.requirement)} {s.title}</li>)}</ul></dd></>}
        <dt>Tasks</dt><dd><ul>{proposal.tasks.map((t) => <li key={t.title}>{idTag('new')} {t.title}{t.files.length ? <span className={css.muted}> · {t.files.join(', ')}</span> : null}</li>)}</ul></dd>
        {proposal.decision && <><dt>Decision</dt><dd>{idTag('new')} {proposal.decision.title}{proposal.decision.alternatives.length ? <span className={css.muted}> · {proposal.decision.alternatives.join('; ')}</span> : null}</dd></>}
        {proposal.dependsOn.length > 0 && <><dt>Depends on</dt><dd>{proposal.dependsOn.join(', ')}</dd></>}
        {proposal.screens.length > 0 && <><dt>Screens</dt><dd>{proposal.screens.join(', ')}</dd></>}
      </dl>
      <ul className={css.checks} aria-label="Checks">
        {checks.map((c) => <li key={c.text} data-kind={c.kind}><Icon name={c.kind === 'ok' ? 'check_circle' : c.kind === 'warn' ? 'error' : 'cancel'} size={16} /> {c.text}</li>)}
      </ul>
      <div className={css.row}>
        <form action={agreeAction}><input type="hidden" name="id" value={d.id} /><Button type="submit" variant="primary" disabled={blocked}>Agree and create the change request</Button></form>
        <ButtonLink href={`/discuss/${d.id}?edit=1`}>Edit</ButtonLink>
        <ButtonLink href={`/discuss/${d.id}#composer`} variant="text">Keep talking</ButtonLink>
      </div>
      {blocked && <p className={css.note}>Edit the proposal, or ask the assistant to change it, before you agree.</p>}
    </section>
  );
}

function EditProposal({ d, proposal }: { d: Discussion; proposal: Proposal }) {
  return (
    <form action={saveEditAction} aria-label="Edit the proposal" className={css.proposal}>
      <input type="hidden" name="id" value={d.id} />
      <h2 className={css.proposalTitle}>Edit the proposal</h2>
      <p className={css.note}>One item per line. Use &quot;new&quot; for a new requirement; Keel gives the IDs when you agree.</p>
      <Field label="Title"><input name="title" defaultValue={proposal.title} required /></Field>
      <Field label="Why"><textarea name="why" rows={3} defaultValue={proposal.why} /></Field>
      <Field label="What changes"><textarea name="what" rows={3} defaultValue={proposal.what.join('\n')} /></Field>
      <Field label="Requirement changes" hint="ID | new, changed or removed | text"><textarea name="requirements" rows={3} defaultValue={proposal.requirements.map((r) => `${r.id} | ${r.change} | ${r.text}`).join('\n')} /></Field>
      <Field label="Impact" hint="area | requirement IDs | what happens"><textarea name="impact" rows={2} defaultValue={proposal.impact.map((i) => `${i.area} | ${i.requirements.join(', ')} | ${i.what}`).join('\n')} /></Field>
      <Field label="Scenarios" hint="requirement ID or new | title"><textarea name="scenarios" rows={2} defaultValue={proposal.scenarios.map((s) => `${s.requirement} | ${s.title}`).join('\n')} /></Field>
      <Field label="Tasks" hint="title | files, comma separated"><textarea name="tasks" rows={2} defaultValue={proposal.tasks.map((t) => `${t.title} | ${t.files.join(', ')}`).join('\n')} /></Field>
      <Field label="Decision" optional><input name="decision" defaultValue={proposal.decision?.title ?? ''} /></Field>
      <Field label="Alternatives" optional><textarea name="alternatives" rows={2} defaultValue={proposal.decision?.alternatives.join('\n') ?? ''} /></Field>
      <Field label="Depends on" optional><input name="dependsOn" defaultValue={proposal.dependsOn.join(', ')} /></Field>
      <Field label="Screens" optional><input name="screens" defaultValue={proposal.screens.join(', ')} /></Field>
      <div className={css.row}><Button type="submit" variant="primary">Save the proposal</Button><ButtonLink href={`/discuss/${d.id}`} variant="text">Cancel</ButtonLink></div>
    </form>
  );
}

function Created({ d, cr }: { d: Discussion; cr: string }) {
  const root = serverStore().root;
  const folder = join(root, 'changes', cr);
  const walk = (dir: string, rel: string): string[] => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`])) : []);
  const change = listChanges(root).find((c) => c.id === cr);
  return (
    <Card title={`${cr} created as a draft`} meta={`Keel commit "Keel: ${cr} from discussion ${d.id}"`} actions={<Tag>Draft</Tag>}>
      <div className={css.stack}>
        <ul className={css.files} aria-label="Written">{walk(folder, `changes/${cr}/`).sort().map((f) => <li key={f}><code>{f}</code></li>)}<li><code>changes/README.md</code></li></ul>
        {change?.size === 'significant' && <Notice kind="info" title="Significant change: approve it before it goes to the agent">It adds or changes a requirement. Approve it on the change request page, as for any change request.</Notice>}
        <div className={css.row}><ButtonLink href={`/changes/${cr}`} variant="primary">Open {cr}</ButtonLink><ButtonLink href="/discuss" variant="text">Start another discussion</ButtonLink></div>
      </div>
    </Card>
  );
}

export async function DiscussView({ id, params }: { id?: string; params: Params }) {
  const store = serverStore();
  const d = id ? readDiscussion(store.root, id) : undefined;
  const model = await discussionModel(store);
  const style = discussionStyle(store);
  const state = d ? proposalState(d) : { kind: 'none' as const };
  const cr = params.agreed ?? (d?.status === 'cr' ? d.cr : undefined);
  const messages: ChatMessage[] = (d?.entries ?? []).flatMap((e) => (e.kind === 'message' ? [{ author: e.author, at: e.at, text: e.author === ASSISTANT ? shown(e.text) : e.text, assistant: e.author === ASSISTANT }] : []));
  const all = listDiscussions(store.root);
  const after = (
    <>
      {d && d.entries.filter((e) => e.kind === 'edit').length > 0 && <p className={css.note}>{d.entries.filter((e) => e.kind === 'edit').map((e) => (e.kind === 'edit' ? `${e.author} edited the proposal (${e.text.split('\n')[0]?.replace('Changed: ', '')})` : '')).join(' · ')}</p>}
      {state.kind === 'unreadable' && <Notice kind="warning" title={UNREADABLE} />}
      {d && state.kind === 'waiting' && !cr && <ProposalCard d={d} proposal={state.proposal} editing={params.edit === '1'} />}
    </>
  );
  const side = (
    <Card title="This discussion">
      <dl className={css.meta}>
        <dt>Model</dt><dd>{d?.model || model.label} · &quot;Discussion&quot; in Settings</dd>
        <dt>Style</dt><dd>{style.ref} · <Link href="/setup">change</Link></dd>
        <dt>Saved</dt><dd><code>{d ? d.path : '.keel/discussions/, as you go'}</code></dd>
        <dt>Status</dt><dd>{!d ? 'Not started' : cr ? `Became ${cr}` : state.kind === 'waiting' ? 'Proposal waiting for you' : d.status === 'parked' ? 'Parked' : 'In progress'}</dd>
      </dl>
      {d && d.status === 'open' && <form action={parkAction} className={css.row}><input type="hidden" name="id" value={d.id} /><Button type="submit" small>Park it</Button><span className={css.note}>Keeps it in .keel/discussions for later.</span></form>}
    </Card>
  );
  const bottom = (
    <Card title="Earlier discussions">
      {all.length ? (
        <ul className={css.history} aria-label="Earlier discussions">
          {all.map((x) => <li key={x.id}><Link href={`/discuss/${x.id}`}>{x.id}</Link><span>{x.title}</span><Tag tone={x.status === 'cr' ? 'ok' : x.status === 'parked' ? 'neutral' : 'link'}>{STATUS(x)}</Tag></li>)}
        </ul>
      ) : <p className={css.note}>None yet.</p>}
      <p className={css.note}>A discussion without a change request stays in .keel/discussions, marked Parked.</p>
    </Card>
  );
  const conversation = d ? d.entries.map((e) => e.text).join('\n') : '';
  return (
    <>
      <Topbar title="Discuss a change" />
      <main className="content">
        <PageHeader title="Discuss a change" meta={d ? <Tag tone="link">{d.id} · {d.title}</Tag> : undefined}
          description="Talk it through with the assistant. When you agree with its proposal, Keel writes the change request package. The conversation is saved with it, so you can always see why a requirement exists."
          actions={<ButtonLink href="/changes" variant="text">All change requests</ButtonLink>} />
        <ErrorAlert error={params.error} />
        {params.parked && <Notice kind="success" role="status" title="Parked">It stays in .keel/discussions and is listed under Earlier discussions.</Notice>}
        {d && cr && <Created d={d} cr={cr} />}
        <Chat key={d?.id ?? 'new'} {...(d ? { id: d.id } : {})} messages={messages} sources={sourceViews(store.root, d?.sources.length ? d.sources : undefined)}
          waiting={state.kind === 'waiting' && !cr} locked={Boolean(cr)} {...(params.start ? { prefill: params.start.slice(0, 2000) } : {})}
          starters={d ? [] : starters()} pulled={namedIds(conversation)} afterMessages={after} side={side} sideBottom={bottom} />
      </main>
    </>
  );
}
