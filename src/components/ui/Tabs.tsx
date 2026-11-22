// Tabs (docs/ui-guide.md, docs/ui/keel-components.css tabs-inline): inline tabs under the card top, 16/19.2; the
// current tab in accent with a 4 px bar; counts in a small pill. Tabs are links (each tab has its own address).
import Link from 'next/link';
import { cx } from './cx';
import styles from './Tabs.module.css';

export interface TabItem { href: string; label: string; count?: number; current?: boolean }

export function Tabs({ label, items }: { label: string; items: TabItem[] }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={cx(styles.tab, t.current && styles.current)} aria-current={t.current ? 'page' : undefined}>
          {t.label}
          {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
