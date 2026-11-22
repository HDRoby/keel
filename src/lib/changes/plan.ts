// Plan the change (REQ-015, REQ-014, CR-0013): the assistant breaks an approved change request into new tasks, each
// with goal, requirements, data, steps and the files likely to change, suggests scenarios for its requirements, and
// Keel lists what is linked: decision records, mock screens, a suggested depends_on and requirement-ID clashes.
// Planning reads only file and folder names (the code map) unless the user chooses files to share for this request.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readDesign } from '../decisions/design';
import type { Writer } from '../generate/writer';
import { currentSet } from '../mocks/sets';
import { codeMap } from '../repo/scan';
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { readDocument } from '../store/documents';
import { commitFiles } from '../store/git';
import { readProject } from '../store/workspace';
import { requirementStatements } from '../trace/parse';
import { buildTrace, impactOf } from '../trace/index';
import { idClashes, suggestDependsOn } from './links';
import { listChanges, readChange, updateKeelChange, type ChangeRequest } from './store';

/** In the system prompt; the fake provider looks for it. */
export const PLAN_MARKER = 'Answer with the change plan as JSON and nothing else.';
export const PLANS_DIR = '.keel/plans';
const MAX_SHARED = 200 * 1024;

const clip = (max: number) => z.string().min(1).transform((v) => (v.length > max ? `${v.slice(0, max - 1)}…` : v));
const stepSchema = z.object({ keyword: z.enum(['Given', 'When', 'Then', 'And', 'But']), text: clip(300) });
const answerSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(3).max(160), goal: z.string().max(1000).default(''), requirements: z.array(z.string()).default([]),
    data: z.string().max(1500).default(''), steps: z.array(z.string().max(300)).max(12).default([]), files: z.array(z.string().max(300)).max(40).default([]),
  })).min(1).max(8),
  scenarios: z.array(z.object({ req: z.string(), name: clip(200), steps: z.array(stepSchema).min(2).max(10) })).max(20).default([]),
});

export interface PlannedTask { id: string; title: string; goal: string; requirements: string[]; data: string; steps: string[]; files: string[] }
export interface PlannedScenario { id: string; req: string; name: string; steps: { keyword: string; text: string }[]; state: 'suggested' | 'accepted' | 'cleared' }
export interface ChangePlan {
  change: string;
  plannedAt: string;
  codeMap: 'off' | 'names' | 'files';
  shared: string[];
  tasks: PlannedTask[];
  scenarios: PlannedScenario[];
  linked: { decisions: string[]; mocks: string[]; dependsOn: string[]; clashes: string[] };
}

const planFile = (root: string, id: string) => join(root, PLANS_DIR, `${id}.json`);

export function readPlan(root: string, id: string): ChangePlan | undefined {
  try {
    return JSON.parse(readFileSync(planFile(root, id), 'utf8')) as ChangePlan;
  } catch {
    return undefined;
  }
}

function writePlan(root: string, plan: ChangePlan): string {
  mkdirSync(join(root, PLANS_DIR), { recursive: true });
  writeFileSync(planFile(root, plan.change), `${JSON.stringify(plan, null, 2)}\n`);
  return `${PLANS_DIR}/${plan.change}.json`;
}

/** The next task number after the highest R number in tasks/ and in every request's tasks/. */
export function nextTaskNumber(root: string): number {
  const numbers: number[] = [];
  const scan = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) { const m = /^R(\d+)\.md$/.exec(f); if (m) numbers.push(Number(m[1])); }
  };
  scan(join(root, 'tasks'));
  if (existsSync(join(root, 'changes'))) for (const d of readdirSync(join(root, 'changes'))) scan(join(root, 'changes', d, 'tasks'));
  for (const plan of existsSync(join(root, PLANS_DIR)) ? readdirSync(join(root, PLANS_DIR)) : []) {
    try {
      (JSON.parse(readFileSync(join(root, PLANS_DIR, plan), 'utf8')) as ChangePlan).tasks.forEach((t) => numbers.push(Number(t.id.slice(1))));
    } catch { /* skip */ }
  }
  return Math.max(0, ...numbers) + 1;
}

/** What the change links to: decision records naming its requirements, mock screens showing them, dependencies, clashes. */
export function linksOf(root: string, cr: ChangeRequest): ChangePlan['linked'] {
  const dir = join(root, 'docs', 'decisions');
  const decisions = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).filter((f) => cr.requirements.some((r) => readFileSync(join(dir, f), 'utf8').includes(r))).map((f) => `docs/decisions/${f}`) : [];
  const design = readDesign(root).topics.filter((t) => t.record && t.options.some((o) => o.id === t.chosen && o.serves.some((r) => cr.requirements.includes(r)))).map((t) => t.record as string);
  const set = currentSet(root);
  const docs = readProject(root);
  const mocks = set ? set.files.filter((f) => f.kind !== 'link' && f.reqs.some((r) => cr.requirements.includes(r))).map((f) => `${docs.ok ? docs.value.paths.docs : 'docs'}/mocks/set-${set.set}/${f.path}`) : [];
  const all = listChanges(root);
  return { decisions: [...new Set([...decisions, ...design])], mocks, dependsOn: suggestDependsOn(cr, all), clashes: idClashes(root, all).filter((c) => c.ids.includes(cr.id)).map((c) => c.message) };
}

