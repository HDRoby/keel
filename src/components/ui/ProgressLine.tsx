// ProgressLine (docs/ui-guide.md): "3 of 4 required filled", a 6 px bar (accent, ok when complete), a note under it.
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './ProgressLine.module.css';

export function ProgressLine({ value, total, label, note }: { value: number; total: number; label: ReactNode; note?: ReactNode }) {
  const done = total > 0 && value >= total;
  return (
    <div className={styles.progress}>
      <div className={styles.label}>{label}</div>
      <progress className={cx(styles.bar, done && styles.done)} value={value} max={Math.max(total, 1)} aria-label={typeof label === 'string' ? label : undefined} />
      {note && <div className={styles.note}>{note}</div>}
    </div>
  );
}
