// Regenerate a draft spec or plan (owner decision, T6). Approved documents are not regenerated.
import type { ReactNode } from 'react';
import { regenerateAction } from '@/app/(project)/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { ModelUnavailable } from './ModelUnavailable';
import { Card } from './ui/Card';
import styles from './Conflicts.module.css';

export function RegenerateForm({ document, unavailable, children }: { document: 'spec' | 'plan'; unavailable?: string; children: ReactNode }) {
  return (
    <Card label={`Regenerate ${document}`}>
      <form action={regenerateAction} aria-label={`Regenerate ${document}`} className={styles.stack}>
        <input type="hidden" name="document" value={document} />
        <p className={styles.muted}>{children} Your edits stay; parts changed on both sides become conflicts to resolve before approval.</p>
        {unavailable && <ModelUnavailable what={`Regenerate ${document}`} reason={unavailable} />}
        <div><SubmitButton label={`Regenerate ${document}`} busyLabel={`Regenerating ${document}…`} disabled={Boolean(unavailable)} /></div>
      </form>
    </Card>
  );
}
