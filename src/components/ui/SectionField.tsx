// SectionField (docs/ui-guide.md): a bordered box with a header row (status icon, label, Required or Optional,
// Reviewing…, a New comment tag), a Comment above the input, then the input. Focused: the active ring.
import type { ReactNode } from 'react';
import { Icon } from '../Icons';
import { Hint } from './Tag';
import { cx } from './cx';
import styles from './SectionField.module.css';

export interface SectionFieldProps {
  id?: string;
  label: string;
  filled?: boolean;
  missing?: boolean;
  required?: boolean;
  active?: boolean;
  extra?: ReactNode;        // Reviewing…, New comment, actions
  comment?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SectionField({ id, label, filled, missing, required, active, extra, comment, className, children }: SectionFieldProps) {
  return (
    <section id={id} aria-label={label} className={cx(styles.section, active && styles.active, className)}>
      <h3 className={styles.head}>
        <span className={styles.status} aria-label={filled ? 'Filled' : 'Empty'}>
          {filled ? <Icon name="check_circle" tone="ok" /> : <Icon name="radio_button_unchecked" tone={missing ? 'danger' : 'muted'} />}
        </span>
        <span className={styles.label}>{label}</span>
        <Hint>{required ? 'Required' : 'Optional'}</Hint>
        {extra && <span className={styles.extra}>{extra}</span>}
      </h3>
      {comment}
      <div className={styles.input}>{children}</div>
    </section>
  );
}
