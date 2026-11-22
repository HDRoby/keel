// Regenerate a draft spec or plan (owner decision, T6). Approved documents are not regenerated.
import type { ReactNode } from 'react';
import { regenerateAction } from '@/app/(project)/actions';
import { SubmitButton } from '@/components/SubmitButton';

export function RegenerateForm({ document, children }: { document: 'spec' | 'plan'; children: ReactNode }) {
  return (
    <form action={regenerateAction} aria-label={`Regenerate ${document}`} className="card">
      <input type="hidden" name="document" value={document} />
      <p className="muted">{children} Your edits stay; parts changed on both sides become conflicts to resolve before approval.</p>
      <SubmitButton label={`Regenerate ${document}`} busyLabel={`Regenerating ${document}…`} />
    </form>
  );
}
