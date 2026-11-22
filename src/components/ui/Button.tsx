// Button (docs/ui-guide.md, docs/ui/states.md): min-height 36 (28 small), padding 7 x 15, radius 8, 14/20, weight 400.
// Variants primary, outline, secondary and text; danger colours any of them. A disabled button keeps its label.
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'outline' | 'secondary' | 'text';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  danger?: boolean;
  small?: boolean;
  icon?: ReactNode;
}

export function buttonClass({ variant = 'outline', danger, small }: { variant?: ButtonVariant; danger?: boolean; small?: boolean }, className?: string): string {
  return cx(styles.button, styles[variant], danger && styles.danger, small && styles.small, className);
}

export function Button({ variant = 'outline', danger, small, icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, danger, small }, className)} {...rest}>{icon}{children}</button>;
}

/** A link that looks like a button (for navigation, never for actions). */
export function ButtonLink({ href, variant = 'outline', small, children, ...rest }: { href: string; variant?: ButtonVariant; small?: boolean; children: ReactNode; 'aria-label'?: string; download?: boolean | string }) {
  return <Link href={href} className={buttonClass({ variant, small })} {...rest}>{children}</Link>;
}
