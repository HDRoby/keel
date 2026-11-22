// Generate spec: fills a spec template from the approved intent (owner decision, T6). Keel writes the
// Requirements table and scenario tags itself, so IDs stay traceable; the model writes the rest.
// Regenerating merges with the proposer's edits and raises conflicts that must be resolved before approval.
import { recordBaselineDecisions } from '../baseline/decisions';
import { fillSections, parseSections } from '../brainstorm/sections';
import { gateFor } from '../gates/rules';
import { projectState } from '../gates/approvals';
import { fail, ok, type Result } from '../result';
import { standardsFor, type Standard } from '../standards/library';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { readProject } from '../store/workspace';
import { parseFeatureDoc, type Step } from '../scenarios/gherkin';
import { acceptedScenarios, addSuggestions, SCENARIOS_FILE, suggestions } from '../scenarios/store';
import { chosenOption, DESIGN_FILE, readDesign, templateTopics, writeDesign, type Topic } from '../decisions/design';
import { approachSection, designSection, specWithDesign } from '../decisions/records';
import { repoFacts } from '../repo/facts';
import { mergeTopics, proposeDecisions } from './design';
import { parseTemplateRef, readTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { requirementStatements } from '../trace/parse';
import { conflictNote, mergeSections, readBaseline, writeBaseline, type Conflict } from './merge';
import { writeSection, type Writer } from './writer';

export type GenerateError = 'locked' | 'already-exists' | 'not-found' | 'unknown-template' | 'invalid-input' | 'not-draft';

/** The text under a "## " heading of a markdown body, or '' when there is none. */
function sectionOf(body: string, heading: string): string {
  return new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body)?.[1]?.trim() ?? '';
}

/** The spec's Requirements section: every REQ from the intent, with its source. */
export function requirementsTable(statements: Record<string, string>, source = 'Intent'): string {
  const rows = Object.entries(statements).map(([id, text]) => `| ${id} | ${text.replace(/\|/g, '\\|')} | ${source} |`);
  return ['| ID | Requirement | Source |', '| --- | --- | --- |', ...rows].join('\n');
}

