// Shared helpers for the scenarios. The dev server works on one temporary project folder and one
// temporary user folder (playwright.config.ts); every scenario starts with both empty.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { fillSections } from '../../src/lib/brainstorm/fill';
import { startIdea as startExplore } from '../../src/lib/brainstorm/session';
import { recordDecision, review } from '../../src/lib/gates/approvals';
import { saveExploreTiming } from '../../src/lib/settings/settings';
import { generatePlan } from '../../src/lib/generate/plan';
import { generateSpec } from '../../src/lib/generate/spec';
import { raiseScenarioChange } from '../../src/lib/changes/scenarios';
import { acceptAllSuggestions } from '../../src/lib/scenarios/store';
import { openIndex, type Store } from '../../src/lib/store/db';
import { createDocument, parseDocument } from '../../src/lib/store/documents';
import { initialiseProject } from '../../src/lib/store/workspace';

/** The folders the dev server uses (playwright.config.ts). */
export const BDD_PROJECT = join(tmpdir(), 'keel-bdd-project');
export const BDD_USER = join(tmpdir(), 'keel-bdd-user');
/** One line per model call made by the fake provider (playwright.config.ts: KEEL_FAKE_LOG). */
export const FAKE_LOG = join(tmpdir(), 'keel-bdd-fake.log');

const { Before } = createBdd();

/** Each scenario starts from an empty project folder (not a git repository) and an empty user folder. */
Before(async () => {
  mkdirSync(BDD_PROJECT, { recursive: true });
  for (const entry of readdirSync(BDD_PROJECT)) rmSync(join(BDD_PROJECT, entry), { recursive: true, force: true });
  rmSync(BDD_USER, { recursive: true, force: true });
  mkdirSync(BDD_USER, { recursive: true });
  // Reviews after a 1-second pause and at most one a second, so scenarios do not wait 5 and 10 seconds.
  saveExploreTiming({ user: BDD_USER }, { pauseSeconds: 1, intervalSeconds: 1 });
  writeFileSync(FAKE_LOG, '');
});

/** How many model calls the fake provider has made so far in this scenario. */
export function modelCalls(): number {
  return existsSync(FAKE_LOG) ? readFileSync(FAKE_LOG, 'utf8').split('\n').filter(Boolean).length : 0;
}

/** git in the project folder. */
export function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: BDD_PROJECT, encoding: 'utf8' }).trim();
}

/** A store on the project folder, for steps that set up state through the same functions the pages use. */
export function bddStore(): Store {
  return { root: BDD_PROJECT, user: BDD_USER, index: openIndex(BDD_PROJECT) };
}

/** The address of a stage page: one project per folder, so no project in the URL. */
export function stagePath(stage: string): string {
  return `/${stage}`;
}

/** The screen that initialises a folder. */
export const INITIALISE_PATH = '/';

export async function startIdea(page: Page, options: { template?: string; style?: string; title?: string } = {}): Promise<void> {
  await page.goto(INITIALISE_PATH);
  await page.getByLabel('Title').fill(options.title ?? 'Readme helper');
  await page.getByLabel('Description').fill('Help newcomers run any repository.');
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('radiogroup', { name: 'Intent template' }).getByRole('radio', { name: options.template ?? 'Standard intent v4', exact: true }).check();
  await page.getByRole('radiogroup', { name: 'Brainstorm style' }).getByRole('radio', { name: options.style ?? 'Challenger', exact: true }).check();
  await page.getByRole('button', { name: 'Initialise and start brainstorm' }).click();
  await page.waitForURL(/\/explore$/);
  await reviewed(page);
}

/** Waits until the assistant has reviewed all sections and no review is running. */
export async function reviewed(page: Page): Promise<void> {
  await expect(page.getByRole('status', { name: 'Review status' })).toContainText('Assistant reviewed all sections', { timeout: 15_000 });
}

/** A section's card in Explore. */
export function section(page: Page, key: string) {
  return page.getByRole('region', { name: key, exact: true });
}

/** A text section's field. */
export function field(page: Page, key: string) {
  return section(page, key).getByRole('textbox', { name: key, exact: true });
}

/** Fills the required sections in the page, as the user types them, so Draft intent.md is enabled. */
export async function fillRequiredSections(page: Page): Promise<void> {
  const draft = page.getByRole('button', { name: /^Draft intent\.md/ });
  if (await draft.isEnabled()) return;
  const texts: [string, string][] = [['Problem', 'Newcomers cannot find how to run a project.'], ['Who it is for', 'Developers new to a repository.'], ['Desired outcome', 'Anyone runs a project in five minutes.']];
  for (const [key, text] of texts) {
    const box = field(page, key);
    // A suggestion from the assistant is replaced by the user's own text.
    if (!(await box.inputValue()) || (await box.getAttribute('class'))?.includes('suggested')) await box.fill(text);
  }
  const rows = section(page, 'Requirements');
  const accept = rows.getByRole('button', { name: 'Accept' });
  if (await accept.count()) {
    await accept.first().click();   // a row the assistant suggested from Desired outcome
  } else {
    await rows.getByRole('button', { name: '+ Add requirement' }).click();
    await rows.getByRole('textbox').last().fill('Show the run command');
  }
  await expect(draft).toBeEnabled();
}

/** A project initialised with Explore's sections filled through the same functions the page uses. */
export async function exploreWith(values: Record<string, string | string[]>, template = 'standard-intent@4'): Promise<Store> {
  const store = bddStore();
  const made = await startExplore(store, { title: 'Expense tracker', idea: 'Track what the team spends.', author: 'Ada Lovelace', template, style: 'challenger@1' });
  if (!made.ok) throw new Error(made.message);
  if (Object.keys(values).length) {
    const filled = fillSections(store, values);
    if (!filled.ok) throw new Error(filled.message);
  }
  return store;
}

export function intentHeader(): Record<string, unknown> {
  const parsed = parseDocument(readFileSync(join(BDD_PROJECT, 'docs', 'intent.md'), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value.header;
}

/** An initialised folder: git repository, .keel and the project config, with nothing else yet. */
export async function initialisedFolder(title = 'Handoff demo', standards: string[] = []): Promise<Store> {
  const store = bddStore();
  const made = await initialiseProject(store, { title, author: 'Ada Lovelace', standards });
  if (!made.ok) throw new Error(made.message);
  return store;
}

/**
 * A project taken to an approved plan through the same functions the stage pages use, with no model.
 * `extra` runs with the store before it is closed, for example to save a provider key.
 */
export async function projectWithApprovedPlan(extra?: (store: Store) => void | Promise<void>): Promise<void> {
  const store = await initialisedFolder('Handoff demo', ['security-baseline@2']);
  const silent = async () => undefined;
  await createDocument(store, {
    kind: 'intent', title: 'Handoff demo', template: 'standard-intent@3',
    body: '# Intent: Handoff demo\n\n## Requirements\n\n- REQ-001 Show the run command\n- REQ-002 Export the log (as CSV)\n',
  });
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  expect((await generateSpec(store, 'requirements-and-design-spec@2', silent)).ok).toBe(true);
  expect((await acceptAllSuggestions(store, raiseScenarioChange)).ok).toBe(true);   // the draft's scenarios, accepted (CR-0006)
  expect((await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth it.', consequences: '' })).ok).toBe(true);
  expect((await generatePlan(store, silent)).ok).toBe(true);
  expect((await review(store, 'plan', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  await extra?.(store);
  store.index.close();
}
