// Conflicts a regeneration raised, side by side, with a choice for each (owner decision, T6).
import { resolveConflictsAction } from '@/app/(project)/actions';
import type { Conflict } from '@/lib/generate/merge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { CodeBlock } from './ui/CodeBlock';
import { Tag } from './ui/Tag';
import styles from './Conflicts.module.css';

export function Conflicts({ document, conflicts }: { document: 'spec' | 'plan'; conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <Card title={<span id="conflicts">Conflicts to resolve ({conflicts.length})</span>} actions={<Tag tone="warn">Conflict</Tag>}>
      <div className={styles.stack}>
        <p className={styles.muted}>The regeneration and your edits changed the same part. Approval waits until each one is resolved.</p>
        <form action={resolveConflictsAction} aria-label="Resolve conflicts" className={styles.stack}>
          <input type="hidden" name="document" value={document} />
          {conflicts.map((c) => (
            <fieldset key={c.name} className={styles.conflict}>
              <legend className={styles.legend}>{c.kind === 'section' ? `Section: ${c.name}` : `File: ${c.name}`}</legend>
              <div className={styles.sides}>
                <div><strong>Yours</strong><CodeBlock>{c.mine || '(you removed it)'}</CodeBlock></div>
                <div><strong>Regenerated</strong><CodeBlock>{c.theirs || '(the regeneration removes it)'}</CodeBlock></div>
              </div>
              <div className={styles.choices}>
                <label><input type="radio" name={`choice:${c.name}`} value="mine" defaultChecked /> Keep mine</label>
                <label><input type="radio" name={`choice:${c.name}`} value="theirs" /> Take new</label>
                <label><input type="radio" name={`choice:${c.name}`} value="merged" /> Use merged text:</label>
              </div>
              <textarea name={`merged:${c.name}`} defaultValue={c.mine} rows={6} className={styles.merged} aria-label={`Merged text for ${c.name}`} />
            </fieldset>
          ))}
          <div><Button type="submit" variant="primary">Resolve conflicts</Button></div>
        </form>
      </div>
    </Card>
  );
}
