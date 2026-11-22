// The one place icons come from (docs/ui-guide.md): Material Symbols Outlined, self-hosted from the
// material-symbols package (imported in the root layout), so Keel works offline. Decorative: hidden from screen readers.
import styles from './Icons.module.css';

export type IconTone = 'ok' | 'accent' | 'muted' | 'warn' | 'danger' | 'inherit';

export function Icon({ name, tone = 'inherit', size = 20, filled = false }: { name: string; tone?: IconTone; size?: 16 | 18 | 20 | 24; filled?: boolean }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${styles.icon} ${styles[tone]} ${styles[`s${size}`]} ${filled ? styles.filled : ''}`}>{name}</span>;
}

export const CheckCircle = () => <Icon name="check_circle" tone="ok" />;
export const Current = () => <Icon name="radio_button_checked" tone="accent" />;
export const Open = () => <Icon name="radio_button_unchecked" tone="muted" />;
export const Lock = () => <Icon name="lock" tone="muted" />;
export const OutOfDate = () => <Icon name="error" tone="warn" />;
export const Pencil = () => <Icon name="edit" size={16} />;
export const Bulb = () => <Icon name="description" />;
export const Book = () => <Icon name="folder" />;
export const Gear = () => <Icon name="settings" />;
