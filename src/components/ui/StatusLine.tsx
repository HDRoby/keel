// StatusLine (docs/ui-guide.md): a muted box with a coloured dot (pulsing while busy) and one line of meta text,
// with an optional legend on the right. A live status for screen readers.
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './StatusLine.module.css';

export type StatusTone = 'ok' | 'busy' | 'warn' | 'danger' | 'muted';

export function StatusLine({ tone = 'ok', label, legend, children }: { tone?: StatusTone; label?: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.line}>
      <div role="status" aria-label={label} className={styles.text}>
        <span className={cx(styles.dot, styles[tone])} aria-hidden="true" />
        <span>{children}</span>
      </div>
      {legend && <div className={styles.legend}>{legend}</div>}
    </div>
  );
}