export function planMessages(input: Record<string, unknown>) {
  return [
    {
      role: 'system' as const,
      content: [
        'You plan a software change request into tasks for a coding agent. Each task: a short title, the goal, the requirement IDs it serves, the data it adds or changes, small steps, and the files likely to change.',
        'Name only files from the code map given, or new files marked "(new)". Without a code map, say "To be decided by the coding agent".',
        'Suggest at least one acceptance scenario (Given, When, Then) for each requirement the request adds or changes.',
        PLAN_MARKER,
        'Format: {"tasks": [{"title": "...", "goal": "...", "requirements": ["REQ-001"], "data": "...", "steps": ["..."], "files": ["src/..."]}], "scenarios": [{"req": "REQ-001", "name": "...", "steps": [{"keyword": "Given", "text": "..."}]}]}',
      ].join('\n'),
    },
    { role: 'user' as const, content: JSON.stringify(input) },
  ];
}

/** Plans an approved Keel change request and saves the plan (one Keel commit). Only the chosen files are sent. */
export async function planChange(store: Store, id: string, options: { share?: string[] }, write: Writer): Promise<Result<ChangePlan, 'not-found' | 'not-keel' | 'wrong-status' | 'failed'>> {
  const cr = readChange(store.root, id);
  if (!cr) return fail('not-found', `No change request ${id}`);
  if (cr.origin !== 'keel') return fail('not-keel', `${id} was written by hand; its tasks are its own`);
  if (cr.status !== 'approved') return fail('wrong-status', `Approve ${id} first`);
  const project = readProject(store.root);
  const mode = project.ok ? project.value.codeMap : 'names';
  const map = mode === 'off' ? [] : codeMap(store.root);
  let total = 0;
  const shared = mode === 'files' ? (options.share ?? []).filter((p) => map.includes(p)).flatMap((path) => {
    const text = readFileSync(join(store.root, path), 'utf8').slice(0, 50 * 1024);
    total += text.length;
    return total <= MAX_SHARED ? [{ path, text }] : [];
  }) : [];
  const intent = readDocument(store, 'docs/intent.md');
  const spec = readDocument(store, 'docs/spec.md');
  const statements = { ...(intent.ok ? requirementStatements(intent.value.body) : {}), ...(spec.ok ? requirementStatements(spec.value.body) : {}) };
  const impact = impactOf(buildTrace(store.root), cr.requirements);
  const next = nextTaskNumber(store.root);
  const text = await write('documents', planMessages({
    request: { id: cr.id, title: cr.title, body: cr.body.slice(0, 20_000) },
    requirements: Object.fromEntries(cr.requirements.map((r) => [r, statements[r] ?? ''])),
    linkedTasks: impact.tasks.map((t) => `${t.id} ${t.title}`), linkedScenarios: impact.scenarios.map((s) => s.label),
    codeMap: map, files: shared, firstTaskId: `R${next}`,
  }));
  let answer: z.infer<typeof answerSchema> | undefined;
  try {
    const parsed = text ? answerSchema.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))) : undefined;
    answer = parsed?.success ? parsed.data : undefined;
  } catch {
    answer = undefined;
  }
  if (!answer) return fail('failed', 'The assistant did not answer with a plan. Check the model in Settings and plan again.');
  const known = (f: string) => map.includes(f.replace(/\s*\(new\)$/, '')) || /\(new\)$/.test(f);
  const plan: ChangePlan = {
    change: cr.id, plannedAt: (store.now?.() ?? new Date()).toISOString(), codeMap: mode, shared: shared.map((f) => f.path),
    tasks: answer.tasks.map((t, i) => ({
      id: `R${next + i}`, title: t.title, goal: t.goal, requirements: t.requirements.filter((r) => /^REQ-\d{3,}$/.test(r)), data: t.data, steps: t.steps,
      files: mode === 'off' ? ['To be decided by the coding agent.'] : t.files.filter(known).length ? t.files.filter(known) : ['To be decided by the coding agent.'],
    })),
    scenarios: answer.scenarios.filter((s) => cr.requirements.includes(s.req)).map((s, i) => ({ id: `S${i + 1}`, ...s, state: 'suggested' as const })),
    linked: linksOf(store.root, cr),
  };
  const path = writePlan(store.root, plan);
  await commitFiles(store.root, [path], `Keel: Plan ${cr.id}`);
  await updateKeelChange(store, cr, { planned_at: plan.plannedAt.slice(0, 10) }, undefined, `${cr.id}: planned`);
  return ok(plan);
}

/** Accept or clear a suggested scenario of the plan. */
export async function settlePlannedScenario(store: Store, id: string, scenario: string, state: 'accepted' | 'cleared'): Promise<Result<ChangePlan, 'not-found'>> {
  const plan = readPlan(store.root, id);
  if (!plan || !plan.scenarios.some((s) => s.id === scenario)) return fail('not-found', `No scenario ${scenario} in the plan of ${id}`);
  const next = { ...plan, scenarios: plan.scenarios.map((s) => (s.id === scenario ? { ...s, state } : s)) };
  await commitFiles(store.root, [writePlan(store.root, next)], `Keel: ${id} scenario ${state}`);
  return ok(next);
}
