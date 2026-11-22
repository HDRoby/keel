// The library page pattern (docs/ui-guide.md › Page patterns; mock sources Templates, Styles, Standards): the folder
// path in the header, groups by kind on the left as item cards, the selected item on the right.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ErrorAlert, NotInitialised, Topbar } from './Shell';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { cx } from './ui/cx';
import styles from './LibraryLayout.module.css';

export interface LibraryItem { href: string; label: string; title: ReactNode; tag?: ReactNode; meta?: ReactNode; current?: boolean }
export interface LibraryGroup { label: string; items: LibraryItem[] }

export function LibraryLayout({ screen, title, meta, description, groups, initialised, what, error, children }: {
  screen: string; title: string; meta?: ReactNode; description: ReactNode; groups: LibraryGroup[];
  initialised: boolean; what: string; error?: string; children: ReactNode;
}) {
  return (
    <>
      <Topbar title={screen} />
      <main className="content">
        <PageHeader title={title} meta={meta} description={description} />
        {!initialised && <NotInitialised what={what} />}
        <ErrorAlert error={error} />
        <div className={styles.columns}>
          <Card label={`${screen} list`} className={styles.list}>
            {groups.filter((g) => g.items.length > 0).map((g) => (
              <section key={g.label} aria-label={g.label} className={styles.group}>
                <h2 className={styles.overline}>{g.label}</h2>
                <ul className={styles.items}>
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} aria-label={i.label} aria-current={i.current ? 'page' : undefined} className={cx(styles.item, i.current && styles.current)}>
                        <span className={styles.itemHead}><span className={styles.itemTitle}>{i.title}</span>{i.tag && <span className={styles.tag}>{i.tag}</span>}</span>
                        {i.meta && <span className={styles.meta}>{i.meta}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>
          <div className={styles.detail}>{children}</div>
        </div>
      </main>
    </>
  );
}
