// Notice (docs/ui/keel-components.css notice-*): a white box with a light border and a coloured 8 px bar on the left;
// a title (500) and text. Kinds info, success, warning and danger set the bar's colour.
import type { AriaRole, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Notice.module.css';

export type NoticeKind = 'info' | 'success' | 'warning' | 'danger';

export function Notice({ kind = 'info', title, role, label, actions, children }: { kind?: NoticeKind; title?: ReactNode; role?: AriaRole; label?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx(styles.notice, styles[kind])} role={role ?? (kind === 'danger' ? 'alert' : undefined)} aria-label={label}>
      <span className={styles.bar} aria-hidden="true" />
      <div className={styles.body}>
        {title && <strong className={styles.title}>{title}</strong>}
        {children && <div className={styles.text}>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
