// The choice cards shared by Initialise and Project setup (docs/ui-guide.md, mock sources Start and SetupKeel):
// templates with their sections, and brainstorm styles.
import { parseSections } from '@/lib/brainstorm/sections';
import type { Style } from '@/lib/brainstorm/styles';
import { parseTemplateRef, readTemplate } from '@/lib/templates/library';
import { OptionCard, OptionGrid } from './ui/OptionCard';

export interface TemplateChoice { ref: string; name: string; sections: string }

/** A template option with its sections ("Problem*, Scope" with * for required). */
export function withSections(library: string, t: { ref: string; name: string }): TemplateChoice {
  const ref = parseTemplateRef(t.ref);
  const content = ref ? readTemplate(library, ref.id, ref.version) : undefined;
  const sections = content?.ok ? parseSections(content.value.content) : [];
  return { ...t, sections: sections.map((s) => `${s.heading}${s.required ? '*' : ''}`).join(', ') };
}

export function TemplateCards({ name, options, chosen, defaultRef, labelledBy, columns = 'three' }: {
  name: string; options: TemplateChoice[]; chosen?: string; defaultRef?: string; labelledBy: string; columns?: 'two' | 'three';
}) {
  const selected = options.some((o) => o.ref === chosen) ? chosen : options[0]?.ref;
  return (
    <OptionGrid radio labelledBy={labelledBy} columns={columns}>
      {options.map((t) => (
        <OptionCard key={t.ref} label={t.name} title={t.name} tag={t.ref === defaultRef ? 'Default' : undefined}
          foot={t.sections ? `Sections: ${t.sections} (* required)` : undefined}
          control={<input type="radio" name={name} value={t.ref} defaultChecked={t.ref === selected} aria-label={t.name} />} />
      ))}
    </OptionGrid>
  );
}

export function StyleCards({ styles, chosen, labelledBy }: { styles: Style[]; chosen?: string; labelledBy: string }) {
  const selected = styles.some((s) => s.ref === chosen) ? chosen : styles[0]?.ref;
  return (
    <OptionGrid radio labelledBy={labelledBy} columns="three">
      {styles.map((s, i) => (
        <OptionCard key={s.ref} label={s.name} title={s.name} tag={`${i === 0 ? 'Default · ' : ''}v${s.version}`} summary={s.description}
          control={<input type="radio" name="style" value={s.ref} defaultChecked={s.ref === selected} aria-label={s.name} />} />
      ))}
    </OptionGrid>
  );
}
