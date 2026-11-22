// The text of a change request raised by Keel (REQ-015, CR-0013), written from the change request template chosen
// for the project. Why comes from the reason; What changes and Done when from the assistant's draft when there is one
// (suggestions the user edits before approval); Requirement changes and Impact are filled from the request.
import { fillSections } from '../brainstorm/sections';
import type { Store } from '../store/store';
import { readProject } from '../store/workspace';
import { renderTemplate } from '../templates/render';
import { chosenTemplate } from '../templates/library';

export interface ChangeDraft { why?: string; whatChanges?: string; doneWhen?: string }

export interface BodyInput {
  id: string;
  title: string;
  reason: string;
  requirements: string[];
  impact: { document: string }[];
  draft?: ChangeDraft;
  requirementChanges?: { id: string; change: string; text: string }[];
  impactRows?: { area: string; requirements: string[]; what: string }[];
}

const NOT_YET = '_Not written yet._';

/** The request's markdown from the chosen template; undefined when the project has no change request template. */
export function changeBody(store: Pick<Store, 'root'>, input: BodyInput): { body: string; template: string } | undefined {
  const project = readProject(store.root);
  const template = chosenTemplate(store.root, 'change', project.ok ? project.value.templates : {});
  if (!template) return undefined;
  const drafted = (text?: string) => (text?.trim() ? `${text.trim()}\n\n_Drafted by the assistant: edit it before approval._` : NOT_YET);
  const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const requirementRows = input.requirementChanges?.length
    ? ['| ID | Change |', '| --- | --- |', ...input.requirementChanges.map((r) => `| ${r.id} | ${r.change === 'new' ? 'New' : r.change === 'removed' ? 'Remove' : 'Change'}: "${cell(r.text)}" |`)].join('\n')
    : input.requirements.length
    ? ['| ID | Change |', '| --- | --- |', ...input.requirements.map((r) => `| ${r} | ${NOT_YET} |`)].join('\n')
    : 'None named yet.';
  const impactRows = input.impactRows?.length
    ? ['| Area | Requirements | What happens |', '| --- | --- | --- |', ...input.impactRows.map((i) => `| ${cell(i.area)} | ${i.requirements.join(', ') || '—'} | ${cell(i.what)} |`)].join('\n')
    : input.impact.length
    ? ['| Area | Requirements | What happens |', '| --- | --- | --- |', ...input.impact.map((i) => `| \`${i.document}\` | ${input.requirements.join(', ') || '—'} | Out of date until resolved: Update, Still valid or Later |`)].join('\n')
    : 'No later document is affected yet.';
  const body = fillSections(renderTemplate(template.content, { cr_id: input.id, title: input.title.trim() }).body, {
    // change-request@2
    Why: [input.draft?.why?.trim() || input.reason.trim() || NOT_YET],
    'What changes': [drafted(input.draft?.whatChanges)],
    'Requirement changes': [requirementRows],
    'Impact by requirement': [impactRows],
    Decisions: ['None yet.'],
    'Done when': [drafted(input.draft?.doneWhen)],
    // change-request@1
    Reason: [input.reason.trim() || NOT_YET],
    'What changed': [drafted(input.draft?.whatChanges)],
    Impact: [impactRows],
    Decision: ['Waiting for approval.'],
  });
  return { body, template: template.ref };
}
