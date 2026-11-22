// Fills Explore's sections as the user would type them: text for a section, rows for a list section.
// Used by tests and by the scenarios to set up a project through the same functions the page uses.
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { applyEdits, loadContext, writeExplore, type BrainstormError, type Explore } from './session';

export function fillSections(store: Pick<Store, 'root'>, values: Record<string, string | string[]>): Result<Explore, BrainstormError> {
  const context = loadContext(store);
  if (!context.ok) return context;
  // Rows keep the ID of the row in the same place, as the page sends them.
  const idAt = (key: string, i: number) => context.value.state.sections.find((s) => s.key === key)?.rows?.[i]?.id;
  const edited = applyEdits(context.value, Object.entries(values).map(([key, value]) => (
    Array.isArray(value) ? { key, rows: value.map((text, i) => ({ text, ...(idAt(key, i) ? { id: idAt(key, i) } : {}) })) } : { key, value }
  )));
  if (!edited.ok) return edited;
  if (!edited.value) return fail('no-change', 'Nothing to fill');
  writeExplore(store, edited.value);
  return ok(edited.value);
}
