// Documents out of date while a significant change request is approved but not applied (REQ-005, task R18).
import type { Store } from '../store/store';
import { computeStatus, isApplied, listChanges } from './store';

export type Stage = 'intent' | 'spec' | 'plan' | 'handoff';

const STAGE_OF: Record<string, Stage> = { 'docs/intent.md': 'intent', 'docs/spec.md': 'spec', 'docs/plan.md': 'plan', INT: 'intent', SPC: 'spec', PLN: 'plan' };

/**
 * Stages out of date (REQ-005): those affected by an approved, significant request that is not applied. For a Keel
 * request, the documents not resolved yet (and Handoff while any is open); for a hand-written one marked
 * significant, the documents in its `affects`.
 */
export function outOfDate(store: Pick<Store, 'root'>): Partial<Record<Stage, string[]>> {
  const all = listChanges(store.root);
  const out: Partial<Record<Stage, string[]>> = {};
  const add = (stage: Stage | undefined, id: string) => {
    if (stage && !(out[stage] ?? []).includes(id)) out[stage] = [...(out[stage] ?? []), id];
  };
  for (const cr of all) {
    if (cr.status !== 'approved' || cr.size !== 'significant' || isApplied(cr) || computeStatus(cr, all).kind === 'unreadable') continue;
    if (cr.origin === 'keel') {
      const open = cr.impact.filter((i) => i.decision === 'pending' || i.decision === 'later');
      open.forEach((i) => add(STAGE_OF[i.document], cr.id));
      if (open.length) add('handoff', cr.id);
    } else {
      cr.affects.forEach((a) => add(STAGE_OF[a.slice(0, 3)], cr.id));
      add('handoff', cr.id);
    }
  }
  return out;
}
