// Standards choice cards for Initialise and Project setup (owner decision, T6; docs/ui-guide.md OptionCard).
import { OptionCard, OptionGrid } from '@/components/ui/OptionCard';
import type { Standard } from '@/lib/standards/library';

export function StandardsPicker({ standards, chosen }: { standards: Standard[]; chosen: string[] }) {
  if (standards.length === 0) return <p>No standards in the library.</p>;
  return (
    <OptionGrid label="Standards" columns="two">
      {standards.map((s) => (
        <OptionCard key={s.ref} label={`${s.name} v${s.version}`} title={s.name} tag={`${s.owner} · v${s.version}`} summary={s.description}
          foot={`Applies to ${s.appliesTo.join(', ') || 'nothing yet'}`}
          control={<input type="checkbox" name="standards" value={s.ref} defaultChecked={chosen.includes(s.ref)} aria-label={`${s.name} v${s.version}`} />} />
      ))}
    </OptionGrid>
  );
}
