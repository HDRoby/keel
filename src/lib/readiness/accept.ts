// Acting on the readiness advice (CR-0015): in a Keel folder the accepted items (Add or Adopt) become one draft
// change request with a task each, through the change package writer (CR-0013); before Initialise they are handed to
// Initialise and the baseline plan.
import { packageFiles } from '../changes/flow';
import { nextTaskNumber, writePlan, type ChangePlan } from '../changes/plan';
import { createChange, readChange } from '../changes/store';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from '../store/atomic';
import { commitFiles } from '../store/git';
import type { Store } from '../store/store';
import { isInitialised } from '../store/workspace';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { listReports, readReport, saveChoices, type Advice, type Choice } from './report';

/** The items to act on: every piece of advice set to Add or Adopt. */
export function acceptedAdvice(advice: Advice[], choices: Record<string, Choice>): Advice[] {
  return advice.filter((a) => (choices[a.id] ?? a.choice) !== 'ignore');
}

const requirementsIn = (text: string) => [...new Set(text.match(/REQ-\d{3,}/g) ?? [])];

/** One task for one piece of advice. */
function taskFor(a: Advice, id: string): ChangePlan['tasks'][number] {
  const files = a.evidence.map((e) => e.path);
  return {
    id, title: a.choice === 'adopt' ? `Adopt: ${a.title}` : a.title, goal: a.why, requirements: requirementsIn(a.title),
    data: 'None.', files: files.length ? files : ['To be decided by the coding agent.'],
    steps: a.choice === 'adopt'
      ? [`Keep ${files.join(', ') || 'what is there'} as it is.`, 'Make Keel and every agent use it: a standard in .keel/standards, or a pointer from AGENTS.md.', 'Keep the checks green.']
      : [`${a.title}.`, `Based on the AI readiness report (${a.area}, ${a.impact} impact, ${a.effort} effort).`, 'Keep the checks green.'],
  };
}

/** A Keel folder: one draft change request with a task for each accepted item. The report records it. */
export async function createChangeFromAdvice(store: Store, reportId: string, choices: Record<string, Choice>): Promise<Result<string, 'not-found' | 'not-keel' | 'nothing' | 'failed'>> {
  if (!isInitialised(store.root)) return fail('not-keel', 'Initialise the folder first');
  const report = readReport(store, reportId);
  if (!report) return fail('not-found', `No report ${reportId}`);
  const items = acceptedAdvice(report.advice, choices).map((a) => ({ ...a, choice: choices[a.id] ?? a.choice }));
  if (!items.length) return fail('nothing', 'Set at least one piece of advice to Add or Adopt');
  const list = items.map((a, i) => `${i + 1}. ${a.title} (${a.choice === 'adopt' ? 'Adopt' : 'Add'}; ${a.area}; ${a.impact} impact).`).join('\n');
  const made = await createChange(store, {
    title: `AI readiness: ${items.length} ${items.length === 1 ? 'item' : 'items'} from ${report.id}`,
    reason: `The AI readiness report of ${report.date.slice(0, 10)} found these gaps for coding agents.`,
    status: 'draft', size: 'minor', requirements: [...new Set(items.flatMap((a) => requirementsIn(a.title)))],
    draft: { whatChanges: list, doneWhen: items.map((a) => `- ${a.title}`).join('\n') },
    extra: { from_report: report.id },
  });
  if (!made.ok) return fail('failed', made.message);
  const cr = made.value;
  const first = nextTaskNumber(store.root);
  const plan: ChangePlan = {
    change: cr.id, plannedAt: new Date().toISOString(), codeMap: 'off', shared: [],
    tasks: items.map((a, i) => taskFor(a, `R${first + i}`)), scenarios: [], linked: { decisions: [], mocks: [], dependsOn: [], clashes: [] },
  };
  const planPath = writePlan(store.root, plan);
  // The package writer's files (prompt and tasks), written now so the draft shows its tasks; writePackage rewrites
  // them when the request is approved.
  const files = packageFiles(store, readChange(store.root, cr.id) ?? cr);
  for (const file of files) {
    mkdirSync(join(store.root, file.path, '..'), { recursive: true });
    writeFileAtomic(join(store.root, file.path), file.content);
  }
  await commitFiles(store.root, [planPath, ...files.map((f) => f.path)], `Plan ${cr.id} from the AI readiness report`);
  const saved = await saveChoices(store, report.id, choices, { change: cr.id });
  return saved.ok ? ok(cr.id) : fail('failed', saved.message);
}

/** Before Initialise: the accepted items are kept with the report for Initialise and the baseline plan. */
export async function handOverToBaseline(store: Store, reportId: string, choices: Record<string, Choice>): Promise<Result<number, 'not-found' | 'nothing' | 'failed'>> {
  const report = readReport(store, reportId);
  if (!report) return fail('not-found', `No report ${reportId}`);
  const items = acceptedAdvice(report.advice, choices);
  if (!items.length) return fail('nothing', 'Set at least one piece of advice to Add or Adopt');
  const saved = await saveChoices(store, reportId, choices, { handedOver: true });
  return saved.ok ? ok(items.length) : fail('failed', saved.message);
}

/** What Initialise and handoff already do for an item, so it needs no task in the baseline plan. */
const MATCHED: Record<string, string> = {
  'AI-01': 'AGENTS.md is written at handoff', 'AI-02': 'Keel adds its block to AGENTS.md and a pointer to the other files at handoff',
  'AT-01': 'The agent kit has a verifier subagent', 'CO-02': 'The rules from your agent files are kept as a standard',
  'AT-02': 'The rules from your agent files are kept as a standard', 'PK-02': 'The baseline records the requirements', 'PK-03': 'The baseline records the stack as a decision',
  'SA-01': 'Security baseline is chosen as a standard',
};

export interface Handover {
  report: string;
  adoptRules: boolean;         // tick the rules found in agent files
  standards: string[];         // standards to tick
  matched: { title: string; how: string }[];
  tasks: Advice[];             // the rest: tasks in the baseline plan, under "From the readiness report"
}

/** The accepted advice of the latest report handed to the baseline, split into what Initialise preselects and tasks. */
export function readinessHandover(store: Pick<Store, 'root' | 'user'>): Handover | undefined {
  const report = listReports(store).find((r) => r.handedOver);
  if (!report) return undefined;
  const items = report.advice.filter((a) => a.choice !== 'ignore');
  const ids = new Set(items.map((a) => a.id));
  return {
    report: report.id,
    adoptRules: ids.has('CO-02') || ids.has('AT-02'),
    standards: ids.has('SA-01') || ids.has('SA-02') ? ['security-baseline@2'] : [],
    matched: items.filter((a) => MATCHED[a.id]).map((a) => ({ title: a.title, how: MATCHED[a.id] as string })),
    tasks: items.filter((a) => !MATCHED[a.id]),
  };
}

