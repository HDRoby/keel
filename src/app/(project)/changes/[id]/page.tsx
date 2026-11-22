// One change request (mock source Changes.dc.html, REQ-014, task R18): what changed, size and approval, the impact
// on later documents by requirement ID with Update / Still valid / Later, and the change package for the agent.
// A request written by hand is shown as its files say; Keel only approves or rejects it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { approveChangeAction, changeSizeAction, impactAction, planChangeAction, plannedScenarioAction, rejectChangeAction, submitChangeAction, writePackageAction } from '../actions';
import { ModelUnavailable } from '@/components/ModelUnavailable';
import { SubmitButton } from '@/components/SubmitButton';
import { LinkButton } from '@/components/ui/LinkButton';
import { ScenarioCard } from '@/components/ui/ScenarioCard';
import { readPlan } from '@/lib/changes/plan';
import { modelAvailability } from '@/lib/providers/local';
import { codeMap, scanFolder } from '@/lib/repo/scan';
import { readProject } from '@/lib/store/workspace';
import { CopyButton } from '@/components/CopyButton';
import { Markdown } from '@/components/Markdown';
import { ChangeStatus } from '@/components/ChangeStatus';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag, type TagTone } from '@/components/ui/Tag';
import css from '../changes.module.css';
import { readExplore } from '@/lib/brainstorm/session';
import { packageFiles } from '@/lib/changes/flow';
import { changeImpact } from '@/lib/changes/impact';
import { computeStatus, listChanges, progressLabel, type ImpactDecision } from '@/lib/changes/store';
import { serverStore } from '@/lib/store/server-store';

export const dynamic = 'force-dynamic';

const CODE_MAP = { off: 'off', names: 'file and folder names only', files: 'names, plus files you choose' } as const;
const sizeOf = (root: string, path: string) => { try { return statSync(join(root, path)).size; } catch { return 0; } };

const DECISION: Record<ImpactDecision, { label: string; tone: TagTone }> = {
  pending: { label: 'Out of date', tone: 'warn' },
  updated: { label: 'Updated', tone: 'ok' },
  valid: { label: 'Still valid', tone: 'ok' },
  later: { label: 'Later · still out of date', tone: 'neutral' },
};

function filesIn(root: string, folder: string, sub = ''): string[] {
  const dir = join(root, folder, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesIn(root, folder, join(sub, e.name)) : [join(sub, e.name)])).sort();
}

