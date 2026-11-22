// npm run ui:shots (CR-0008, task R13): a screenshot of every route at 1440 x 900, full page, in test-results/ui/,
// to compare side by side with docs/mocks/source/ and the checklist in docs/ui-guide.md. Not part of verify.
// Builds two temporary folders with the same functions the pages use: an empty one (Initialise) and a sample
// project like the mockup's (intent approved, spec with design topics, plan approved, handoff written, a change
// request). Starts Keel on each with the fake provider; no model, no network.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { fillSections } from '../src/lib/brainstorm/fill';
import { startIdea } from '../src/lib/brainstorm/session';
import { createChange } from '../src/lib/changes/store';
import { raiseScenarioChange } from '../src/lib/changes/scenarios';
import { decide } from '../src/lib/decisions/records';
import { recordDecision, review } from '../src/lib/gates/approvals';
import { DESIGN_MARKER } from '../src/lib/generate/design';
import { draftIntent } from '../src/lib/generate/intent';
import { generatePlan } from '../src/lib/generate/plan';
import { generateSpec } from '../src/lib/generate/spec';
import type { Writer } from '../src/lib/generate/writer';
import { writeHandoff } from '../src/lib/handoff/write';
import { fakeReply } from '../src/lib/providers/fake';
import { acceptAllSuggestions } from '../src/lib/scenarios/store';
import { type Store } from '../src/lib/store/store';
import { createDocument, readDocument } from '../src/lib/store/documents';

const PORT = 3200;
const OUT = join(process.cwd(), 'test-results', 'ui');
const EMPTY = join(tmpdir(), 'keel-ui-empty');
const SAMPLE = join(tmpdir(), 'keel-ui-sample');
const USER = join(tmpdir(), 'keel-ui-user');

const ROUTES_EMPTY: [string, string][] = [['initialise', '/']];
const ROUTES_SAMPLE: [string, string][] = [
  ['setup', '/setup'], ['explore', '/explore'], ['intent', '/intent'], ['spec', '/spec'], ['spec-design', '/spec?tab=design'], ['spec-scenarios', '/spec?tab=scenarios'], ['spec-mock', '/spec?tab=mock'], ['plan', '/plan'], ['handoff', '/handoff'],
  ['roadmap', '/roadmap'], ['changes', '/changes'], ['change', '/changes/CR-0001'], ['templates', '/templates'], ['styles', '/styles'],
  ['standards', '/standards'], ['settings', '/settings'], ['trace', '/trace'], ['versions', '/versions?doc=intent'], ['gallery', '/dev/ui'], ['not-found', '/no-such-page'],
];

const designOnly: Writer = async (_task, messages) => (messages[0]?.content.includes(DESIGN_MARKER) ? fakeReply('anthropic', messages) : undefined);
const must = <T extends { ok: boolean }>(what: string, r: T): T => {
  if (!r.ok) throw new Error(`${what}: ${JSON.stringify(r)}`);
  return r;
};

function fresh(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

async function sampleProject(): Promise<void> {
  fresh(SAMPLE);
  const store: Store = { root: SAMPLE, user: USER };
  must('start', await startIdea(store, { title: 'Keel', idea: 'Turn an idea into documents a coding agent can build from.', author: 'Ada Lovelace', template: 'standard-intent@4', style: 'challenger@1', standards: ['security-baseline@2', 'typescript-conventions@3'] }));
  must('fill', fillSections(store, {
    Problem: 'Ideas reach coding agents as loose chat, so the agent guesses the scope and the team cannot review it.',
    'Who it is for': 'Product owners and engineers who hand work to coding agents.',
    'Desired outcome': 'Every idea becomes an approved intent, spec and plan in the repository before code is written.',
    Requirements: ['Template sections with live comments', 'intent.md assembled from the sections', 'Spec with design decisions'],
  }));
  must('draft', await draftIntent(store));
  must('approve intent', await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: 'Clear.' }));
  must('spec', await generateSpec(store, 'requirements-and-design-spec@3', designOnly));
  for (const id of ['form', 'language-and-framework', 'storage', 'model-access', 'testing']) must(`decide ${id}`, await decide(store, id, { chosen: `${id}-1`, reason: 'Recommended.' }));
  must('scenarios', await acceptAllSuggestions(store, raiseScenarioChange));
  must('go', await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth building.', consequences: '' }));
  must('plan', await generatePlan(store, async () => undefined));
  must('approve plan', await review(store, 'plan', { action: 'approve', by: 'Ada Lovelace', comment: '' }));
  must('handoff', await writeHandoff(store));
  // The handoff's roadmap has no id or version, so the Roadmap page cannot read it (reported in tasks/R13.md);
  // the sample uses a full document instead.
  if (!readDocument(store, 'docs/roadmap.md').ok) {
    rmSync(join(SAMPLE, 'docs', 'roadmap.md'), { force: true });
    must('roadmap', await createDocument(store, { kind: 'roadmap', title: 'Keel', template: 'roadmap@1', body: [
      '# Roadmap: Keel', '', '## Now (v0.1)', '', '- Brainstorm, intent, spec and plan — REQ-001 to REQ-003', '- Handoff and read-back — the agent files and its changes', '',
      '## Next', '', '- Change requests and approvals — already in the flow', '- Standards and agent kit', '- BDD acceptance scenarios', '',
      '## Later', '', '- Multi-user roles and approvals — out of scope in spec v1', '- Built-in mock generation — mock references come first', '',
      '## Not doing', '', '- A hosted service — Keel runs on your computer', '',
    ].join('\n') }));
  }
  must('change', await createChange(store, { title: 'Export the log as CSV', reason: 'Finance asked for it.', status: 'waiting', size: 'significant', source: 'docs/intent.md', affects: ['INT-0001@2'], requirements: ['REQ-002'], impact: [{ document: 'docs/spec.md', decision: 'pending' }, { document: 'docs/plan.md', decision: 'pending' }] }));
}

async function serve(project: string): Promise<ChildProcess> {
  const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { env: { ...process.env, KEEL_PROJECT_DIR: project, KEEL_USER_DIR: USER, KEEL_PROVIDER: 'fake', KEEL_READBACK_SECONDS: '0' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/settings`)).ok) return server;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Keel did not start');
}

function stop(server: ChildProcess): void {
  if (server.pid) process.kill(-server.pid, 'SIGTERM');
}

async function shoot(routes: [string, string][]): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const [name, route] of routes) {
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    console.log(`test-results/ui/${name}.png  ${route}`);
  }
  await browser.close();
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  fresh(USER);
  fresh(EMPTY);
  for (const [project, routes, build] of [[EMPTY, ROUTES_EMPTY, undefined], [SAMPLE, ROUTES_SAMPLE, sampleProject]] as const) {
    await build?.();
    const server = await serve(project);
    try {
      await shoot(routes);
    } finally {
      stop(server);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
