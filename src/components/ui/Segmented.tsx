// Segmented (docs/ui/keel-components.css switcher-small): two or three options in a bordered white box; the selected
// one filled with the accent.
// Each option is a link, so the choice is in the address.
import Link from 'next/link';
import { cx } from './cx';
import styles from './Segmented.module.css';

export function Segmented({ label, items }: { label: string; items: { href: string; label: string; current?: boolean }[] }) {
  return (
    <nav aria-label={label} className={styles.segmented}>
      {items.map((i) => <Link key={i.href} href={i.href} className={cx(styles.option, i.current && styles.current)} aria-current={i.current ? 'page' : undefined}>{i.label}</Link>)}
    </nav>
  );
}