export default async function ChangePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const store = serverStore();
  const all = listChanges(store.root);
  const cr = all.find((c) => c.id === id);
  if (!cr) notFound();
  const status = computeStatus(cr, all);
  const keel = cr.origin === 'keel';
  const open = cr.status === 'draft' || cr.status === 'waiting';
  const significant = cr.size === 'significant';
  const impact = changeImpact(store.root, cr.source ?? 'docs/intent.md', cr.requirements);
  const prompt = cr.hasPrompt ? readFileSync(join(store.root, cr.folder, 'PROMPT.md'), 'utf8') : '';
  const pkg = keel ? packageFiles(store, cr).map((f) => f.path.slice(cr.folder.length + 1)) : filesIn(store.root, cr.folder);
  const explore = readExplore(store);
  const fromExplore = keel && explore.ok && explore.value.changeRequest === cr.id;
  const allResolved = cr.impact.every((i) => i.decision === 'updated' || i.decision === 'valid');
  const plan = readPlan(store.root, cr.id);
  const project = readProject(store.root);
  const codeMapMode = project.ok ? project.value.codeMap : 'names';
  const candidates = codeMapMode === 'files' ? scanFolder(store.root).shareable.concat(codeMap(store.root).filter((f) => /\.(ts|tsx|js|py|go|rs|java|rb)$/.test(f)).slice(0, 30).map((path) => ({ path, size: sizeOf(store.root, path), why: 'Code' }))) : [];
  const model = await modelAvailability(store, 'documents');
  const unavailable = model.ok ? undefined : model.reason;

  return (
    <>
      <Topbar title={cr.id} />
      <main className="content">
        <PageHeader title={`${cr.id} · ${cr.title}`} meta={<ChangeStatus status={status} />}
          description={<>{keel ? 'Keel' : 'Written by hand'}{cr.affects.length ? ` · ${cr.affects.join(', ')}` : ''}{cr.created ? ` · raised ${cr.created}` : ''}{cr.author ? ` by ${cr.author}` : ''} · <code>{cr.file}</code>{cr.discussion ? <> · <Link href={`/discuss/${cr.discussion}`}>Discussion {cr.discussion}</Link></> : null} · <Link href="/changes">All change requests</Link></>} />
        <ErrorAlert error={error} />
        {notice && <Notice kind="success" role="status">{notice}</Notice>}
        {cr.error && <ErrorAlert error={cr.error} />}

        <div className={css.columns}>
          <div className={css.main}>
            <Card title="1 · What changed">
              {cr.body.trim() ? <Markdown text={cr.body} /> : <p className={css.muted}>The request has no text yet.</p>}
            </Card>

            <Card title="3 · Impact on later documents" meta={<>By requirement ID{cr.requirements.length ? `: ${cr.requirements.join(', ')}` : ''}. {keel
              ? (significant ? (cr.status === 'approved' ? 'Resolve each document: Update drafts a new version from the change, Still valid records that nothing changes, Later keeps it out of date.' : 'Once approved, these documents are out of date until each is resolved.') : 'Minor: later documents stay valid.')
              : 'Written by hand: its tasks apply it.'}</>}>
              <div className={css.stack}>
                {impact.documents.length === 0 && cr.impact.length === 0 && <p className={css.flat}>No later document carries these requirements.</p>}
                {impact.documents.map((d) => {
                  const record = cr.impact.find((i) => i.document === d.document);
                  const decision = record?.decision;
                  const actionable = keel && cr.status === 'approved' && significant && (decision === 'pending' || decision === 'later');
                  return (
                    <div key={d.document} className={css.impact} role="group" aria-label={d.label}>
                      <div className={css.row}>
                        <strong>{d.label}</strong>
                        <Tag tone={decision ? DECISION[decision].tone : significant && keel ? 'warn' : 'neutral'}>{decision ? DECISION[decision].label : significant && keel ? 'Will be out of date' : keel ? 'Not affected' : 'Affected'}</Tag>
                      </div>
                      <ul aria-label={`Affected in ${d.label}`} className={css.list}>
                        {d.requirements.length > 0 && <li>Requirements: {d.requirements.join(', ')}</li>}
                        {d.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                      {actionable && (
                        <div className={css.row}>
                          {(['updated', 'valid', 'later'] as const).map((choice) => (
                            <form key={choice} action={impactAction}>
                              <input type="hidden" name="id" value={cr.id} />
                              <input type="hidden" name="document" value={d.document} />
                              <input type="hidden" name="decision" value={choice} />
                              <Button type="submit" small variant={choice === 'updated' ? 'primary' : choice === 'later' ? 'text' : 'outline'}>{choice === 'updated' ? 'Update' : choice === 'valid' ? 'Still valid' : 'Later'}</Button>
                            </form>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {keel && (
              <Card title="4 · Plan the change" meta={plan ? `Planned ${plan.plannedAt.slice(0, 10)} · code map: ${CODE_MAP[plan.codeMap]}${plan.shared.length ? ` · ${plan.shared.length} file${plan.shared.length === 1 ? '' : 's'} shared` : ''}` : `New tasks with the files likely to change, suggested scenarios, and what is linked. Code map: ${CODE_MAP[codeMapMode]} (Settings).`}>
                <div className={css.stack}>
                  {cr.status !== 'approved' ? <p className={css.muted}>Approve the request first; then plan it.</p> : (
                    <form action={planChangeAction} aria-label="Plan the change" className={css.stack}>
                      <input type="hidden" name="id" value={cr.id} />
                      {codeMapMode === 'files' && candidates.length > 0 && (
                        <fieldset className={css.checks} aria-label="Files to share for this plan">
                          <legend className={css.legend}>Files the assistant may read for this plan (nothing else is sent)</legend>
                          {candidates.map((f) => <label key={f.path}><input type="checkbox" name="share" value={f.path} /> <code>{f.path}</code> <span className={css.muted}>{f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} KB`}</span></label>)}
                        </fieldset>
                      )}
                      {unavailable && <ModelUnavailable what="Plan the change" reason={unavailable} />}
                      <div><SubmitButton primary label={plan ? 'Plan again' : 'Plan the change'} busyLabel="Planning…" disabled={Boolean(unavailable)} /></div>
                    </form>
                  )}
                  {plan && (
                    <>
                      <ul className={css.list} aria-label="Planned tasks">
                        {plan.tasks.map((t) => (
                          <li key={t.id} aria-label={t.id} className={css.impact}>
                            <strong>{t.id} · {t.title}</strong>
                            <span className={css.muted}>{t.goal} · {t.requirements.join(', ') || 'no requirement named'}</span>
                            <span>Files that are likely to change:</span>
                            <ul className={css.list} aria-label={`Files for ${t.id}`}>{t.files.map((f) => <li key={f}>{f.startsWith('To be decided') ? f : <code>{f}</code>}</li>)}</ul>
                          </li>
                        ))}
                      </ul>
                      <div className={css.stack} aria-label="Suggested scenarios">
                        {plan.scenarios.filter((x) => x.state !== 'cleared').map((x) => (
                          <ScenarioCard key={x.id} suggested={x.state === 'suggested'} label={`${x.state === 'suggested' ? 'Suggested: ' : ''}${x.name}`} name={x.name} steps={x.steps}
                            tag={<Tag tone={x.state === 'accepted' ? 'ok' : 'accent'}>{x.state === 'accepted' ? 'Accepted' : 'Suggested'} · @{x.req}</Tag>}
                            actions={x.state === 'suggested' ? <>
                              <form action={plannedScenarioAction} className={css.inline}><input type="hidden" name="id" value={cr.id} /><input type="hidden" name="scenario" value={x.id} /><input type="hidden" name="state" value="accepted" /><LinkButton type="submit">Accept</LinkButton></form>
                              <form action={plannedScenarioAction} className={css.inline}><input type="hidden" name="id" value={cr.id} /><input type="hidden" name="scenario" value={x.id} /><input type="hidden" name="state" value="cleared" /><LinkButton type="submit" tone="muted">Clear</LinkButton></form>
                            </> : undefined} />
                        ))}
                      </div>
                      <ul className={css.list} aria-label="Linked">
                        {plan.linked.decisions.map((d) => <li key={d}>Decision record: <code>{d}</code></li>)}
                        {plan.linked.mocks.map((m) => <li key={m}>Mock screen: <code>{m}</code></li>)}
                        {plan.linked.dependsOn.length > 0 && <li>Suggested depends_on: {plan.linked.dependsOn.join(', ')}</li>}
                        {plan.linked.clashes.map((c) => <li key={c}>Requirement ID clash: {c}</li>)}
                        {!plan.linked.decisions.length && !plan.linked.mocks.length && !plan.linked.dependsOn.length && !plan.linked.clashes.length && <li>Nothing linked.</li>}
                      </ul>
                    </>
                  )}
                </div>
              </Card>
            )}
          </div>

          <div className={css.side}>
            <Card title="2 · Size and approval" actions={<Tag tone={cr.size === 'minor' ? 'neutral' : 'warn'}>{cr.size === 'minor' ? 'Minor' : cr.size === 'significant' ? 'Significant' : 'Size not given'}</Tag>}>
              <div className={css.stack}>
                <p className={css.muted}>{cr.size === 'minor' ? 'Wording only: approved with the document, later documents stay valid.' : cr.size === 'significant' ? 'Requirements added, removed or changed: needs an explicit approval, and later documents are out of date until it is applied.' : 'Set in the header (minor or significant).'}</p>
                {keel && open && (
                  <form action={changeSizeAction} className={css.row} aria-label="Size">
                    <input type="hidden" name="id" value={cr.id} />
                    <Field label="Size"><select name="size" defaultValue={cr.size ?? 'significant'}><option value="minor">Minor</option><option value="significant">Significant</option></select></Field>
                    <Button type="submit" small>Save size</Button>
                  </form>
                )}
                {open ? (
                  <div className={css.row}>
                    <form action={approveChangeAction}><input type="hidden" name="id" value={cr.id} /><Button type="submit" variant="primary">Approve</Button></form>
                    <form action={rejectChangeAction}><input type="hidden" name="id" value={cr.id} /><Button type="submit" danger>Reject</Button></form>
                    {cr.status === 'draft' && <form action={submitChangeAction}><input type="hidden" name="id" value={cr.id} /><Button type="submit">Submit for approval</Button></form>}
                  </div>
                ) : <p className={css.flat}>{cr.status === 'approved' ? `Approved. ${progressLabel(cr)}.` : 'Rejected. Kept in the history.'}</p>}
                {fromExplore && open && <p className={css.muted}>Approving writes the next intent version from Explore; rejecting puts Explore back to the approved intent.</p>}
                {cr.tasks.length > 0 && (
                  <ul aria-label="Tasks" className={css.list}>
                    {cr.tasks.map((t) => <li key={t.id}><code>{t.id}</code> · {t.status}</li>)}
                  </ul>
                )}
              </div>
            </Card>

            <Card title="5 · Change package for the agent" meta={<>The project is in its own repository, so the change goes to the coding agent as a package in <code>{cr.folder}/</code>.</>}>
              <div className={css.stack}>
                <ul aria-label="Package files" className={css.list}>{pkg.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
                <div className={css.row}>
                  {keel && cr.status === 'approved' && (
                    <form action={writePackageAction}><input type="hidden" name="id" value={cr.id} /><Button type="submit" variant="primary" disabled={significant && !allResolved}>Write change package</Button></form>
                  )}
                  {cr.hasPrompt && <CopyButton text={prompt} label="Copy prompt for the agent" />}
                </div>
                {keel && significant && !allResolved && cr.status === 'approved' && <p className={css.muted}>Resolve every affected document first.</p>}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