/** One Gherkin scenario tagged with its requirement. Uses the model's scenario when it is well formed. */
export function scenarioFor(id: string, statement: string, written?: string): string {
  const stripped = written?.replace(/```[a-z]*\n?/g, '');
  const fromModel = stripped?.slice(Math.max(0, stripped.indexOf('Scenario:')));
  const usable = fromModel && /^\s*Scenario:/.test(fromModel) && /\bGiven\b/.test(fromModel) && /\bThen\b/.test(fromModel);
  const lines = usable
    ? fromModel.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    : [`Scenario: ${statement}`, `Given the situation ${id} is about`, `When the behaviour in ${id} is used`, `Then ${statement.charAt(0).toLowerCase()}${statement.slice(1)}`];
  return [`  @${id}`, ...lines.map((l, i) => (i === 0 ? `  ${l}` : `    ${l}`))].join('\n');
}

export function featureFile(title: string, scenarios: string[]): string {
  return `Feature: ${title}\n\n${scenarios.join('\n\n')}\n`;
}

/** The "Standards applied" section: the project's standards with versions and owners. */
export function standardsApplied(standards: Standard[]): string {
  return standards.length === 0
    ? 'None selected for this project.'
    : standards.map((s) => `- ${s.name} v${s.version} (\`${s.ref}\`, ${s.owner || 'no owner'})`).join('\n');
}

/** What the model checks the work against: the rules of the standards that apply to a stage. */
export function standardsSources(standards: Standard[]): string {
  return standards.length === 0 ? '' : `Standards to check against (name any conflict under Flagged concerns):\n\n${standards.map((s) => `${s.ref}:\n${s.rules}`).join('\n\n')}`;
}

interface ComposedSpec {
  title: string;
  body: string;
  proposals: { req: string; name: string; steps: Step[] }[];   // one scenario per requirement, as suggestions
  topics: Topic[];                                                // design topics with options (CR-0007), when the template has them
  feature?: string;      // only when the template has an Acceptance scenarios section
  extra: Record<string, unknown>;
}

/** A proposed scenario from the model's text (or a plain one when it is not well formed). */
export function proposalFor(id: string, statement: string, written?: string): { req: string; name: string; steps: Step[] } {
  const parsed = parseFeatureDoc(`Feature: x\n${scenarioFor(id, statement, written)}\n`).scenarios[0];
  return { req: id, name: parsed?.name ?? statement, steps: parsed?.steps ?? [] };
}

async function composeSpec(store: Store, templateRef: string, write: Writer, only?: string[], keep: Topic[] = []): Promise<Result<ComposedSpec, GenerateError>> {
  const intent = readDocument(store, 'docs/intent.md');
  if (!intent.ok) return fail('not-found', intent.message);
  const ref = parseTemplateRef(templateRef);
  const template = ref && readTemplate(store.root, ref.id, ref.version);
  if (!template?.ok || template.value.kind !== 'spec') return fail('unknown-template', `No spec template ${templateRef}`);
  const project = readProject(store.root);
  const chosen = project.ok ? project.value.standards : [];

  const { title } = intent.value.header;
  const statements = requirementStatements(intent.value.body);
  const sources = [`Intent ${intent.value.header.id} v${intent.value.header.version}:\n\n${intent.value.body}`, standardsSources(standardsFor(store.root, chosen, 'spec'))]
    .filter(Boolean).join('\n\n');
  const sections: Record<string, string[]> = {};
  const proposals: ComposedSpec['proposals'] = [];
  // Design as decision topics (CR-0007): options from the requirements, constraints, standards and the code.
  const declared = templateTopics(template.value.content);
  const proposed = declared.length ? await proposeDecisions({
    requirements: statements, constraints: sectionOf(intent.value.body, 'Constraints'), standards: standardsFor(store.root, chosen),
    facts: repoFacts(store.root), topics: declared.filter((t) => !keep.some((k) => k.title === t.title && chosenOption(k))),
  }, write) : [];
  const order = (t: Topic) => { const i = declared.findIndex((d) => d.title === t.title); return i < 0 ? declared.length : i; };
  const topics = declared.length ? mergeTopics(keep, proposed).sort((a, b) => order(a) - order(b)) : [];

  for (const { heading, guidance } of parseSections(template.value.content)) {
    if (heading === 'Requirements') {
      sections[heading] = [requirementsTable(statements)];
    } else if (heading === 'Acceptance scenarios') {
      // Proposed as suggestions in the Acceptance scenarios tab; they count once accepted (CR-0006).
      for (const [id, statement] of Object.entries(statements)) {
        if (only && !only.includes(id)) continue;
        const written = await write('documents', [
          { role: 'system', content: `Write one Gherkin scenario for ${id}: "${statement}". One behaviour, described as behaviour, not clicks. Reply with "Scenario:" and its Given, When and Then lines only.` },
          { role: 'user', content: sources },
        ]);
        proposals.push(proposalFor(id, statement, written));
      }
      sections[heading] = ['Edited in the Acceptance scenarios tab: at least one per requirement, tagged `@REQ-xxx`. Accepted scenarios are saved in `features/`.'];
    } else if (heading === 'Design' && declared.length) {
      sections[heading] = [designSection(topics)];
    } else if (heading === 'Approach' && declared.length) {
      sections[heading] = [approachSection(topics)];
    } else if (heading === 'Standards applied') {
      sections[heading] = [standardsApplied(standardsFor(store.root, chosen))];
    } else {
      const task = heading === 'Feasibility review' ? 'feasibility' : 'documents';
      sections[heading] = [await writeSection(write, task, { kind: 'spec', title, heading, guidance, sources })];
    }
  }
  return ok({
    title, proposals, topics,
    body: fillSections(renderTemplate(template.value.content, { title }).body, sections),
    extra: { from_intent: `${intent.value.header.id}@${intent.value.header.version}`, standards: chosen },
  });
}

/** Writes docs/spec.md from a spec template, and proposes one acceptance scenario per requirement as a suggestion. */
export async function generateSpec(store: Store, templateRef: string, write: Writer): Promise<Result<StoredDocument, GenerateError>> {
  const gate = gateFor(projectState(store), 'spec');
  if (!gate.available) return fail('locked', gate.reason ?? 'The spec stage is locked');
  if (readDocument(store, 'docs/spec.md').ok) return fail('already-exists', 'spec.md already exists');
  const composed = await composeSpec(store, templateRef, write);
  if (!composed.ok) return composed;
  const { title, body, proposals, extra } = composed.value;
  const created = await createDocument(store, { kind: 'spec', title, body, template: templateRef, extra: { ...extra, conflicts: [] } });
  if (!created.ok) return fail('invalid-input', created.message);
  await addSuggestions(store, proposals);
  if (composed.value.topics.length) writeDesign(store.root, { topics: composed.value.topics });
  await commitFiles(store.root, [...specBaselines(store.root, composed.value), ...(proposals.length ? [SCENARIOS_FILE] : []), ...(composed.value.topics.length ? [DESIGN_FILE] : [])], `Generation baseline for ${created.value.header.id} v1`);
  // A project started from a baseline: its current stack is recorded as the Language and framework decision (CR-0010).
  if ((await recordBaselineDecisions(store)).length) {
    const latest = readDocument(store, 'docs/spec.md');
    if (latest.ok) return ok(latest.value);
  }
  return created;
}

/**
 * Regenerates a draft spec as its next version. Sections merge three ways with what Keel generated last time:
 * edits stay, new text comes in, and pieces changed on both sides become conflicts that block approval until
 * resolved. Scenarios are proposed only for requirements that have none yet (accepted or suggested).
 */
export async function regenerateSpec(store: Store, write: Writer): Promise<Result<StoredDocument, GenerateError>> {
  const gate = gateFor(projectState(store), 'spec');
  if (!gate.available) return fail('locked', gate.reason ?? 'The spec stage is locked');
  const spec = readDocument(store, 'docs/spec.md');
  if (!spec.ok) return fail('not-found', spec.message);
  if (spec.value.header.status !== 'draft') return fail('not-draft', `spec.md is ${spec.value.header.status}; only a draft spec can be regenerated`);
  const intent = readDocument(store, 'docs/intent.md');
  const covered = new Set([...acceptedScenarios(store.root).flatMap((s) => s.requirements), ...suggestions(store.root).map((s) => s.req)]);
  const missing = Object.keys(intent.ok ? requirementStatements(intent.value.body) : {}).filter((id) => !covered.has(id));
  const design = readDesign(store.root);
  const composed = await composeSpec(store, spec.value.header.template, write, missing, design.topics);
  if (!composed.ok) return composed;
  const { body, proposals, extra } = composed.value;
  const dir = store.root;
  const mergedSections = mergeSections(readBaseline(dir, 'docs/spec.md') ?? '', spec.value.body, body);
  // Design and Approach always follow the decisions (CR-0007).
  const merged = composed.value.topics.length ? { ...mergedSections, body: specWithDesign(mergedSections.body, composed.value.topics) } : mergedSections;
  const conflicts: Conflict[] = [...merged.conflicts];

  const saved = await saveDocument(store, 'docs/spec.md', {
    body: merged.body,
    extra: { ...extra, conflicts },
    reason: `Regenerated from ${String(extra.from_intent)}${conflictNote(conflicts)}`,
  });
  if (!saved.ok) return fail('invalid-input', saved.message);
  await addSuggestions(store, proposals);
  if (composed.value.topics.length) writeDesign(dir, { ...design, topics: composed.value.topics });
  await commitFiles(dir, [...specBaselines(dir, composed.value), ...(proposals.length ? [SCENARIOS_FILE] : []), ...(composed.value.topics.length ? [DESIGN_FILE] : [])], `Regeneration baseline for ${saved.value.header.id} v${saved.value.header.version}`);
  return saved;
}

/** Records what Keel generated, for the next regeneration's merge, and returns the baseline paths. */
function specBaselines(dir: string, { body }: ComposedSpec): string[] {
  return [writeBaseline(dir, 'docs/spec.md', body)];
}
