'use client';
// A side-menu group (docs/ui-guide.md › Shell): an icon heading, then links; the current link has accent text and a
// bar on the left, and its group heading turns accent.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';
import styles from './Shell.module.css';

const isCurrent = (path: string, href: string, exact: boolean) => (exact || href === '/' ? path === href : path === href || path.startsWith(`${href}/`));

export function NavGroup({ label, name, icon, links, exact = false }: { label: string; name: string; icon: string; links: [string, string][]; exact?: boolean }) {
  const path = usePathname();
  const active = links.some(([href]) => isCurrent(path, href, exact));
  return (
    <nav aria-label={name} className={styles.group}>
      <div className={`${styles.heading} ${active ? styles.activeHeading : ''}`}><Icon name={icon} /> <span>{label}</span></div>
      <ul className={styles.links}>
        {links.map(([href, text]) => {
          const current = isCurrent(path, href, exact);
          return <li key={href}><Link href={href} className={styles.link} aria-current={current ? 'page' : undefined}>{text}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
