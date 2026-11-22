// Shared helpers for the scenarios. The dev server works on one temporary project folder and one
// temporary user folder (playwright.config.ts); every scenario starts with both empty.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { recordDecision, review } from '../../src/lib/gates/approvals';
import { generatePlan } from '../../src/lib/generate/plan';
import { generateSpec } from '../../src/lib/generate/spec';
import { openIndex, type Store } from '../../src/lib/store/db';
import { createDocument, parseDocument } from '../../src/lib/store/documents';
import { initialiseProject } from '../../src/lib/store/workspace';

/** The folders the dev server uses (playwright.config.ts). */
export const BDD_PROJECT = join(tmpdir(), 'keel-bdd-project');
export const BDD_USER = join(tmpdir(), 'keel-bdd-user');

const { Before } = createBdd();

/** Each scenario starts from an empty project folder (not a git repository) and an empty user folder. */
Before(async () => {
  mkdirSync(BDD_PROJECT, { recursive: true });
  for (const entry of readdirSync(BDD_PROJECT)) rmSync(join(BDD_PROJECT, entry), { recursive: true, force: true });
  rmSync(BDD_USER, { recursive: true, force: true });
  mkdirSync(BDD_USER, { recursive: true });
});

/** Marks a scenario step that a later rework task builds; the scenario is reported as fixme until then. */
export function pending(testInfo: TestInfo, task: string): void {
  testInfo.fixme(true, `Built in ${task} (CR-0004)`);
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
  await page.getByRole('radiogroup', { name: 'Intent template' }).getByRole('radio', { name: options.template ?? 'Standard intent v3', exact: true }).check();
  await page.getByRole('radiogroup', { name: 'Brainstorm style' }).getByRole('radio', { name: options.style ?? 'Challenger', exact: true }).check();
  await page.getByRole('button', { name: 'Initialise and start brainstorm' }).click();
  await page.waitForURL(/\/explore$/);
  await expect(chatEntries(page)).toHaveCount(1);
}

/** The messages shown in the brainstorm chat. */
export function chatEntries(page: Page) {
  return page.getByRole('region', { name: 'Brainstorm' }).getByRole('listitem');
}

/** Answers the open question and waits for the assistant's next question. */
export async function answerCurrent(page: Page, text = 'An answer the proposer can defend.'): Promise<void> {
  const before = await chatEntries(page).count();
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(chatEntries(page)).toHaveCount(before + 2);
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

/** Answers until every required section is captured, so the intent can be drafted. */
export async function answerRequiredSections(page: Page): Promise<void> {
  const draft = page.getByRole('button', { name: 'Draft intent.md' });
  for (let i = 0; i < 20 && (await draft.isDisabled()); i += 1) await answerCurrent(page);
  await expect(draft).toBeEnabled();
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
  expect((await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth it.', consequences: '' })).ok).toBe(true);
  expect((await generatePlan(store, silent)).ok).toBe(true);
  expect((await review(store, 'plan', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  await extra?.(store);
  store.index.close();
}
