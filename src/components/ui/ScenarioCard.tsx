// ScenarioCard, view mode (docs/ui-guide.md): name (500), a tag, an Edit link, then the steps with the keyword in a
// 48 px accent column. The edit mode is the form in the Spec's scenario editor, inside the same card.
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './ScenarioCard.module.css';

export function ScenarioCard({ name, label, tag, actions, steps, suggested, children }: {
  name: ReactNode; label?: string; tag?: ReactNode; actions?: ReactNode;
  steps?: { keyword: string; text: string }[]; suggested?: boolean; children?: ReactNode;
}) {
  return (
    <article className={cx(styles.card, suggested && styles.suggested)} aria-label={label}>
      <div className={styles.head}>
        <span className={styles.name}>{name}</span>
        {tag}
        {actions && <span className={styles.actions}>{actions}</span>}
      </div>
      {steps && steps.length > 0 && (
        <div className={styles.steps}>
          {steps.map((s, i) => <div key={i} className={styles.step}><span className={styles.keyword}>{s.keyword}</span><span>{s.text}</span></div>)}
        </div>
      )}
      {children}
    </article>
  );
}

/** The edit rows: keyword select, text input and remove. */
export function StepRow({ children }: { children: ReactNode }) {
  return <div className={styles.editRow}>{children}</div>;
}
