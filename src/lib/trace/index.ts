// Traceability: which tasks and scenarios each requirement reaches, and what a change affects (REQ-004).
// Built from the project files on demand, so it always matches git, the source of truth.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { fileAt, fileHistory } from '../store/git';
import { parseFeature, parseTask, requirementStatements, scenarioLabel, type ScenarioTrace, type TaskTrace } from './parse';

export interface RequirementTrace {
  statement: string;
  source: string;        // document that states it, e.g. INT-0001@2
  tasks: string[];
  scenarios: string[];   // "features/x.feature › name"
}

export interface Trace {
  documents: Partial<Record<'intent' | 'spec' | 'plan', string>>;   // e.g. { intent: 'INT-0001@2' }
  requirements: Record<string, RequirementTrace>;
  tasks: Record<string, TaskTrace>;
  scenarios: ScenarioTrace[];
}

export interface Impact {
  tasks: { id: string; title: string; requirements: string[] }[];
  scenarios: { label: string; requirements: string[] }[];
}

const DOCS = { intent: 'docs/intent.md', spec: 'docs/spec.md', plan: 'docs/plan.md' } as const;

function read(dir: string, path: string): string | undefined {
  const file = join(dir, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

function filesIn(dir: string, folder: string, extension: string): string[] {
  const full = join(dir, folder);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter((f) => f.endsWith(extension)).sort().map((f) => `${folder}/${f}`);
}

function docRef(content: string): string | undefined {
  try {
    const { data } = matter(content, {});
    return typeof data.id === 'string' && Number.isInteger(data.version) ? `${data.id}@${data.version as number}` : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the intent, spec, plan, task files and feature files of a project folder. */
export function buildTrace(dir: string): Trace {
  const trace: Trace = { documents: {}, requirements: {}, tasks: {}, scenarios: [] };
  const entry = (id: string): RequirementTrace => (trace.requirements[id] ??= { statement: '', source: '', tasks: [], scenarios: [] });

  for (const [kind, path] of Object.entries(DOCS) as [keyof typeof DOCS, string][]) {
    const content = read(dir, path);
    if (!content) continue;
    const ref = docRef(content);
    if (ref) trace.documents[kind] = ref;
    for (const [id, statement] of Object.entries(requirementStatements(content))) {
      const req = entry(id);
      if (!req.statement) Object.assign(req, { statement, source: ref ?? path });
    }
  }
  for (const path of filesIn(dir, 'tasks', '.md')) {
    const task = parseTask(path, read(dir, path) ?? '');
    trace.tasks[task.id] = task;
    task.requirements.forEach((id) => entry(id).tasks.push(task.id));
  }
  for (const path of filesIn(dir, 'features', '.feature')) {
    for (const scenario of parseFeature(path, read(dir, path) ?? '')) {
      trace.scenarios.push(scenario);
      scenario.requirements.forEach((id) => entry(id).scenarios.push(scenarioLabel(scenario)));
    }
  }
  return trace;
}

/** The REQ IDs of a project folder, sorted. */
export function requirementIds(dir: string): string[] {
  return Object.keys(buildTrace(dir).requirements).sort();
}

/** Tasks and scenarios linked to any of the requirements. */
export function impactOf(trace: Trace, requirements: string[]): Impact {
  const wanted = new Set(requirements);
  return {
    tasks: Object.values(trace.tasks)
      .map((t) => ({ id: t.id, title: t.title, requirements: t.requirements.filter((r) => wanted.has(r)) }))
      .filter((t) => t.requirements.length > 0),
    scenarios: trace.scenarios
      .map((s) => ({ label: scenarioLabel(s), requirements: s.requirements.filter((r) => wanted.has(r)) }))
      .filter((s) => s.requirements.length > 0),
  };
}

export interface RequirementChange {
  changed: string[];
  added: string[];
  removed: string[];
}

/** Requirements whose statement differs between two versions of a document. */
export function changedRequirements(before: string, after: string): RequirementChange {
  const a = requirementStatements(before);
  const b = requirementStatements(after);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return {
    changed: Object.keys(b).filter((id) => id in a && norm(a[id] ?? '') !== norm(b[id] ?? '')),
    added: Object.keys(b).filter((id) => !(id in a)),
    removed: Object.keys(a).filter((id) => !(id in b)),
  };
}

export interface IntentChange extends RequirementChange {
  from: number;
  to: number;
  impact: Impact;
}

/** What the latest intent version changed compared with the one before, and what that affects. */
export async function latestIntentChange(dir: string, trace: Trace = buildTrace(dir)): Promise<IntentChange | undefined> {
  const history = await fileHistory(dir, DOCS.intent);
  const [previous, latest] = history.slice(-2);
  if (!previous || !latest) return undefined;
  const before = (await fileAt(dir, previous.hash, DOCS.intent)) ?? '';
  const after = (await fileAt(dir, latest.hash, DOCS.intent)) ?? '';
  const version = (content: string) => Number(/^version:\s*(\d+)/m.exec(content)?.[1] ?? 0);
  const change = changedRequirements(before, after);
  return { from: version(before), to: version(after), ...change, impact: impactOf(trace, [...change.changed, ...change.removed]) };
}

/** docs/traceability.json for the handoff, so coding agents can read the links. */
export function traceabilityJson(trace: Trace, project: string, generated: string): string {
  const requirements = Object.fromEntries(
    Object.entries(trace.requirements).map(([id, r]) => [id, { tasks: r.tasks, scenarios: r.scenarios }]),
  );
  const tasks = Object.fromEntries(
    Object.values(trace.tasks).map((t) => [t.id, { title: t.title, requirements: t.requirements, features: t.features }]),
  );
  const scenarios = trace.scenarios.flatMap((s) => s.requirements.map((requirement) => ({ feature: s.feature, scenario: s.scenario, requirement })));
  return `${JSON.stringify({ project, generated, from: trace.documents, requirements, tasks, scenarios }, null, 2)}\n`;
}
