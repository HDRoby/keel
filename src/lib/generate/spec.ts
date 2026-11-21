// Generate spec: fills a spec template from the approved intent (owner decision, T6). Keel writes the
// Requirements table and scenario tags itself, so IDs stay traceable; the model writes the rest.
// Regenerating merges with the proposer's edits and raises conflicts that must be resolved before approval.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fillSections, parseSections } from '../brainstorm/sections';
import { gateFor } from '../gates/rules';
import { projectState } from '../gates/approvals';
import { fail, ok, type Result } from '../result';
import { standardsFor, type Standard } from '../standards/library';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { projectDir, readProject } from '../store/workspace';
import { parseTemplateRef, readTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { requirementStatements } from '../trace/parse';
import { conflictNote, mergePiece, mergeSections, readBaseline, writeBaseline, type Conflict } from './merge';
import { writeSection, type Writer } from './writer';

export type GenerateError = 'locked' | 'already-exists' | 'not-found' | 'unknown-template' | 'invalid-input' | 'not-draft';

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
  feature?: string;      // only when the template has an Acceptance scenarios section
  featurePath: string;
  extra: Record<string, unknown>;
}

async function composeSpec(store: Store, slug: string, templateRef: string, write: Writer): Promise<Result<ComposedSpec, GenerateError>> {
  const intent = readDocument(store, slug, 'docs/intent.md');
  if (!intent.ok) return fail('not-found', intent.message);
  const ref = parseTemplateRef(templateRef);
  const template = ref && readTemplate(store.home, ref.id, ref.version);
  if (!template?.ok || template.value.kind !== 'spec') return fail('unknown-template', `No spec template ${templateRef}`);
  const project = readProject(slug, store.home);
  const chosen = project.ok ? project.value.standards : [];

  const { title } = intent.value.header;
  const statements = requirementStatements(intent.value.body);
  const featurePath = `features/${slug}.feature`;
  const sources = [`Intent ${intent.value.header.id} v${intent.value.header.version}:\n\n${intent.value.body}`, standardsSources(standardsFor(store.home, chosen, 'spec'))]
    .filter(Boolean).join('\n\n');
  const sections: Record<string, string[]> = {};
  let feature: string | undefined;

  for (const { heading, guidance } of parseSections(template.value.content)) {
    if (heading === 'Requirements') {
      sections[heading] = [requirementsTable(statements)];
    } else if (heading === 'Acceptance scenarios') {
      const scenarios: string[] = [];
      for (const [id, statement] of Object.entries(statements)) {
        const written = await write('documents', [
          { role: 'system', content: `Write one Gherkin scenario for ${id}: "${statement}". One behaviour, described as behaviour, not clicks. Reply with "Scenario:" and its Given, When and Then lines only.` },
          { role: 'user', content: sources },
        ]);
        scenarios.push(scenarioFor(id, statement, written));
      }
      feature = featureFile(title, scenarios);
      sections[heading] = [`Saved to \`${featurePath}\`.\n\n\`\`\`gherkin\n${feature}\`\`\``];
    } else if (heading === 'Standards applied') {
      sections[heading] = [standardsApplied(standardsFor(store.home, chosen))];
    } else {
      const task = heading === 'Feasibility review' ? 'feasibility' : 'documents';
      sections[heading] = [await writeSection(write, task, { kind: 'spec', title, heading, guidance, sources })];
    }
  }
  return ok({
    title, feature, featurePath,
    body: fillSections(renderTemplate(template.value.content, { title }).body, sections),
    extra: { from_intent: `${intent.value.header.id}@${intent.value.header.version}`, standards: chosen },
  });
}

/** Writes docs/spec.md from a spec template, and the acceptance scenarios to features/<slug>.feature. */
export async function generateSpec(store: Store, slug: string, templateRef: string, write: Writer): Promise<Result<StoredDocument, GenerateError>> {
  const gate = gateFor(projectState(store, slug), 'spec');
  if (!gate.available) return fail('locked', gate.reason ?? 'The spec stage is locked');
  if (readDocument(store, slug, 'docs/spec.md').ok) return fail('already-exists', 'spec.md already exists');
  const composed = await composeSpec(store, slug, templateRef, write);
  if (!composed.ok) return composed;
  const { title, body, feature, featurePath, extra } = composed.value;
  const created = await createDocument(store, slug, { kind: 'spec', title, body, template: templateRef, extra: { ...extra, conflicts: [] } });
  if (!created.ok) return fail('invalid-input', created.message);
  const dir = projectDir(slug, store.home);
  if (feature) writeFeature(dir, featurePath, feature);
  await commitFiles(dir, [...(feature ? [featurePath] : []), ...specBaselines(dir, composed.value)], `Generation baseline for ${created.value.header.id} v1`);
  return created;
}

/**
 * Regenerates a draft spec as its next version. Sections and the feature file merge three ways with
 * what Keel generated last time: edits stay, new text comes in, and pieces changed on both sides
 * become conflicts that block approval until resolved.
 */
export async function regenerateSpec(store: Store, slug: string, write: Writer): Promise<Result<StoredDocument, GenerateError>> {
  const gate = gateFor(projectState(store, slug), 'spec');
  if (!gate.available) return fail('locked', gate.reason ?? 'The spec stage is locked');
  const spec = readDocument(store, slug, 'docs/spec.md');
  if (!spec.ok) return fail('not-found', spec.message);
  if (spec.value.header.status !== 'draft') return fail('not-draft', `spec.md is ${spec.value.header.status}; only a draft spec can be regenerated`);
  const composed = await composeSpec(store, slug, spec.value.header.template, write);
  if (!composed.ok) return composed;
  const { body, feature, featurePath, extra } = composed.value;
  const dir = projectDir(slug, store.home);
  const merged = mergeSections(readBaseline(dir, 'docs/spec.md') ?? '', spec.value.body, body);
  const featureNow = existsSync(join(dir, featurePath)) ? readFileSync(join(dir, featurePath), 'utf8') : undefined;
  const featureMerge = feature === undefined ? { value: featureNow, conflict: false } : mergePiece(readBaseline(dir, featurePath), featureNow, feature);
  const conflicts: Conflict[] = [...merged.conflicts];
  if (featureMerge.conflict) conflicts.push({ kind: 'file', name: featurePath, mine: featureNow ?? '', theirs: feature ?? '' });

  const saved = await saveDocument(store, slug, 'docs/spec.md', {
    body: merged.body,
    extra: { ...extra, conflicts },
    reason: `Regenerated from ${String(extra.from_intent)}${conflictNote(conflicts)}`,
  });
  if (!saved.ok) return fail('invalid-input', saved.message);
  if (featureMerge.value !== undefined && featureMerge.value !== featureNow) writeFeature(dir, featurePath, featureMerge.value);
  const featureFiles = existsSync(join(dir, featurePath)) ? [featurePath] : [];
  await commitFiles(dir, [...featureFiles, ...specBaselines(dir, composed.value)], `Regeneration baseline for ${saved.value.header.id} v${saved.value.header.version}`);
  return saved;
}

function writeFeature(dir: string, featurePath: string, content: string): void {
  mkdirSync(dirname(join(dir, featurePath)), { recursive: true });
  writeFileSync(join(dir, featurePath), content);
}

/** Records what Keel generated, for the next regeneration's merge, and returns the baseline paths. */
function specBaselines(dir: string, { body, feature, featurePath }: ComposedSpec): string[] {
  return [writeBaseline(dir, 'docs/spec.md', body), ...(feature ? [writeBaseline(dir, featurePath, feature)] : [])];
}
