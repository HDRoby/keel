// Conflicts a regeneration raised, side by side, with a choice for each (owner decision, T6).
import { resolveConflictsAction } from '@/app/(project)/actions';
import type { Conflict } from '@/lib/generate/merge';

const box = { whiteSpace: 'pre-wrap' as const, border: '1px solid #ddd', borderRadius: 6, padding: 8, margin: 0, fontSize: 13, overflowX: 'auto' as const };

export function Conflicts({ document, conflicts }: { document: 'spec' | 'plan'; conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section aria-labelledby="conflicts" style={{ border: '2px solid #c77700', borderRadius: 8, padding: 16, margin: '16px 0' }}>
      <h2 id="conflicts">Conflicts to resolve ({conflicts.length})</h2>
      <p>The regeneration and your edits changed the same part. Approval waits until each one is resolved.</p>
      <form action={resolveConflictsAction} aria-label="Resolve conflicts" style={{ display: 'grid', gap: 16 }}>
        <input type="hidden" name="document" value={document} />
        {conflicts.map((c) => (
          <fieldset key={c.name}>
            <legend>{c.kind === 'section' ? `Section: ${c.name}` : `File: ${c.name}`}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><strong>Yours</strong><pre style={box}>{c.mine || '(you removed it)'}</pre></div>
              <div><strong>Regenerated</strong><pre style={box}>{c.theirs || '(the regeneration removes it)'}</pre></div>
            </div>
            <label style={{ marginRight: 12 }}><input type="radio" name={`choice:${c.name}`} value="mine" defaultChecked /> Keep mine</label>
            <label style={{ marginRight: 12 }}><input type="radio" name={`choice:${c.name}`} value="theirs" /> Take new</label>
            <label><input type="radio" name={`choice:${c.name}`} value="merged" /> Use merged text:</label>
            <textarea name={`merged:${c.name}`} defaultValue={c.mine} rows={6} style={{ width: '100%', fontFamily: 'monospace' }} aria-label={`Merged text for ${c.name}`} />
          </fieldset>
        ))}
        <button type="submit">Resolve conflicts</button>
      </form>
    </section>
  );
}
