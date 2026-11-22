// Choice group: the Segmented look (docs/ui/keel-components.css switcher-small) for a choice inside a form, as radio
// buttons, so the choice is posted with the form instead of being in the address.
import { cx } from './cx';
import styles from './ChoiceGroup.module.css';

export function ChoiceGroup({ label, name, options, value }: { label: string; name: string; options: { value: string; label: string }[]; value: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.group}>
      {options.map((o) => (
        <label key={o.value} className={cx(styles.option)}>
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === value} className={styles.input} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
