// A stage document (docs/ui-guide.md › Document page, mock sources Intent, Spec and Plan): the main card with a note
// on where the content comes from, Preview and Markdown tabs, the header facts and the text; the side column with
// Approval, extra cards and Version history (REQ-002, REQ-005, REQ-008).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { reviewAction } from '@/app/(project)/actions';
import { approvalsOf, type Approvable } from '@/lib/gates/approvals';
import type { StoredDocument } from '@/lib/store/documents';
import { templateLabel } from '@/lib/brainstorm/session';
import { documentVersions } from '@/lib/versions/diff';
import { Icon } from './Icons';
import { Markdown } from './Markdown';
import { SubmitButton } from './SubmitButton';
import { Card } from './ui/Card';
import { CodeBlock } from './ui/CodeBlock';
import { Field } from './ui/Field';
import { LinkButton } from './ui/LinkButton';
import { MetaGrid } from './ui/MetaGrid';
import { Tabs } from './ui/Tabs';
import { Tag, type TagTone } from './ui/Tag';
import styles from './DocumentReview.module.css';

const LABELS = { approve: 'Approve', 'request-changes': 'Request changes', reject: 'Reject' } as const;
const DONE = { approve: 'Approved', 'request-changes': 'Changes requested', reject: 'Rejected' } as const;
const STATUS: Record<string, { tone: TagTone; label: string }> = {
  approved: { tone: 'ok', label: 'Approved' }, draft: { tone: 'warn', label: 'Draft' }, pending: { tone: 'accent', label: 'Pending' }, closed: { tone: 'danger', label: 'Closed' },
};

const show = (value: unknown) => (Array.isArray(value) ? value.join(', ') || '—' : String(value ?? '—'));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  home: string;
  document: Approvable;
  doc: StoredDocument;
  reviewer: string;
  view?: string;         // "markdown" shows the source
  note?: ReactNode;      // where the content comes from and how to change it
  noteAction?: ReactNode;
  before?: ReactNode;    // above the document, e.g. conflicts
  after?: ReactNode;     // under the document, e.g. regenerate
  aside?: ReactNode;     // cards at the top of the side column, e.g. the decision and mock references
  collapsed?: boolean;   // show the text behind "Show <file>" (the plan, whose tasks have their own table)
}

export async function DocumentReview({ home, document, doc, reviewer, view, note, noteAction, before, after, aside, collapsed = false }: Props) {
  const approvals = approvalsOf(doc);
  const { header } = doc;
  const versions = (await documentVersions(home, doc.path)).reverse();
  const facts = [
    { key: 'ID', value: show(header.id) }, { key: 'Project', value: show(header.project) }, { key: 'Status', value: capital(show(header.status)) },
    { key: 'Author', value: show(header.author) }, { key: 'Created', value: show(header.created) }, { key: 'Updated', value: show(header.updated) },
    { key: 'Version', value: show(header.version) }, { key: 'Template', value: header.template ? templateLabel(String(header.template)) : '—' },
    ...(['brainstorm_style', 'from_intent', 'from_spec', 'standards'] as const)
      .filter((k) => header[k] !== undefined)
      .map((k) => ({ key: capital(k.replace('_', ' ')), value: show(header[k]) })),
  ];
  const status = STATUS[header.status] ?? { tone: 'neutral' as const, label: capital(header.status) };
  const base = `/${document}`;
  const markdown = view === 'markdown';
  const text = <article><Markdown text={doc.body} /></article>;

  return (
    <div className={styles.columns}>
      <div className={styles.main}>
        <p className={styles.line}><span role="status">{header.id} v{header.version} · status {header.status}</span>{header.template ? <> · Template: {templateLabel(String(header.template))}</> : null}</p>
        {before}
        <Card label={doc.path}>
          <div className={styles.stack}>
            {note && (
              <div role="note" className={styles.note}>
                <Icon name="info" size={18} tone="muted" />
                <span className={styles.noteText}>{note}</span>
                {noteAction}
              </div>
            )}
            <Tabs label={`${doc.path} view`} items={[
              { href: base, label: 'Preview', current: !markdown },
              { href: `${base}?view=markdown`, label: 'Markdown', current: markdown },
            ]} />
            {markdown ? (
              <CodeBlock label={`Markdown of ${doc.path}`}>{readFileSync(join(home, doc.path), 'utf8')}</CodeBlock>
            ) : (
              <>
                <MetaGrid label="Document header" items={facts} />
                {collapsed ? <details><summary className={styles.summary}>Show {doc.path.split('/').pop()}</summary>{text}</details> : text}
              </>
            )}
          </div>
        </Card>
        {after}
      </div>

      <div className={styles.side}>
        {aside}

        <Card title={<span id="approval">Approval</span>} actions={<Tag tone={status.tone}>{header.status === 'approved' && <Icon name="check" size={16} />}{status.label}</Tag>}>
          <div className={styles.stack}>
            {approvals.length === 0 ? <p className={styles.muted}>No review yet.</p> : (
              <ul aria-label="Approvals" className={styles.list}>
                {approvals.map((a, i) => (
                  <li key={i}>{DONE[a.action]} by {a.by} on {a.date} (v{a.version}){a.comment ? `: ${a.comment}` : ''}</li>
                ))}
              </ul>
            )}
            {header.status === 'approved' && <p className={styles.muted}>Approved. Changes to it go through a change request.</p>}
            {header.status !== 'closed' && header.status !== 'approved' && (
              <form action={reviewAction} aria-label="Review" className={styles.stack}>
                <input type="hidden" name="document" value={document} />
                <fieldset className={styles.choices}>
                  <legend className={styles.legend}>Decision</legend>
                  {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((action) => (
                    <label key={action} className={styles.choice}>
                      <input type="radio" name="action" value={action} defaultChecked={action === 'approve'} /> {LABELS[action]}
                    </label>
                  ))}
                </fieldset>
                <Field label="Your name"><input name="by" defaultValue={reviewer} required /></Field>
                <Field label="Comment" optional><textarea name="comment" rows={2} /></Field>
                <div><SubmitButton primary label="Record review" busyLabel="Recording…" /></div>
              </form>
            )}
          </div>
        </Card>

        <Card title={<span id="history">Version history</span>}>
          <ul className={styles.versions}>
            {versions.map((v) => (
              <li key={v.version}>
                <div className={styles.versionHead}>
                  <Link href={`/versions?doc=${encodeURIComponent(doc.path)}&v=${v.version}`} className={styles.version}>
                    Version {v.version}{v.version === header.version ? ' · current' : ''}
                  </Link>
                  <span className={styles.date}>{v.date}</span>
                </div>
                <div className={styles.reason}>{v.reason}</div>
              </li>
            ))}
          </ul>
          <p className={styles.more}><LinkButton href={`/versions?doc=${encodeURIComponent(doc.path)}`}>Compare versions</LinkButton></p>
        </Card>
      </div>
    </div>
  );
}
