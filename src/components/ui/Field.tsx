// Field (docs/ui-guide.md): label, Required or Optional in muted text, the input, a hint. A suggested value is
// italic at 85 % opacity with "Accept · Clear" under the field (pass them as `suggestion`).
import type { ReactNode } from 'react';
import { Hint } from './Tag';
import styles from './Field.module.css';

export interface FieldProps {
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  suggestion?: ReactNode;
  children: ReactNode;
}

export function Field({ label, required, optional, hint, error, suggestion, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}{required && <Hint>Required</Hint>}{optional && <Hint>Optional</Hint>}</span>
      {children}
      {suggestion && <span className={styles.suggestion}>{suggestion}</span>}
      {hint && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </label>
  );
}

/** The class for an input that holds a suggestion (italic, 85 % opacity). */
export { styles as fieldStyles };
