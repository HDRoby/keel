// CodeBlock (docs/ui-guide.md): dark background, radius 8 (12 for a terminal), padding 16 x 20, mono 12/19, wrapped.
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './CodeBlock.module.css';

export function CodeBlock({ label, terminal, children }: { label?: string; terminal?: boolean; children: ReactNode }) {
  return <pre className={cx(styles.code, terminal && styles.terminal)} aria-label={label} tabIndex={label ? 0 : undefined}>{children}</pre>;
}
