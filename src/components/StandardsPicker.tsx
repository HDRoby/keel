// Standards choice cards for Start and Project setup (owner decision, T6).
import type { Standard } from '@/lib/standards/library';

export function StandardsPicker({ standards, chosen }: { standards: Standard[]; chosen: string[] }) {
  return (
    <fieldset className="bare">
      <legend className="visually-hidden">Standards</legend>
      {standards.length === 0 && <p>No standards in the library.</p>}
      <div className="options">
        {standards.map((s) => (
          <label key={s.ref} className="option">
            <span className="option-tag">{s.owner} · v{s.version}</span>
            <input type="checkbox" name="standards" value={s.ref} defaultChecked={chosen.includes(s.ref)} aria-label={`${s.name} v${s.version}`} />
            <span className="option-title">{s.name} v{s.version}</span>
            <span className="option-text">{s.description}</span>
            <span className="option-foot">Applies to {s.appliesTo.join(', ') || 'nothing yet'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
