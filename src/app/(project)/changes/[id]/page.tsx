// One change request (mock source Changes.dc.html, REQ-014, task R18): what changed, size and approval, the impact
// on later documents by requirement ID with Update / Still valid / Later, and the change package for the agent.
// A request written by hand is shown as its files say; Keel only approves or rejects it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { approveChangeAction, changeSizeAction, impactAction, rejectChangeAction, submitChangeAction, writePackageAction } from '../actions';
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

  return (
    <>
      <Topbar title={cr.id} />
      <main className="content">
        <PageHeader title={`${cr.id} · ${cr.title}`} meta={<ChangeStatus status={status} />}
          description={<>{keel ? 'Keel' : 'Written by hand'}{cr.affects.length ? ` · ${cr.affects.join(', ')}` : ''}{cr.created ? ` · raised ${cr.created}` : ''}{cr.author ? ` by ${cr.author}` : ''} · <code>{cr.file}</code> · <Link href="/changes">All change requests</Link></>} />
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

            <Card title="4 · Change package for the agent" meta={<>The project is in its own repository, so the change goes to the coding agent as a package in <code>{cr.folder}/</code>.</>}>
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
