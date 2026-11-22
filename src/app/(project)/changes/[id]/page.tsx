// One change request (mockup "Change and approval", REQ-014, task R18): what changed, size and approval, the impact
// on later documents by requirement ID with Update / Still valid / Later, and the change package for the agent.
// A request written by hand is shown as its files say; Keel only approves or rejects it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { approveChangeAction, changeSizeAction, impactAction, rejectChangeAction, submitChangeAction, writePackageAction } from '../actions';
import { CopyButton } from '@/components/CopyButton';
import { Markdown } from '@/components/Markdown';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { readExplore } from '@/lib/brainstorm/session';
import { packageFiles } from '@/lib/changes/flow';
import { changeImpact } from '@/lib/changes/impact';
import { computeStatus, listChanges, progressLabel, type ImpactDecision } from '@/lib/changes/store';
import { serverStore } from '@/lib/store/server-store';

export const dynamic = 'force-dynamic';

const DECISION: Record<ImpactDecision, { label: string; tone: string }> = {
  pending: { label: 'Out of date', tone: 'waiting' },
  updated: { label: 'Updated', tone: 'applied' },
  valid: { label: 'Still valid', tone: 'applied' },
  later: { label: 'Later · still out of date', tone: '' },
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
        <PageHead title={`${cr.id} · ${cr.title}`} meta={<span className={`pill ${status.kind}`}>{status.label}</span>}
          description={<>{keel ? 'Keel' : 'Written by hand'}{cr.affects.length ? ` · ${cr.affects.join(', ')}` : ''}{cr.created ? ` · raised ${cr.created}` : ''}{cr.author ? ` by ${cr.author}` : ''} · <code>{cr.file}</code> · <Link href="/changes">All change requests</Link></>} />
        <ErrorAlert error={error} />
        {notice && <p role="status" className="notice">{notice}</p>}
        {cr.error && <ErrorAlert error={cr.error} />}

        <div className="columns">
          <div>
            <section className="card" aria-labelledby="what">
              <h2 id="what">1 · What changed</h2>
              {cr.body.trim() ? <Markdown text={cr.body} /> : <p className="muted">The request has no text yet.</p>}
            </section>

            <section className="card" aria-labelledby="impact">
              <h2 id="impact">3 · Impact on later documents</h2>
              <p className="muted">By requirement ID{cr.requirements.length ? `: ${cr.requirements.join(', ')}` : ''}. {keel
                ? (significant ? (cr.status === 'approved' ? 'Resolve each document: Update drafts a new version from the change, Still valid records that nothing changes, Later keeps it out of date.' : 'Once approved, these documents are out of date until each is resolved.') : 'Minor: later documents stay valid.')
                : 'Written by hand: its tasks apply it.'}</p>
              {impact.documents.length === 0 && cr.impact.length === 0 && <p>No later document carries these requirements.</p>}
              {impact.documents.map((d) => {
                const record = cr.impact.find((i) => i.document === d.document);
                const decision = record?.decision;
                const actionable = keel && cr.status === 'approved' && significant && (decision === 'pending' || decision === 'later');
                return (
                  <div key={d.document} className="impact-item" role="group" aria-label={d.label}>
                    <div className="row spread">
                      <strong>{d.label}</strong>
                      <span className={`pill ${decision ? DECISION[decision].tone : ''}`}>{decision ? DECISION[decision].label : significant && keel ? 'Will be out of date' : keel ? 'Not affected' : 'Affected'}</span>
                    </div>
                    <ul aria-label={`Affected in ${d.label}`} className="plain-list small">
                      {d.requirements.length > 0 && <li>Requirements: {d.requirements.join(', ')}</li>}
                      {d.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    {actionable && (
                      <div className="row">
                        {(['updated', 'valid', 'later'] as const).map((choice) => (
                          <form key={choice} action={impactAction}>
                            <input type="hidden" name="id" value={cr.id} />
                            <input type="hidden" name="document" value={d.document} />
                            <input type="hidden" name="decision" value={choice} />
                            <button type="submit" className={choice === 'updated' ? 'primary' : undefined}>{choice === 'updated' ? 'Update' : choice === 'valid' ? 'Still valid' : 'Later'}</button>
                          </form>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </div>

          <div>
            <section className="card" aria-labelledby="approval">
              <h2 id="approval">2 · Size and approval</h2>
              <p><strong>{cr.size === 'minor' ? 'Minor' : cr.size === 'significant' ? 'Significant' : 'Size not given'}</strong>
                <span className="muted"> · {cr.size === 'minor' ? 'wording only: approved with the document, later documents stay valid.' : cr.size === 'significant' ? 'requirements added, removed or changed: needs an explicit approval, and later documents are out of date until it is applied.' : 'set in the header (minor or significant).'}</span></p>
              {keel && open && (
                <form action={changeSizeAction} className="row" aria-label="Size">
                  <input type="hidden" name="id" value={cr.id} />
                  <label>Size <select name="size" defaultValue={cr.size ?? 'significant'}><option value="minor">Minor</option><option value="significant">Significant</option></select></label>
                  <button type="submit">Save size</button>
                </form>
              )}
              {open ? (
                <div className="row space-above">
                  <form action={approveChangeAction}><input type="hidden" name="id" value={cr.id} /><button type="submit" className="primary">Approve</button></form>
                  <form action={rejectChangeAction}><input type="hidden" name="id" value={cr.id} /><button type="submit">Reject</button></form>
                  {cr.status === 'draft' && <form action={submitChangeAction}><input type="hidden" name="id" value={cr.id} /><button type="submit">Submit for approval</button></form>}
                </div>
              ) : <p className="muted">{cr.status === 'approved' ? `Approved. ${progressLabel(cr)}.` : 'Rejected. Kept in the history.'}</p>}
              {fromExplore && open && <p className="muted small">Approving writes the next intent version from Explore; rejecting puts Explore back to the approved intent.</p>}
              {cr.tasks.length > 0 && (
                <ul aria-label="Tasks" className="plain-list small space-above">
                  {cr.tasks.map((t) => <li key={t.id}><code>{t.id}</code> · {t.status}</li>)}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="package">
              <h2 id="package">4 · Change package for the agent</h2>
              <p className="muted">The project is in its own repository, so the change goes to the coding agent as a package in <code>{cr.folder}/</code>.</p>
              <ul aria-label="Package files" className="plain-list mono small">{pkg.map((f) => <li key={f}>{f}</li>)}</ul>
              <div className="row">
                {keel && cr.status === 'approved' && (
                  <form action={writePackageAction}><input type="hidden" name="id" value={cr.id} /><button type="submit" disabled={significant && !allResolved}>Write change package</button></form>
                )}
                {cr.hasPrompt && <CopyButton text={prompt} label="Copy prompt for the agent" />}
              </div>
              {keel && significant && !allResolved && cr.status === 'approved' && <p className="muted small">Resolve every affected document first.</p>}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
