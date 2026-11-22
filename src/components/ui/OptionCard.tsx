// OptionCard (docs/ui-guide.md): a button-like card, radius 8, padding 12; selected: accent-soft background and
// accent border. Title, optional "Recommended" tag, summary, "+ advantage" (ok), "− drawback" (warn), a fit line
// (ok or danger) and "Serves REQ-…". The radio or checkbox inside makes it a form control.
import type { ReactNode } from 'react';
import { Tag } from './Tag';
import { cx } from './cx';
import styles from './OptionCard.module.css';

export interface OptionCardProps {
  control: ReactNode;          // <input type="radio" …> or <input type="checkbox" …>
  title: ReactNode;
  label?: string;              // accessible name of the control, when the title is not plain text
  tag?: ReactNode;
  recommended?: boolean;
  summary?: ReactNode;
  pro?: ReactNode;
  con?: ReactNode;
  fit?: { good: boolean; text: ReactNode };
  serves?: string[];
  foot?: ReactNode;
  children?: ReactNode;
}

export function OptionCard({ control, title, label, tag, recommended, summary, pro, con, fit, serves, foot, children }: OptionCardProps) {
  return (
    <label className={styles.card} aria-label={label}>
      <span className={styles.head}>
        {control}
        <span className={styles.title}>{title}</span>
        {recommended && <Tag tone="accent">Recommended</Tag>}
        {tag && <span className={styles.tag}>{tag}</span>}
      </span>
      {summary && <span className={styles.summary}>{summary}</span>}
      {pro && <span className={styles.pro}>+ {pro}</span>}
      {con && <span className={styles.con}>− {con}</span>}
      {fit && <span className={cx(styles.fit, fit.good ? styles.good : styles.bad)}>{fit.text}</span>}
      {serves && serves.length > 0 && <span className={styles.meta}>Serves {serves.join(', ')}</span>}
      {foot && <span className={styles.meta}>{foot}</span>}
      {children}
    </label>
  );
}

/** A grid of option cards. */
export function OptionGrid({ label, children, columns = 'auto' }: { label?: string; children: ReactNode; columns?: 'auto' | 'one' }) {
  return <fieldset className={cx(styles.grid, columns === 'one' && styles.one)} aria-label={label}>{children}</fieldset>;
}
