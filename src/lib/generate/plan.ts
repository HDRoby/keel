// Generate plan: fills the plan template and writes one task file per task (owner decision, T6).
// Tasks come from the model when it lists them in the agreed format; otherwise one task per requirement.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillSections, parseSections } from '../brainstorm/sections';
import { gateFor } from '../gates/rules';
import { projectState } from '../gates/approvals';
import { currentSet } from '../mocks/sets';
import { fail, ok, type Result } from '../result';
import { standardsFor } from '../standards/library';
import type { Store } from '../store/db';
import { createDocument, readDocument, saveDocument, type StoredDocument } from '../store/documents';
import { commitFiles, removeFiles } from '../store/git';
import { readProject } from '../store/workspace';
import { readTemplate } from '../templates/library';
import { renderTemplate } from '../templates/render';
import { parseFeature, requirementStatements, scenarioLabel, type ScenarioTrace } from '../trace/parse';
import { conflictNote, mergePiece, mergeSections, readBaseline, writeBaseline, type Conflict } from './merge';
import { standardsSources, type GenerateError } from './spec';
import { writeSection, type Writer } from './writer';

export interface PlannedTask {
  title: string;
  requirements: string[];
}

/**
 * Reads tasks from lines like "T1 | Document store | REQ-001, REQ-002", keeping only known IDs.
 * Every requirement ends up in a task: any the model left out gets a task of its own.
 */
export function plannedTasks(written: string | undefined, statements: Record<string, string>): PlannedTask[] {
  const known = new Set(Object.keys(statements));
  const tasks = (written ?? '').split('\n').flatMap((line) => {
    const match = /^\s*[-*]?\s*T\d+\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|?\s*$/.exec(line);
    const requirements = match ? [...new Set(match[2]?.match(/REQ-\d{3,}/g) ?? [])].filter((r) => known.has(r)) : [];
    return match?.[1] && requirements.length > 0 ? [{ title: match[1], requirements }] : [];
  });
  const covered = new Set(tasks.flatMap((t) => t.requirements));
  const rest = Object.entries(statements)
    .filter(([id]) => !covered.has(id))
    .map(([id, statement]) => ({ title: statement.length > 80 ? `${statement.slice(0, 77)}…` : statement, requirements: [id] }));
  return [...tasks, ...rest];
}

function scenariosIn(dir: string): ScenarioTrace[] {
  const folder = join(dir, 'features');
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((f) => f.endsWith('.feature')).sort()
    .flatMap((f) => parseFeature(`features/${f}`, readFileSync(join(folder, f), 'utf8')));
}

function scenariosOf(task: PlannedTask, scenarios: ScenarioTrace[]): ScenarioTrace[] {
  return scenarios.filter((s) => s.requirements.some((r) => task.requirements.includes(r)));
}

