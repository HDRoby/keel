// A stage document (mockup: intent.png): facts and text on the left; approval, extra cards and
// version history on the right (REQ-002, REQ-005, REQ-008).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { reviewAction } from '@/app/projects/actions';
import { approvalsOf, type Approvable } from '@/lib/gates/approvals';
import type { StoredDocument } from '@/lib/store/documents';
import { documentVersions } from '@/lib/versions/diff';
import { Markdown } from './Markdown';

const LABELS = { approve: 'Approve', 'request-changes': 'Request changes', reject: 'Reject' } as const;
const DONE = { approve: 'Approved', 'request-changes': 'Changes requested', reject: 'Rejected' } as const;
const STATUS_BADGE: Record<string, string> = { approved: 'ok', draft: 'warn', pending: 'warn', closed: 'danger' };

const show = (value: unknown) => (Array.isArray(value) ? value.join(', ') || '—' : String(value ?? '—'));

interface Props {
  slug: string;
  home: string;
  document: Approvable;
  doc: StoredDocument;
  reviewer: string;
  before?: ReactNode;   // above the document, e.g. conflicts
  after?: ReactNode;    // under the document, e.g. regenerate
  aside?: ReactNode;    // extra cards in the right column, e.g. mock references
  collapsed?: boolean;  // show the text behind "Show <file>" (the plan, whose tasks have their own table)
}

export async function DocumentReview({ slug, home, document, doc, reviewer, before, after, aside, collapsed = false }: Props) {
  const approvals = approvalsOf(doc);
  const { header } = doc;
  const versions = (await documentVersions(home, doc.path)).reverse();
  const facts: [string, unknown][] = [
    ['ID', header.id], ['Project', header.project], ['Status', header.status],
    ['Author', header.author], ['Created', header.created], ['Updated', header.updated],
    ['Version', header.version], ['Template', header.template],
    ...(['brainstorm_style', 'from_intent', 'from_spec', 'standards'] as const)
      .filter((k) => header[k] !== undefined)
      .map((k): [string, unknown] => [k.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()), header[k]]),
  ];

  return (
    <div className="columns">
      <div>
        {before}
        <section className="card" aria-label={doc.path}>
          <p role="status" className="muted">{header.id} v{header.version} · status {header.status}</p>
          <dl className="facts">
            {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>)}
          </dl>
          {collapsed ? (
            <details><summary>Show {doc.path.split('/').pop()}</summary><article className="space-above"><Markdown text={doc.body} /></article></details>
          ) : <article><Markdown text={doc.body} /></article>}
        </section>
        {after}
      </div>

      <div>
        <section className="card" aria-labelledby="approval">
          <div className="row spread">
            <h2 id="approval">Approval</h2>
            <span className={`badge ${STATUS_BADGE[header.status] ?? ''}`}>{header.status}</span>
          </div>
          {approvals.length === 0 ? <p className="muted space-above">No review yet.</p> : (
            <ul aria-label="Approvals" className="plain-list">
              {approvals.map((a, i) => (
                <li key={i}>{DONE[a.action]} by {a.by} on {a.date} (v{a.version}){a.comment ? `: ${a.comment}` : ''}</li>
              ))}
            </ul>
          )}
          {header.status === 'approved' && <p className="muted">Approved. Changes to it go through a change request.</p>}
          {header.status !== 'closed' && header.status !== 'approved' && (
            <form action={reviewAction} aria-label="Review" className="stack space-above">
              <input type="hidden" name="document" value={document} />
              <fieldset>
                <legend>Decision</legend>
                {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((action) => (
                  <label key={action}>
                    <input type="radio" name="action" value={action} defaultChecked={action === 'approve'} /> {LABELS[action]}
                  </label>
                ))}
              </fieldset>
              <label>Your name <input name="by" defaultValue={reviewer} required /></label>
              <label>Comment <textarea name="comment" rows={2} /></label>
              <div><button type="submit" className="primary">Record review</button></div>
            </form>
          )}
        </section>

        {aside}

        <section className="card" aria-labelledby="history">
          <h2 id="history">Version history</h2>
          <ul className="plain-list">
            {versions.map((v) => (
              <li key={v.version}>
                <div className="row spread">
                  <Link href={`/projects/${slug}/versions?doc=${encodeURIComponent(doc.path)}&v=${v.version}`}>
                    <strong>Version {v.version}</strong>{v.version === header.version ? ' · current' : ''}
                  </Link>
                  <small>{v.date}</small>
                </div>
                <div className="muted">{v.reason}</div>
              </li>
            ))}
          </ul>
          <p className="space-above"><Link href={`/projects/${slug}/versions?doc=${encodeURIComponent(doc.path)}`}>Compare versions</Link></p>
        </section>
      </div>
    </div>
  );
}
