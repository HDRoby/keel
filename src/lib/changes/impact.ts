// The impact of a change request on later documents, by requirement ID (REQ-014, task R18): which documents,
// tasks and scenarios a change to the intent or the spec reaches, from the traceability index.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildTrace, impactOf, type Impact, type Trace } from '../trace/index';

export interface AffectedDocument {
  document: string;            // e.g. docs/plan.md
  label: string;               // e.g. plan.md
  stage: 'spec' | 'plan';
  requirements: string[];      // the changed requirements this document carries
  items: string[];             // tasks and scenarios it holds that the change reaches, with their REQ IDs
}

export interface ChangeImpact {
  documents: AffectedDocument[];
  impact: Impact;
}

const LATER: Record<string, { document: string; label: string; stage: 'spec' | 'plan' }[]> = {
  'docs/intent.md': [{ document: 'docs/spec.md', label: 'spec.md', stage: 'spec' }, { document: 'docs/plan.md', label: 'plan.md', stage: 'plan' }],
  'docs/spec.md': [{ document: 'docs/plan.md', label: 'plan.md', stage: 'plan' }],
};

/**
 * The documents after `source` that exist in the folder, with the tasks (plan) and scenarios (spec) the changed
 * requirements reach. `added` counts new requirements without an ID yet: every later document is affected then.
 */
export function changeImpact(root: string, source: string, requirements: string[], added = 0, trace: Trace = buildTrace(root)): ChangeImpact {
  const impact = impactOf(trace, requirements);
  const documents = (LATER[source] ?? []).filter((d) => existsSync(join(root, d.document))).map((d) => {
    const items = d.stage === 'plan'
      ? impact.tasks.map((t) => `Task ${t.id} · ${t.title} (${t.requirements.join(', ')})`)
      : impact.scenarios.map((s) => `Scenario ${s.label} (${s.requirements.join(', ')})`);
    return { ...d, requirements: requirements.filter((id) => trace.requirements[id]), items: added ? [...items, `${added} new requirement${added === 1 ? '' : 's'}`] : items };
  });
  return { documents: documents.filter((d) => d.requirements.length || d.items.length), impact };
}

/** Significant when requirements are added, removed or changed; minor for wording only. */
export function sizeOf(requirements: string[], added: number): 'minor' | 'significant' {
  return requirements.length > 0 || added > 0 ? 'significant' : 'minor';
}
