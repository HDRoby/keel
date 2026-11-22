// MetaGrid (docs/ui-guide.md): a muted box of key/value pairs (key muted, value mono or 14/20).
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './MetaGrid.module.css';

export function MetaGrid({ items, label }: { items: { key: string; value: ReactNode; mono?: boolean }[]; label?: string }) {
  return (
    <dl className={styles.grid} aria-label={label}>
      {items.map((i) => <div key={i.key} className={styles.item}><dt>{i.key}</dt><dd className={cx(i.mono && styles.mono)}>{i.value}</dd></div>)}
    </dl>
  );
}
