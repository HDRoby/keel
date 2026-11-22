// Tag (docs/ui/keel-components.css chips): 14/20, height 24, padding 2 x 8, radius 4, a soft background with the
// matching text colour; `outline` for IDs such as REQ-005.
// Required and Optional are plain muted text, not a pill: use <Hint> for them.
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Tag.module.css';

export type TagTone = 'neutral' | 'accent' | 'outline' | 'ok' | 'warn' | 'danger' | 'link' | 'handoff';

export function Tag({ tone = 'neutral', title, children }: { tone?: TagTone; title?: string; children: ReactNode }) {
  return <span className={cx(styles.tag, styles[tone])} data-tag={tone} title={title}>{children}</span>;
}

/** Required / Optional and other muted words next to a label. */
export function Hint({ children }: { children: ReactNode }) {
  return <span className={styles.hint}>{children}</span>;
}