/** The plan's Order of work table. */
export function orderOfWork(tasks: PlannedTask[], scenarios: ScenarioTrace[]): string {
  const rows = tasks.map((t, i) => {
    const files = [...new Set(scenariosOf(t, scenarios).map((s) => s.feature.replace(/^features\/|\.feature$/g, '')))];
    return `| T${i + 1} | ${t.title.replace(/\|/g, '\\|')} | ${t.requirements.join(', ')} | ${files.join(', ') || '—'} |`;
  });
  return ['| Task | Title | Requirements | Scenarios |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

interface ComposedTask {
  id: string;            // T1, T2, … in build order
  title: string;
  body: string;
  requirements: string[];
}

interface ComposedPlan {
  title: string;
  body: string;
  extra: Record<string, unknown>;
  tasks: ComposedTask[];
  planTemplate: string;  // refs such as implementation-plan@1
  taskTemplate: string;
}

async function composePlan(store: Store, write: Writer): Promise<Result<ComposedPlan, GenerateError>> {
  const intent = readDocument(store, 'docs/intent.md');
  if (!intent.ok) return fail('not-found', intent.message);
  const spec = readDocument(store, 'docs/spec.md');
  const planTemplate = readTemplate(store.root, 'implementation-plan');
  const taskTemplate = readTemplate(store.root, 'task');
  if (!planTemplate.ok || !taskTemplate.ok) return fail('unknown-template', 'The plan or task template is missing');
  const project = readProject(store.root);
  const chosen = project.ok ? project.value.standards : [];

  const { title } = intent.value.header;
  const statements = { ...requirementStatements(intent.value.body), ...(spec.ok ? requirementStatements(spec.value.body) : {}) };
  const sources = [`Intent:\n\n${intent.value.body}`, spec.ok ? `Spec:\n\n${spec.value.body}` : '', standardsSources(standardsFor(store.root, chosen, 'plan'))]
    .filter(Boolean).join('\n\n');
  const scenarios = scenariosIn(store.root);
  const planned = plannedTasks(await write('documents', [
    { role: 'system', content: 'Split the work into small tasks, each fitting one pull request, in build order. Reply with one line per task: "T<n> | <title> | <REQ IDs>". Use only the requirement IDs in the sources.' },
    { role: 'user', content: sources },
  ]), statements);

  const planSections: Record<string, string[]> = {};
  for (const { heading, guidance } of parseSections(planTemplate.value.content)) {
    planSections[heading] = [heading === 'Order of work'
      ? `${orderOfWork(planned, scenarios)}\n\nEach task has its own file in \`tasks/\`.`
      : await writeSection(write, 'documents', { kind: 'implementation plan', title, heading, guidance, sources })];
  }
  const tasks = planned.map((task, i) => ({
    id: `T${i + 1}`,
    title: task.title,
    requirements: task.requirements,
    body: fillSections(renderTemplate(taskTemplate.value.content, { task_id: `T${i + 1}`, title: task.title }).body, {
      Goal: [task.requirements.map((r) => `- ${r} ${statements[r] ?? ''}`.trimEnd()).join('\n')],
      'Scenarios that prove it': [scenariosOf(task, scenarios).map((s) => `- \`${scenarioLabel(s).replace(' › ', '` › ')}`).join('\n') || 'None yet.'],
      'Files that are likely to change': ['To be decided by the coding agent.'],
      'Questions for the owner': ['(none yet)'],
      ...(screensFor(store.root, task.requirements) ? { Notes: [screensFor(store.root, task.requirements) ?? ''] } : {}),
    }),
  }));
  return ok({
    title, tasks, planTemplate: `implementation-plan@${planTemplate.value.version}`, taskTemplate: `task@${taskTemplate.value.version}`,
    body: fillSections(renderTemplate(planTemplate.value.content, { title }).body, planSections),
    extra: spec.ok ? { from_spec: `${spec.value.header.id}@${spec.value.header.version}` } : { from_intent: `${intent.value.header.id}@${intent.value.header.version}` },
  });
}

/** Writes docs/plan.md from the plan template and tasks/T<n>.md from the task template. */
export async function generatePlan(store: Store, write: Writer): Promise<Result<StoredDocument, GenerateError>> {
  const gate = gateFor(projectState(store), 'plan');
  if (!gate.available) return fail('locked', gate.reason ?? 'The plan stage is locked');
  if (readDocument(store, 'docs/plan.md').ok) return fail('already-exists', 'plan.md already exists');
  const dir = store.root;
  if (taskIds(dir).length > 0) return fail('already-exists', 'The project already has task files');
  const composed = await composePlan(store, write);
  if (!composed.ok) return composed;
  const { title, body, extra, tasks, planTemplate, taskTemplate } = composed.value;
  const plan = await createDocument(store, { kind: 'plan', title, template: planTemplate, body, extra: { ...extra, conflicts: [] } });
  if (!plan.ok) return fail('invalid-input', plan.message);
  const planRef = `${plan.value.header.id}@${plan.value.header.version}`;
  for (const task of tasks) {
    const created = await createDocument(store, {
      kind: 'task', id: task.id, title: task.title, body: task.body, template: taskTemplate, status: 'todo',
      extra: { plan: planRef, requirements: task.requirements },
    });
    if (!created.ok) return fail('invalid-input', created.message);
  }
  await commitFiles(dir, planBaselines(dir, composed.value, []), `Generation baseline for ${planRef}`);
  return plan;
}

/**
 * Regenerates a draft plan as its next version, merging plan.md section by section and each task file
 * as a whole with what Keel generated last time. A task the proposer edited that the regeneration would
 * change or remove is a conflict; new tasks are added, unedited tasks the regeneration drops are removed.
 */
export async function regeneratePlan(store: Store, write: Writer): Promise<Result<StoredDocument, GenerateError>> {
  const gate = gateFor(projectState(store), 'plan');
  if (!gate.available) return fail('locked', gate.reason ?? 'The plan stage is locked');
  const plan = readDocument(store, 'docs/plan.md');
  if (!plan.ok) return fail('not-found', plan.message);
  if (plan.value.header.status !== 'draft') return fail('not-draft', `plan.md is ${plan.value.header.status}; only a draft plan can be regenerated`);
  const composed = await composePlan(store, write);
  if (!composed.ok) return composed;
  const { body, extra, tasks, taskTemplate } = composed.value;
  const dir = store.root;
  const merged = mergeSections(readBaseline(dir, 'docs/plan.md') ?? '', plan.value.body, body);
  const conflicts: Conflict[] = [...merged.conflicts];
  const planRef = `${plan.value.header.id}@${plan.value.header.version + 1}`;
  const generatedIds = taskIds(join(dir, '.keel', 'generated'));

  const ids = [...new Set([...taskIds(dir), ...generatedIds, ...tasks.map((t) => t.id)])];
  for (const id of ids) {
    const path = `tasks/${id}.md`;
    const mine = readDocument(store, path);
    const theirs = tasks.find((t) => t.id === id);
    const piece = mergePiece(readBaseline(dir, path), mine.ok ? mine.value.body : undefined, theirs?.body);
    if (piece.conflict) {
      conflicts.push({ kind: 'file', name: path, mine: mine.ok ? mine.value.body : '', theirs: theirs?.body ?? '', ...(theirs ? { requirements: theirs.requirements, title: theirs.title } : {}) });
    } else if (piece.value === undefined && mine.ok) {
      await removeFiles(dir, [path], `${id}: removed by regenerating ${planRef}`);
    } else if (piece.value !== undefined && !mine.ok && theirs) {
      await createDocument(store, { kind: 'task', id, title: theirs.title, body: theirs.body, template: taskTemplate, status: 'todo', extra: { plan: planRef, requirements: theirs.requirements } });
    } else if (mine.ok && theirs && piece.value !== mine.value.body) {
      await saveDocument(store, path, { body: piece.value ?? '', title: theirs.title, extra: { plan: planRef, requirements: theirs.requirements }, reason: `Regenerated with ${planRef}` });
    }
  }

  const saved = await saveDocument(store, 'docs/plan.md', {
    body: merged.body,
    extra: { ...extra, conflicts },
    reason: `Regenerated${conflictNote(conflicts)}`,
  });
  if (!saved.ok) return fail('invalid-input', saved.message);
  await commitFiles(dir, planBaselines(dir, composed.value, generatedIds), `Regeneration baseline for ${saved.value.header.id} v${saved.value.header.version}`);
  return saved;
}

/** Records what Keel generated, dropping the baselines of earlier tasks it no longer generates, and returns the baseline paths. */
function planBaselines(dir: string, { body, tasks }: ComposedPlan, earlierIds: string[]): string[] {
  const dropped = earlierIds.filter((id) => !tasks.some((t) => t.id === id));
  return [
    writeBaseline(dir, 'docs/plan.md', body),
    ...tasks.map((t) => writeBaseline(dir, `tasks/${t.id}.md`, t.body)),
    ...dropped.map((id) => writeBaseline(dir, `tasks/${id}.md`, undefined)),
  ];
}

/** IDs of the task files in a folder's tasks/, in number order. */
function taskIds(dir: string): string[] {
  const folder = join(dir, 'tasks');
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((f) => (/^T\d+\.md$/.test(f) ? [f.slice(0, -3)] : [])).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** The screens of the current mock set that show a task's requirements (CR-0009), as a note in the task file. */
function screensFor(root: string, requirements: string[]): string | undefined {
  const set = currentSet(root);
  const files = set?.files.filter((f) => f.kind !== 'link' && f.reqs.some((r) => requirements.includes(r))) ?? [];
  if (!set || files.length === 0) return undefined;
  const docs = readProject(root);
  const folder = `${docs.ok ? docs.value.paths.docs : 'docs'}/mocks/set-${set.set}`;
  return ['Screens in the current mock set (HTML sources first):', ...files.sort((a, b) => Number(b.kind === 'html') - Number(a.kind === 'html')).map((f) => `- \`${folder}/${f.path}\`: ${f.number ? `${f.number} · ` : ''}${f.screen ?? f.source} (${f.reqs.join(', ')})`)].join('\n');
}
