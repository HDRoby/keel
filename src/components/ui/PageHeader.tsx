// Page header (docs/ui-guide.md): the project title, a meta line, an optional "Project setup" link and description
// on the left; the page actions on the right (at most one primary button). Wraps on narrow screens.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '../Icons';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  setupLink?: boolean;
  actions?: ReactNode;
}

export function PageHeader({ title, meta, description, setupLink, actions }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {meta && <span className={styles.meta}>{meta}</span>}
          {setupLink && <Link href="/setup" className={styles.setup}><Icon name="edit" size={16} /> Project setup</Link>}
        </div>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
