// Mock references for the intent or spec (REQ-010): attach links or files and link them to requirements.
import { attachMockAction, linkMockAction, removeMockAction, replaceMockAction } from '@/app/projects/actions';
import type { MockDocument, MockReference } from '@/lib/mocks/references';
import { MockFileInput } from './MockFileInput';

interface Props {
  slug: string;
  document: MockDocument;
  references: MockReference[];
  requirements: string[];   // REQ IDs the project has
}

export function MockReferences({ slug, document, references, requirements }: Props) {
  const mine = references.filter((r) => r.document === document);
  return (
    <section aria-labelledby="mocks" className="card">
      <h2 id="mocks">Mock references</h2>
      <p className="muted">Links or files made elsewhere (PNG, JPG, PDF or HTML up to 10 MB), saved under docs/mocks/. Keel does not generate mocks.</p>
      {mine.length === 0 ? <p>None yet.</p> : (
        <ul aria-labelledby="mocks" className="plain-list">
          {mine.map((r) => (
            <li key={r.id} aria-label={r.id}>
              {r.kind === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element -- a local, checked file; next/image adds nothing here
                <img src={`/api/projects/${slug}/mocks/${r.id}`} alt={r.title} width={160} className="mock-thumb" />
              )}
              <strong>{r.id}</strong> · {r.title} ({r.kind}{r.kind === 'link' ? `: ${r.source}` : `, docs/mocks/${r.source}`}) · shows {r.requirements.join(', ') || 'no requirement yet'}
              <form action={linkMockAction} aria-label={`Requirements for ${r.id}`} style={{ margin: '4px 0 12px' }}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="document" value={document} />
                <input type="hidden" name="id" value={r.id} />
                {requirements.map((req) => (
                  <label key={req}>
                    <input type="checkbox" name="requirements" value={req} defaultChecked={r.requirements.includes(req)} /> {req}
                  </label>
                ))}
                <button type="submit">Link requirements</button>
              </form>
              <details>
                <summary>Replace or remove {r.id}</summary>
                <form action={replaceMockAction} aria-label={`Replace ${r.id}`} className="stack space-above">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="document" value={document} />
                  <input type="hidden" name="id" value={r.id} />
                  <label>Title <input name="title" defaultValue={r.title} /></label>
                  <label>Link <input name="url" type="url" placeholder="https://" /></label>
                  <label>Or a file <MockFileInput /></label>
                  <button type="submit">Replace</button>
                  <small>Keeps {r.id} and its linked requirements.</small>
                </form>
                <form action={removeMockAction} aria-label={`Remove ${r.id}`}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="document" value={document} />
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit">Remove {r.id}</button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
      <form action={attachMockAction} aria-label="Attach a mock reference" className="stack space-above">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="document" value={document} />
        <label>Title <input name="title" /></label>
        <label>Link <input name="url" type="url" placeholder="https://" /></label>
        <label>Or a file <MockFileInput /></label>
        <button type="submit">Attach</button>
      </form>
    </section>
  );
}
