// ListRows (docs/ui-guide.md): rows with an ID label (mono 12, 80 px; "new" or "suggested" in italics before an ID
// exists), a single-line input, move-up and remove icon buttons, and "+ Add …" under the list.
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './ListRows.module.css';

export function ListRows({ label, add, children }: { label?: string; add?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.list} role="list" aria-label={label}>
      {children}
      {add && <div className={styles.add}>{add}</div>}
    </div>
  );
}

export function ListRow({ id, pending, actions, className, children }: { id: ReactNode; pending?: boolean; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div role="listitem" className={cx(styles.row, className)}>
      <span className={cx(styles.id, pending && styles.pending)}>{id}</span>
      <div className={styles.input}>{children}</div>
      {actions && <span className={styles.actions}>{actions}</span>}
    </div>
  );
}
