// Acceptance scenarios in the Spec (REQ-004, REQ-005, task R11). Accepted scenarios live in features/*.feature,
// tagged @REQ-xxx from the requirement they are grouped under. Suggestions (the first draft's, and failure cases
// asked of the assistant) wait in .keel/scenarios.json and count only once accepted. Once the spec is approved,
// an edit is held there too and goes through a change request (CR-0003): approving it writes the feature file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from '../store/atomic';
import type { Store } from '../store/store';
import { readDocument } from '../store/documents';
import { commitBlocker, commitFiles } from '../store/git';
import { fileNameFor } from '../store/workspace';
import { requirementStatements } from '../trace/parse';
import { buildFeature, KEYWORDS, parseFeatureDoc, requirementsOf, type FeatureDoc, type Step } from './gherkin';

export const SCENARIOS_FILE = '.keel/scenarios.json';
const FEATURES = 'features';

export interface AcceptedScenario {
  id: string;              // "<file>#<index>"
  file: string;
  index: number;
  feature: string;         // the feature's name
  tags: string[];
  requirements: string[];
  name: string;
  steps: Step[];
  origin: 'user';
}

const stepSchema = z.object({ keyword: z.enum(KEYWORDS), text: z.string().max(500), extra: z.array(z.string()).optional() });
const suggestionSchema = z.object({ id: z.string(), req: z.string().regex(/^REQ-\d{3,}$/), name: z.string().max(300), steps: z.array(stepSchema).max(30), origin: z.literal('suggested'), kind: z.enum(['draft', 'failure']).default('draft') });
const storeSchema = z.object({
  suggestions: z.array(suggestionSchema).default([]),
  pending: z.object({ change: z.string(), files: z.record(z.string(), z.string()) }).optional(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
type ScenarioStore = z.infer<typeof storeSchema>;

export type ScenarioError = 'not-found' | 'invalid-input' | 'repo-busy' | 'no-spec';

function readStore(root: string): ScenarioStore {
  try {
    const parsed = storeSchema.safeParse(JSON.parse(readFileSync(join(root, SCENARIOS_FILE), 'utf8')));
    return parsed.success ? parsed.data : { suggestions: [] };
  } catch {
    return { suggestions: [] };
  }
}

function writeStore(root: string, data: ScenarioStore): void {
  mkdirSync(join(root, '.keel'), { recursive: true });
  writeFileAtomic(join(root, SCENARIOS_FILE), `${JSON.stringify(data, null, 2)}\n`);
}

/** The feature files in features/ (not the step code), sorted. */
export function featureFiles(root: string): string[] {
  const dir = join(root, FEATURES);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.feature')).sort().map((f) => `${FEATURES}/${f}`) : [];
}

function readDoc(root: string, file: string): FeatureDoc {
  return parseFeatureDoc(existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : '');
}

/** Every accepted scenario, with the requirements it is tagged with. */
export function acceptedScenarios(root: string): AcceptedScenario[] {
  return featureFiles(root).flatMap((file) => {
    const doc = readDoc(root, file);
    return doc.scenarios.map((s, index) => ({ id: `${file}#${index}`, file, index, feature: doc.name, tags: s.tags, requirements: requirementsOf(s, doc), name: s.name, steps: s.steps, origin: 'user' as const }));
  });
}

export function suggestions(root: string): Suggestion[] {
  return readStore(root).suggestions;
}

/** The change request holding scenario edits made after the spec was approved, if any. */
export function pendingChange(root: string): { change: string; files: Record<string, string> } | undefined {
  return readStore(root).pending;
}

export interface RequirementCoverage {
  id: string;
  statement: string;
  accepted: AcceptedScenario[];
  suggested: Suggestion[];
}

/** The spec's requirements, each with its accepted and suggested scenarios (REQ-004). */
export function coverage(root: string): RequirementCoverage[] {
  const spec = readDocument({ root }, 'docs/spec.md');
  if (!spec.ok) return [];
  const accepted = acceptedScenarios(root);
  const suggested = suggestions(root);
  return Object.entries(requirementStatements(spec.value.body)).map(([id, statement]) => ({
    id, statement, accepted: accepted.filter((s) => s.requirements.includes(id)), suggested: suggested.filter((s) => s.req === id),
  }));
}

/** The spec's requirements with no accepted scenario: the plan waits for them (REQ-005). */
export function uncovered(root: string): string[] {
  return coverage(root).filter((r) => r.accepted.length === 0).map((r) => r.id);
}

/** Where a new scenario for a requirement goes: the file of its other scenarios, or one named after it. */
export function featureFor(root: string, req: string, statement: string): { file: string; name: string } {
  const other = acceptedScenarios(root).find((s) => s.requirements.includes(req));
  if (other) return { file: other.file, name: other.feature };
  const file = `${FEATURES}/${fileNameFor(statement)}.feature`;
  const existing = existsSync(join(root, file)) ? readDoc(root, file).name : '';
  return { file, name: existing || statement };
}

const suggestionId = (req: string, name: string, n: number) => `s-${createHash('sha256').update(`${req}:${name}:${n}`).digest('hex').slice(0, 10)}`;

/**
 * Adds suggestions (they count only once accepted). Returns them with their IDs. The store file is committed by
 * the caller with the change it belongs to (spec generation), or right away with `commit`.
 */
export async function addSuggestions(store: Pick<Store, 'root'>, given: { req: string; name: string; steps: Step[]; kind?: 'draft' | 'failure' }[], commit?: string): Promise<Suggestion[]> {
  const data = readStore(store.root);
  const made = given.map((g, i) => ({ id: suggestionId(g.req, g.name, data.suggestions.length + i), req: g.req, name: g.name, steps: g.steps, origin: 'suggested' as const, kind: g.kind ?? 'draft' }));
  if (made.length === 0) return made;
  writeStore(store.root, { ...data, suggestions: [...data.suggestions, ...made] });
  if (commit) await commitFiles(store.root, [SCENARIOS_FILE], commit);
  return made;
}

export interface ScenarioEdit {
  id?: string;             // an accepted scenario's id; empty for a new one
  req: string;
  name: string;
  steps: Step[];
}

function cleanSteps(steps: Step[]): Step[] {
  return steps.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

/** The feature files after an edit, a deletion or an accepted suggestion, without writing them. */
function afterEdit(root: string, edit: ScenarioEdit | { delete: string }): Result<Record<string, string>, ScenarioError> {
  if ('delete' in edit) {
    const [file, index] = edit.delete.split('#');
    const doc = file ? readDoc(root, file) : undefined;
    if (!file || !doc || !doc.scenarios[Number(index)]) return fail('not-found', 'No such scenario');
    doc.scenarios.splice(Number(index), 1);
    return ok({ [file]: buildFeature(doc) });
  }
  const steps = cleanSteps(edit.steps);
  if (!edit.name.trim() || steps.length === 0) return fail('invalid-input', 'A scenario needs a name and at least one step');
  const tag = `@${edit.req}`;
  if (edit.id) {
    const [file, index] = edit.id.split('#');
    const doc = file ? readDoc(root, file) : undefined;
    const current = doc?.scenarios[Number(index)];
    if (!file || !doc || !current) return fail('not-found', 'No such scenario');
    // The group's tag is written from the requirement; other tags stay.
    doc.scenarios[Number(index)] = { ...current, name: edit.name.trim(), steps, tags: current.tags.includes(tag) ? current.tags : [tag, ...current.tags] };
    return ok({ [file]: buildFeature(doc) });
  }
  const spec = readDocument({ root }, 'docs/spec.md');
  const statement = spec.ok ? requirementStatements(spec.value.body)[edit.req] ?? edit.req : edit.req;
  const target = featureFor(root, edit.req, statement);
  const doc = existsSync(join(root, target.file)) ? readDoc(root, target.file) : { tags: [], name: target.name, description: [], scenarios: [] };
  doc.scenarios.push({ tags: [tag], name: edit.name.trim(), steps });
  return ok({ [target.file]: buildFeature(doc) });
}

const storePath = (root: string) => (existsSync(join(root, SCENARIOS_FILE)) ? [SCENARIOS_FILE] : []);

const specApproved = (root: string) => {
  const spec = readDocument({ root }, 'docs/spec.md');
  return spec.ok && spec.value.header.status === 'approved';
};

export type Saved = { written: string[] } | { held: string };

/**
 * Saves an edit, a new scenario or a deletion. While the spec is a draft the feature file is written and committed;
 * once it is approved the change is held and raised as a change request (`raise` is CR-0003's createChange).
 */
async function save(store: Store, files: Result<Record<string, string>, ScenarioError>, message: string, raise: RaiseChange, requirements: string[]): Promise<Result<Saved, ScenarioError>> {
  if (!files.ok) return files;
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);
  if (specApproved(store.root)) {
    const data = readStore(store.root);
    const pendingFiles = { ...data.pending?.files, ...files.value };
    const change = await raise(store, { files: pendingFiles, requirements, existing: data.pending?.change });
    if (!change.ok) return fail('invalid-input', change.message);
    writeStore(store.root, { ...readStore(store.root), pending: { change: change.value, files: pendingFiles } });
    await commitFiles(store.root, [SCENARIOS_FILE], `Scenarios held for ${change.value}`);
    return ok({ held: change.value });
  }
  for (const [file, content] of Object.entries(files.value)) {
    mkdirSync(dirname(join(store.root, file)), { recursive: true });
    writeFileAtomic(join(store.root, file), content);
  }
  await commitFiles(store.root, [...Object.keys(files.value), ...storePath(store.root)], message);
  return ok({ written: Object.keys(files.value) });
}

/** Raises or updates the change request for scenario edits after approval; returns its ID. */
export type RaiseChange = (store: Store, input: { files: Record<string, string>; requirements: string[]; existing?: string }) => Promise<Result<string, string>>;

export async function saveScenario(store: Store, edit: ScenarioEdit, raise: RaiseChange): Promise<Result<Saved, ScenarioError>> {
  return save(store, afterEdit(store.root, edit), `Scenarios: ${edit.id ? 'edit' : 'add'} ${edit.name.trim()} (${edit.req})`, raise, [edit.req]);
}

export async function deleteScenario(store: Store, id: string, raise: RaiseChange): Promise<Result<Saved, ScenarioError>> {
  const scenario = acceptedScenarios(store.root).find((s) => s.id === id);
  if (!scenario) return fail('not-found', 'No such scenario');
  return save(store, afterEdit(store.root, { delete: id }), `Scenarios: delete ${scenario.name}`, raise, scenario.requirements);
}

/** Accept a suggestion: it becomes the user's scenario in the requirement's feature file, in the same commit. */
export async function acceptSuggestion(store: Store, id: string, raise: RaiseChange): Promise<Result<Saved, ScenarioError>> {
  const before = readStore(store.root);
  const suggestion = before.suggestions.find((s) => s.id === id);
  if (!suggestion) return fail('not-found', 'No such suggestion');
  writeStore(store.root, { ...before, suggestions: before.suggestions.filter((s) => s.id !== id) });
  const saved = await saveScenario(store, { req: suggestion.req, name: suggestion.name, steps: suggestion.steps }, raise);
  if (!saved.ok) writeStore(store.root, { ...readStore(store.root), suggestions: [...readStore(store.root).suggestions, suggestion] });
  return saved;
}

/** Accept every suggestion at once (the first draft's one per requirement), in one commit. */
export async function acceptAllSuggestions(store: Store, raise: RaiseChange): Promise<Result<number, ScenarioError>> {
  const all = suggestions(store.root);
  let accepted = 0;
  for (const s of all) {
    const saved = await acceptSuggestion(store, s.id, raise);
    if (!saved.ok) return saved;
    accepted += 1;
  }
  return ok(accepted);
}

export async function clearSuggestion(store: Pick<Store, 'root'>, id: string): Promise<void> {
  const data = readStore(store.root);
  const gone = data.suggestions.find((s) => s.id === id);
  if (!gone) return;
  writeStore(store.root, { ...data, suggestions: data.suggestions.filter((s) => s.id !== id) });
  await commitFiles(store.root, [SCENARIOS_FILE], `Scenarios: clear suggestion ${gone.name} (${gone.req})`);
}

/** Approving the change request writes the held feature files; rejecting drops them. */
export async function settlePending(store: Store, change: string, approved: boolean): Promise<boolean> {
  const data = readStore(store.root);
  if (data.pending?.change !== change) return false;
  if (approved) {
    for (const [file, content] of Object.entries(data.pending.files)) {
      mkdirSync(dirname(join(store.root, file)), { recursive: true });
      writeFileAtomic(join(store.root, file), content);
    }
  }
  const next = { ...data };
  delete next.pending;
  writeStore(store.root, next);
  await commitFiles(store.root, [...(approved ? Object.keys(data.pending.files) : []), SCENARIOS_FILE], approved ? `Scenarios from ${change}` : `Scenarios: drop the edits in ${change}`);
  return true;
}

/** The Gherkin view: the .feature text per file, with held changes shown as they will be. */
export function gherkinView(root: string): { file: string; text: string; held: boolean }[] {
  const pending = pendingChange(root)?.files ?? {};
  const files = [...new Set([...featureFiles(root), ...Object.keys(pending)])].sort();
  return files.map((file) => ({ file, text: pending[file] ?? readFileSync(join(root, file), 'utf8'), held: file in pending }));
}
