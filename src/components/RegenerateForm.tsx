// Regenerate a draft spec or plan (owner decision, T6). Approved documents are not regenerated.
import type { ReactNode } from 'react';
import { regenerateAction } from '@/app/(project)/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Card } from './ui/Card';
import styles from './Conflicts.module.css';

export function RegenerateForm({ document, children }: { document: 'spec' | 'plan'; children: ReactNode }) {
  return (
    <Card label={`Regenerate ${document}`}>
      <form action={regenerateAction} aria-label={`Regenerate ${document}`} className={styles.stack}>
        <input type="hidden" name="document" value={document} />
        <p className={styles.muted}>{children} Your edits stay; parts changed on both sides become conflicts to resolve before approval.</p>
        <div><SubmitButton label={`Regenerate ${document}`} busyLabel={`Regenerating ${document}…`} /></div>
      </form>
    </Card>
  );
}
