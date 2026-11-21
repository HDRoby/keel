// Shared helpers for scenarios that drive the brainstorm in the browser.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { recordDecision, review } from '../../src/lib/gates/approvals';
import { generatePlan } from '../../src/lib/generate/plan';
import { generateSpec } from '../../src/lib/generate/spec';
import { ensureSeed } from '../../src/lib/seed';
import { openIndex, type Store } from '../../src/lib/store/db';
import { createDocument, parseDocument } from '../../src/lib/store/documents';
import { createProject } from '../../src/lib/store/workspace';

/** Same workspace folder the dev server uses (playwright.config.ts). */
export const BDD_HOME = join(tmpdir(), 'keel-bdd');

/** The project the current scenario works on. Scenarios run one at a time (workers: 1). */
export const world = { slug: '' };

export async function startIdea(page: Page, options: { template?: string; style?: string } = {}): Promise<void> {
  await page.goto('/start');
  await page.getByLabel('Title').fill(`Readme helper ${Date.now()}`);
  await page.getByLabel('The idea in a sentence or two').fill('Help newcomers run any repository.');
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('radiogroup', { name: 'Intent template' }).getByRole('radio', { name: options.template ?? 'Standard intent v3', exact: true }).check();
  await page.getByRole('radiogroup', { name: 'Brainstorm style' }).getByRole('radio', { name: options.style ?? 'Challenger', exact: true }).check();
  await page.getByRole('button', { name: 'Start brainstorm' }).click();
  await page.waitForURL(/\/projects\/[a-z0-9-]+\/explore$/);
  world.slug = /\/projects\/([a-z0-9-]+)\/explore/.exec(page.url())?.[1] ?? '';
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
  const parsed = parseDocument(readFileSync(join(BDD_HOME, 'projects', world.slug, 'docs', 'intent.md'), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value.header;
}

/**
 * A project taken to an approved plan through the same functions the stage pages use, with no model.
 * `extra` runs with the store before it is closed, for example to save a provider key.
 */
export async function projectWithApprovedPlan(prefix: string, extra?: (store: Store) => void | Promise<void>): Promise<void> {
  const store = { home: BDD_HOME, index: openIndex(BDD_HOME) };
  const silent = async () => undefined;
  ensureSeed(BDD_HOME);
  world.slug = `${prefix}-${Date.now()}`;
  await createProject(store, { slug: world.slug, title: 'Handoff demo', author: 'Ada Lovelace', standards: ['security-baseline@2'] });
  await createDocument(store, world.slug, {
    kind: 'intent', title: 'Handoff demo', template: 'standard-intent@3',
    body: '# Intent: Handoff demo\n\n## Requirements\n\n- REQ-001 Show the run command\n- REQ-002 Export the log (as CSV)\n',
  });
  expect((await review(store, world.slug, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  expect((await generateSpec(store, world.slug, 'requirements-and-design-spec@2', silent)).ok).toBe(true);
  expect((await recordDecision(store, world.slug, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth it.', consequences: '' })).ok).toBe(true);
  expect((await generatePlan(store, world.slug, silent)).ok).toBe(true);
  expect((await review(store, world.slug, 'plan', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  await extra?.(store);
  store.index.close();
}
