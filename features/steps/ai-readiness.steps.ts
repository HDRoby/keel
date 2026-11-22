// AI readiness report (REQ-016, CR-0015). The fake provider answers each area, records what each readiness call sent
// (KEEL_FAKE_LOG.requests) and, through KEEL_FAKE_LOG.control.json, can stay silent or cite a file that does not exist.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { readChange } from '../../src/lib/changes/store';
import { saveChoices } from '../../src/lib/readiness/report';
import { runReadiness } from '../../src/lib/readiness/run';
import { initialiseProject } from '../../src/lib/store/workspace';
import { BDD_PROJECT, BDD_USER, bddStore, FAKE_LOG } from './support';

const { Given, When, Then } = createBdd();
const FIXTURES = join(process.cwd(), 'features', 'fixtures', 'folders');
const REQUESTS = `${FAKE_LOG}.requests`;
const SECRET = 'fixture-not-a-key';

let offered = false;
let adviceCount = 0;
let ignoredTitle = '';

function fixture(name: string): void {
  cpSync(join(FIXTURES, name), BDD_PROJECT, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd: BDD_PROJECT, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'Start');
}

function requests(): { system: string; user: string }[] {
  return existsSync(REQUESTS) ? readFileSync(REQUESTS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { system: string; user: string }) : [];
}
const sentFiles = () => requests().flatMap((r) => (JSON.parse(r.user) as { files: { path: string; text: string }[] }).files);
const control = (readiness: 'silent' | 'bad-path') => writeFileSync(`${FAKE_LOG}.control.json`, JSON.stringify({ readiness }));
const area = (page: Page, name: string) => page.getByRole('region', { name: 'Areas' }).getByRole('article', { name, exact: true });
const adviceForm = (page: Page) => page.getByRole('form', { name: 'Advice' });

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}

Given('an existing project folder without AI files', async () => {
  fixture('existing');
});

When('I open the folder and go through Initialise', async ({ page }) => {
  await page.goto('/');
  offered = await page.getByRole('region', { name: 'What Keel found' }).getByRole('link', { name: 'Check AI readiness' }).isVisible();
  await page.getByLabel('Title').fill('Readme helper');
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('radiogroup', { name: 'How to start' }).getByRole('radio', { name: 'Treat the next feature as the project' }).check();
  await page.getByRole('button', { name: 'Initialise and start brainstorm' }).click();
  await page.waitForURL(/\/explore$/);
});

Then('no readiness model call is made', async () => {
  expect(readFileSync(FAKE_LOG, 'utf8')).not.toContain(' readiness');
  expect(requests()).toEqual([]);
});

Then('What Keel found offers {string}', async ({}, label: string) => {
  expect(label).toBe('Check AI readiness');
  expect(offered).toBe(true);
});

Given('the fixture folder {string}', async ({}, name: string) => {
  fixture(name);
});

Given('I untick {string}', async ({ page }, path: string) => {
  await page.goto('/readiness');
  await page.getByRole('checkbox', { name: path, exact: true }).uncheck();
});

When('I open the AI readiness report', async ({ page }) => {
  await page.goto('/readiness');
});

When('I run the AI readiness check', async ({ page }) => {
  if (!page.url().includes('/readiness') || !(await page.getByRole('button', { name: 'Run the check' }).isVisible())) await page.goto('/readiness?run=1');
  await page.getByRole('button', { name: 'Run the check' }).click();
  await expect(adviceForm(page)).toBeVisible({ timeout: 30_000 });
});

Then('the report rates the six areas', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Areas' }).getByRole('article')).toHaveCount(6);
  for (const name of ['Agent instructions', 'Project knowledge', 'Verification', 'Conventions', 'Agent tooling', 'Safety']) {
    await expect(area(page, name)).toContainText(/Ready|Partly|Missing/);
  }
});

Then('the advice button reads {string}', async ({ page }, label: string) => {
  await expect(adviceForm(page).getByRole(label === 'Initialise this folder' ? 'link' : 'button', { name: label })).toBeVisible();
});

Then('the model receives file and folder names', async () => {
  const sent = requests();
  expect(sent).toHaveLength(6);
  for (const r of sent) expect((JSON.parse(r.user) as { names: string[] }).names).toEqual(expect.arrayContaining(['AGENTS.md', 'package.json', 'src/index.ts']));
});

Then('the model receives the content of {string}', async ({}, path: string) => {
  const text = readFileSync(join(BDD_PROJECT, path), 'utf8');
  expect(sentFiles()).toContainEqual({ path, text });
});

Then('the model does not receive the content of {string}', async ({}, path: string) => {
  const text = readFileSync(join(BDD_PROJECT, path), 'utf8').trim();
  expect(sentFiles().map((f) => f.path)).not.toContain(path);
  expect(requests().some((r) => r.user.includes(JSON.stringify(text).slice(1, -1)))).toBe(false);
});

