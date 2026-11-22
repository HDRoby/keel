// Agree (REQ-017, REQ-014, ADR-0019): only the user's button creates the change request. Without a model call Keel
// assigns the next free IDs (CR, REQ, task R-number, ADR), writes the package with the change package writer
// (CR-0013), moves the discussion to changes/CR-NNNN/discussion.md and commits all of it once.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { packageFiles } from '../changes/flow';
import { CHANGES_INDEX, writeChangesIndex } from '../changes/index-file';
import { nextTaskNumber, writePlan, type ChangePlan } from '../changes/plan';
import { createChange, readChange } from '../changes/store';
import { fail, ok, type Result } from '../result';
import { writeFileAtomic } from '../store/atomic';
import { commitBlocker, commitFiles } from '../store/git';
import type { Store } from '../store/store';
import { CONFIG_FILE, readConfig, writeConfig } from '../store/workspace';
import { formatReqId } from '../trace/assign';
import { buildTrace } from '../trace/index';
import { maxReqNumber } from '../trace/parse';
import { appendEntries, readDiscussion, stamp, moveToChange, type Discussion } from './file';
import { checkProposal, proposalBlock, proposalState, type Proposal } from './proposal';

export interface Agreed { cr: string; files: string[]; screens: string[] }

function nextAdrNumber(root: string): number {
  const numbers: number[] = [];
  const scan = (dir: string) => { if (existsSync(dir)) for (const f of readdirSync(dir)) { const m = /^(\d{4})-/.exec(f); if (m) numbers.push(Number(m[1])); } };
  scan(join(root, 'docs', 'decisions'));
  if (existsSync(join(root, 'changes'))) for (const d of readdirSync(join(root, 'changes'))) scan(join(root, 'changes', d, 'decisions'));
  return Math.max(0, ...numbers) + 1;
}

const slug = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'decision';

function tracked(root: string, path: string): boolean {
  try {
    return execFileSync('git', ['ls-files', '--error-unmatch', '--', path], { cwd: root, stdio: 'ignore' }) !== undefined;
  } catch {
    return false;
  }
}

/** The user's edit of the proposal, recorded as "<user> edited the proposal" with the fields changed. */
export function saveEdit(store: Store, id: string, edited: Proposal, author: string): Result<Discussion, 'not-found' | 'no-proposal' | 'key'> {
  const d = readDiscussion(store.root, id);
  if (!d) return fail('not-found', `No discussion ${id}`);
  const state = proposalState(d);
  if (state.kind !== 'waiting') return fail('no-proposal', 'There is no proposal to edit');
  const before = state.proposal as Record<string, unknown>;
  const changed = Object.keys(edited).filter((k) => JSON.stringify(before[k]) !== JSON.stringify((edited as Record<string, unknown>)[k]));
  return appendEntries(store.root, d, [{ kind: 'edit', author, at: stamp(store.now?.() ?? new Date()), text: `Changed: ${changed.join(', ') || 'nothing'}\n\n${proposalBlock(edited)}` }]);
}

