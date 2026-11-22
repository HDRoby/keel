// LinkButton (docs/ui-guide.md): text only, 12/16, weight 500; accent, muted (Clear, Dismiss, Cancel) or danger
// (Delete). A link when it has an href, otherwise a button (for a form action).
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './LinkButton.module.css';

type Tone = 'accent' | 'muted' | 'danger';

export function LinkButton({ href, tone = 'accent', className, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { href?: string; tone?: Tone; children: ReactNode }) {
  const cls = cx(styles.link, styles[tone], className);
  if (href) return <Link href={href} className={cls} aria-label={rest['aria-label']}>{children}</Link>;
  return <button type={type} className={cls} {...rest}>{children}</button>;
}