Then('{string} cannot be ticked', async ({ page }, path: string) => {
  const box = page.getByRole('checkbox', { name: path, exact: true });
  await expect(box).toBeDisabled();
  await expect(box).not.toBeChecked();
  await expect(page.getByText('May contain keys: never sent')).toBeVisible();
});

Then('Safety is rated {string} with advice to remove the key from {string}', async ({ page }, rating: string, path: string) => {
  await expect(area(page, 'Safety')).toContainText(rating);
  await expect(adviceForm(page).getByRole('listitem', { name: `Remove the key from ${path}, move it to an environment variable and rotate it` })).toBeVisible();
});

Then('the value {string} appears nowhere in the request, the page or the saved report', async ({ page }, value: string) => {
  expect(value).toBe(SECRET);
  expect(requests().length).toBeGreaterThan(0);
  expect(readFileSync(REQUESTS, 'utf8')).not.toContain(value);
  expect(await page.content()).not.toContain(value);
  const reports = filesUnder(join(BDD_USER, 'reports'));
  expect(reports.length).toBeGreaterThan(0);
  for (const file of reports) expect(readFileSync(file, 'utf8')).not.toContain(value);
});

Given('the model suggests advice based on {string}', async ({}, path: string) => {
  expect(path).toBe('docs/does-not-exist.md');
  control('bad-path');
});

Then('that advice is not shown', async ({ page }) => {
  // The fake model did suggest it…
  expect(requests().some((r) => r.system.includes('Project knowledge'))).toBe(true);
  // …and Keel dropped it, because the file is not in the scan.
  await expect(adviceForm(page)).not.toContainText('Write an architecture overview');
  await expect(adviceForm(page)).toContainText('Say in the README what the project is for');
});

Given('the model does not answer', async () => {
  control('silent');
});

Then('the six areas are rated from the scan', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Areas' }).getByRole('article')).toHaveCount(6);
  await expect(area(page, 'Verification')).toContainText('Missing');
  await expect(adviceForm(page)).toContainText('Run the tests in CI');
});

Then('I see "The model review did not finish"', async ({ page }) => {
  await expect(page.getByText('The model review did not finish').first()).toBeVisible();
});

Then('Agent instructions is rated {string}', async ({ page }, rating: string) => {
  await expect(area(page, 'Agent instructions')).toContainText(rating);
});

Then('the advice {string} is based on {string}', async ({ page }, title: string, path: string) => {
  const item = adviceForm(page).getByRole('listitem', { name: title });
  await expect(item).toContainText('Based on:');
  await expect(item).toContainText(path);
});

When('I set one advice item to {string}', async ({ page }, choice: string) => {
  const items = adviceForm(page).getByRole('listitem');
  adviceCount = await items.count();
  expect(adviceCount).toBeGreaterThan(1);
  await items.first().getByRole('radiogroup').getByText(choice, { exact: true }).click();
});

When('I press {string}', async ({ page }, label: string) => {
  await page.getByRole('button', { name: label }).click();
});

Then('a draft change request is created with one task for each item set to Add or Adopt', async ({ page }) => {
  await expect(page.getByText(/CR-0001 created as a draft/)).toBeVisible();
  const cr = readChange(BDD_PROJECT, 'CR-0001');
  expect(cr).toMatchObject({ status: 'draft', origin: 'keel' });
  expect(readdirSync(join(BDD_PROJECT, 'changes', 'CR-0001', 'tasks'))).toHaveLength(adviceCount - 1);
});

Given('an initialised folder with a readiness report from an earlier day', async () => {
  fixture('existing');
  const store = { ...bddStore(), now: () => new Date('2026-11-01T09:00:00Z') };
  expect((await initialiseProject(store, { title: 'Readme helper', author: 'Ada Lovelace' })).ok).toBe(true);
  const run = await runReadiness(store, { ticked: [] }, async () => undefined);
  expect(run.ok).toBe(true);
  if (!run.ok) return;
  const first = run.value.report.advice[0];
  expect(first).toBeDefined();
  ignoredTitle = first?.title ?? '';
  expect((await saveChoices(store, run.value.report.id, { [first?.id ?? '']: 'ignore' })).ok).toBe(true);
});

Then('a new report is committed in .keel\\/reports', async () => {
  const files = readdirSync(join(BDD_PROJECT, '.keel', 'reports'));
  expect(files).toHaveLength(2);
  const subject = execFileSync('git', ['log', '-1', '--format=%an|%s'], { cwd: BDD_PROJECT, encoding: 'utf8' }).trim();
  expect(subject).toMatch(/^Keel\|Keel: AI readiness report readiness-\d{4}-\d{2}-\d{2}$/);
});

Then('Earlier reports lists both', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Earlier reports' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Earlier reports' })).toContainText('readiness-2026-11-01.md');
});

Then('ignored advice from the earlier report is not shown again', async ({ page }) => {
  expect(ignoredTitle).not.toBe('');
  await expect(adviceForm(page).getByRole('listitem', { name: ignoredTitle, exact: true })).toHaveCount(0);
  await expect(adviceForm(page)).toContainText('ignored in an earlier report');
});