export async function agree(store: Store, id: string): Promise<Result<Agreed, 'not-found' | 'no-proposal' | 'checks' | 'repo-busy' | 'failed'>> {
  const d = readDiscussion(store.root, id);
  if (!d) return fail('not-found', `No discussion ${id}`);
  const state = proposalState(d);
  if (state.kind !== 'waiting') return fail('no-proposal', 'There is no proposal to agree to');
  const p = state.proposal;
  const errors = checkProposal(store, p).filter((c) => c.kind === 'error');
  if (errors.length) return fail('checks', `Fix the proposal first: ${errors.map((e) => e.text).join('; ')}`);
  const blocker = await commitBlocker(store.root);
  if (blocker) return fail('repo-busy', blocker);

  // Requirement IDs: the next free ones, as reserveRequirementIds counts them, saved in the same commit.
  const config = readConfig(store.root) ?? {};
  const fresh = p.requirements.filter((r) => r.id === 'new');
  const first = Math.max(Number.isInteger(config.next_req) ? (config.next_req as number) : 1, maxReqNumber(Object.keys(buildTrace(store.root).requirements).join(' ')) + 1);
  const newIds = fresh.map((_, i) => formatReqId(first + i));
  if (fresh.length) writeConfig(store.root, { ...config, next_req: first + fresh.length });
  let n = 0;
  const requirementChanges = p.requirements.map((r) => ({ ...r, id: r.id === 'new' ? (newIds[n++] as string) : r.id }));
  const resolve = (ids: string[]) => [...new Set(ids.flatMap((i) => (i === 'new' ? newIds : [i])))];
  const requirements = [...new Set(requirementChanges.map((r) => r.id))];

  const made = await createChange(store, {
    title: p.title, reason: p.why, status: 'draft', size: requirementChanges.length ? 'significant' : 'minor', requirements, dependsOn: p.dependsOn,
    draft: { why: p.why, whatChanges: [...p.what.map((w) => `- ${w}`), ...(p.screens.length ? [`- Screens: ${p.screens.join(', ')}`] : [])].join('\n'), doneWhen: p.scenarios.map((s) => `- ${s.title}`).join('\n') || undefined },
    requirementChanges, impactRows: p.impact.map((i) => ({ ...i, requirements: resolve(i.requirements) })),
    extra: { discussion: d.id }, commit: false,
  });
  if (!made.ok) return fail('failed', made.message);
  const cr = made.value;
  const firstTask = nextTaskNumber(store.root);
  const plan: ChangePlan = {
    change: cr.id, plannedAt: (store.now?.() ?? new Date()).toISOString(), codeMap: 'names', shared: [],
    tasks: p.tasks.map((t, i) => ({ id: `R${firstTask + i}`, title: t.title, goal: p.why, requirements, data: 'None.', steps: [], files: t.files.length ? t.files : ['To be decided by the coding agent.'] })),
    scenarios: p.scenarios.map((s, i) => ({
      id: `S${i + 1}`, req: resolve([s.requirement])[0] ?? requirements[0] ?? 'REQ-000', name: s.title, state: 'accepted',
      steps: [{ keyword: 'Given', text: 'the project as it is' }, { keyword: 'When', text: s.title.slice(0, 200) }, { keyword: 'Then', text: 'it works as the change request says' }],
    })),
    linked: { decisions: [], mocks: [], dependsOn: p.dependsOn, clashes: [] },
  };
  const planPath = writePlan(store.root, plan);
  const files = packageFiles(store, readChange(store.root, cr.id) ?? cr);
  if (p.decision) {
    const number = String(nextAdrNumber(store.root)).padStart(4, '0');
    const body = [`# ${p.decision.title}`, '', '## Decision', '', '_To be decided when the change request is approved._', '', '## Alternatives considered', '', ...(p.decision.alternatives.length ? p.decision.alternatives.map((a) => `- ${a}`) : ['- None named yet.']), '', '## Consequences', '', '_Not written yet._', ''].join('\n');
    files.push({ path: `${cr.folder}/decisions/${number}-${slug(p.decision.title)}.md`, content: matter.stringify(`\n${body}`, { id: `ADR-${number}`, status: 'proposed', change: cr.id, date: (store.now?.() ?? new Date()).toISOString().slice(0, 10) }) });
  }
  for (const file of files) {
    mkdirSync(join(store.root, file.path, '..'), { recursive: true });
    writeFileAtomic(join(store.root, file.path), file.content);
  }
  const wasTracked = tracked(store.root, d.path);
  const moved = moveToChange(store.root, d, cr.id, cr.folder);
  const indexed = await writeChangesIndex(store, { commit: false });
  await commitFiles(store.root, [cr.folder, planPath, ...(fresh.length ? [CONFIG_FILE] : []), ...(indexed ? [CHANGES_INDEX] : []), ...(wasTracked ? [d.path] : [])], `${cr.id} from discussion ${d.id}`);
  return ok({ cr: cr.id, files: [`${cr.folder}/${cr.id}.md`, ...files.map((f) => f.path), moved.path], screens: p.screens });
}
