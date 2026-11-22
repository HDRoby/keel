// Card (docs/ui-guide.md): white, radius 16, card shadow, padding 24; a title (h2) with an optional meta line and
// actions on the right. Labelled by its title, so it is a named region.
import { useId, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export interface CardProps {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** An accessible name when the card has no visible title. */
  label?: string;
  id?: string;
  padding?: 'normal' | 'long' | 'none';
  className?: string;
  children?: ReactNode;
}

export function Card({ title, meta, actions, label, id, padding = 'normal', className, children }: CardProps) {
  const titleId = useId();
  return (
    <section id={id} className={cx(styles.card, styles[padding], className)} aria-labelledby={title && !label ? titleId : undefined} aria-label={label}>
      {(title || actions) && (
        <div className={styles.head}>
          <div>
            {title && <h2 id={titleId} className={styles.title}>{title}</h2>}
            {meta && <p className={styles.meta}>{meta}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
