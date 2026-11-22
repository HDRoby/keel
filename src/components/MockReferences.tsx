// Mock references for the intent or spec (REQ-010): attach links or files and link them to requirements.
import type React from 'react';
import { attachMockAction, linkMockAction, removeMockAction, replaceMockAction } from '@/app/(project)/actions';
import type { MockDocument, MockReference } from '@/lib/mocks/references';
import { Icon } from './Icons';
import { MockFileInput } from './MockFileInput';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Field } from './ui/Field';
import { Tag } from './ui/Tag';
import styles from './MockReferences.module.css';

interface Props {
  bare?: boolean;           // inside another card (the Spec's Clickable mock tab): a section titled "Other references"
  document: MockDocument;
  references: MockReference[];
  requirements: string[];   // REQ IDs the project has
}

/** A card of its own, or a section inside another card. */
function Frame({ bare, count, children }: { bare?: boolean; count: React.ReactNode; children: React.ReactNode }) {
  return bare
    ? <section aria-labelledby="mocks" className={styles.stack}><div className={styles.head}><h3 id="mocks" className={styles.title3}>Other references</h3>{count}</div>{children}</section>
    : <Card title={<span id="mocks">Mock references</span>} actions={count}>{children}</Card>;
}

const KIND_ICON: Record<string, string> = { link: 'link', image: 'image', pdf: 'picture_as_pdf', html: 'code' };

export function MockReferences({ bare, document, references, requirements }: Props) {
  const mine = references.filter((r) => r.document === document);
  const count = <Tag tone="accent"><Icon name="attach_file" size={16} /> {mine.length} reference{mine.length === 1 ? '' : 's'}</Tag>;
  return (
    <Frame bare={bare} count={count}>
      <div className={styles.stack}>
        <p className={styles.muted}>Links or files made elsewhere (PNG, JPG, PDF or HTML up to 10 MB), saved under <code>.keel/mocks/</code>. Keel does not generate mocks.</p>
        {mine.length === 0 ? <p className={styles.muted}>None yet.</p> : (
          <ul aria-labelledby="mocks" className={styles.list}>
            {mine.map((r) => (
              <li key={r.id} aria-label={r.id} className={styles.item}>
                <div className={styles.head}>
                  <Icon name={KIND_ICON[r.kind] ?? 'description'} size={18} tone="accent" />
                  <span className={styles.title}><strong>{r.id}</strong> · {r.title}</span>
                  <span className={styles.kind}>{r.kind}</span>
                </div>
                {r.kind === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element -- a local, checked file; next/image adds nothing here
                  <img src={`/api/mocks/${r.id}`} alt={r.title} width={160} className={styles.thumb} />
                )}
                <p className={styles.meta}>{r.kind === 'link' ? r.source : `.keel/mocks/${r.source}`} · shows {r.requirements.join(', ') || 'no requirement yet'}</p>
                <form action={linkMockAction} aria-label={`Requirements for ${r.id}`} className={styles.link}>
                  <input type="hidden" name="document" value={document} />
                  <input type="hidden" name="id" value={r.id} />
                  {requirements.map((req) => (
                    <label key={req} className={styles.check}>
                      <input type="checkbox" name="requirements" value={req} defaultChecked={r.requirements.includes(req)} /> {req}
                    </label>
                  ))}
                  <Button type="submit" small>Link requirements</Button>
                </form>
                <details>
                  <summary className={styles.summary}>Replace or remove {r.id}</summary>
                  <div className={styles.stack}>
                    <form action={replaceMockAction} aria-label={`Replace ${r.id}`} className={styles.stack}>
                      <input type="hidden" name="document" value={document} />
                      <input type="hidden" name="id" value={r.id} />
                      <Field label="Title"><input name="title" defaultValue={r.title} /></Field>
                      <Field label="Link"><input name="url" type="url" placeholder="https://" /></Field>
                      <Field label="Or a file" hint={`Keeps ${r.id} and its linked requirements.`}><MockFileInput /></Field>
                      <div><Button type="submit" small>Replace</Button></div>
                    </form>
                    <form action={removeMockAction} aria-label={`Remove ${r.id}`}>
                      <input type="hidden" name="document" value={document} />
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" small danger>Remove {r.id}</Button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <form action={attachMockAction} aria-label="Attach a mock reference" className={styles.stack}>
          <input type="hidden" name="document" value={document} />
          <Field label="Title"><input name="title" /></Field>
          <Field label="Link"><input name="url" type="url" placeholder="https://" /></Field>
          <Field label="Or a file"><MockFileInput /></Field>
          <div><Button type="submit">Attach</Button></div>
        </form>
      </div>
    </Frame>
  );
}
