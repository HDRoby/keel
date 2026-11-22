// changes/README.md (REQ-015, CR-0013): generated from the changes index template and rewritten whenever a request is
// raised, approved, rejected, packaged or applied, unless the project turns it off (changes_index: off keeps your own).
import { fillSections } from '../brainstorm/sections';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/db';
import { commitFiles } from '../store/git';
import { readProject, today } from '../store/workspace';
import { chosenTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { idClashes } from './links';
import { computeStatus, dependencyOrder, listChanges, nextToApply, progressLabel } from './store';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/** A literal, not built from CHANGES_DIR: store.ts imports this module, so its constants are not ready yet here. */
export const CHANGES_INDEX = 'changes/README.md';

/** The index's markdown; undefined when the project has no changes index template. */
export function changesIndex(store: Pick<Store, 'root' | 'now'>): string | undefined {
  const project = readProject(store.root);
  const template = chosenTemplate(store.root, 'changes-index', project.ok ? project.value.templates : {});
  if (!template) return undefined;
  const all = listChanges(store.root);
  const status = (id: string) => {
    const cr = all.find((c) => c.id === id);
    return cr ? computeStatus(cr, all) : undefined;
  };
  const applied = all.filter((c) => status(c.id)?.kind === 'applied');
  const ordered = [...dependencyOrder(all.filter((c) => !['applied', 'rejected'].includes(status(c.id)?.kind ?? ''))), ...applied];
  const next = nextToApply(all);
  const clashes = idClashes(store.root, all);
  const rows = ordered.map((c, i) => `| ${i + 1} | [${c.id}](${c.id}/${c.id}.md) | ${c.title} | ${c.tasks.length ? c.tasks.map((t) => t.id).join(', ') : progressLabel(c)} | ${status(c.id)?.label ?? c.status} |`);
  const requirements = [...new Map(ordered.filter((c) => status(c.id)?.kind !== 'applied').flatMap((c) => c.requirements.map((r) => [r, c.id] as const))).entries()];
  const body = fillSections(renderTemplate(template.content, {
    date: today(store as Store),
    status_line: `${applied.length} applied, ${ordered.length - applied.length} open.${next ? ` Next: ${next.id}.` : ''}`,
  }).body, {
    Order: [rows.length ? ['| Order | Change request | What it does | Tasks | Status |', '| --- | --- | --- | --- | --- |', ...rows].join('\n') : 'No change requests yet.'],
    'Requirement IDs': [requirements.length
      ? ['| ID | Requirement | Changed by |', '| --- | --- | --- |', ...requirements.map(([req, by]) => `| ${req} | ${clashes.some((c) => c.req === req) ? 'Clash: named as new by more than one request' : 'See the change request'} | ${all.filter((c) => c.requirements.includes(req)).map((c) => c.id).join(', ') || by} |`)].join('\n')
      : 'No open request changes a requirement.'],
    'Run them': ['One at a time (recommended): paste `CR-NNNN/PROMPT.md` into your coding agent, review, merge, then the next. Keel shows each request\'s status on its Changes page.'],
  });
  return `${body.trimEnd()}\n`;
}

/** Rewrites changes/README.md and commits it (unless `commit: false`), when the project keeps it up to date. */
export async function writeChangesIndex(store: Pick<Store, 'root' | 'now'>, options: { commit?: boolean } = {}): Promise<boolean> {
  const project = readProject(store.root);
  if (!project.ok || project.value.changesIndex === 'off' || !existsSync(join(store.root, 'changes'))) return false;
  const text = changesIndex(store);
  if (!text) return false;
  writeFileAtomic(join(store.root, CHANGES_INDEX), text);
  if (options.commit !== false) await commitFiles(store.root, [CHANGES_INDEX], 'Update changes/README.md');
  return true;
}
