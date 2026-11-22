// One project per folder (REQ-012, CR-0004).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { review } from '../../src/lib/gates/approvals';
import { providerConfig } from '../../src/lib/settings/settings';
import { createDocument } from '../../src/lib/store/documents';
import { bddStore, BDD_PROJECT, BDD_USER, git, initialisedFolder, pending, startIdea } from './support';

const { Given, When, Then } = createBdd();

Given('an empty git repository', async () => {
  git('init', '-q', '--initial-branch=main');
});

Given('an empty folder that is not a git repository', async () => {
  expect(existsSync(join(BDD_PROJECT, '.git'))).toBe(false);
});

Given('an initialised folder', async () => {
  (await initialisedFolder('Expense tracker')).index.close();
});

When('I initialise it with the title {string}, the standard intent template and the Coach style', async ({ page }, title: string) => {
  await startIdea(page, { title, template: 'Standard intent v3', style: 'Coach' });
});

When('I initialise it', async ({ page }) => {
  await startIdea(page);
});

Then('.keel\\/config.yml has the title {string}', async ({}, title: string) => {
  expect(readFileSync(join(BDD_PROJECT, '.keel', 'config.yml'), 'utf8')).toContain(`title: ${title}`);
});

Then('.keel contains the templates, styles and standards folders', async () => {
  for (const folder of ['templates', 'styles', 'standards']) expect(existsSync(join(BDD_PROJECT, '.keel', folder)), folder).toBe(true);
});

Then('.keel\\/.gitignore ignores the cache folder', async () => {
  expect(readFileSync(join(BDD_PROJECT, '.keel', '.gitignore'), 'utf8')).toBe('cache/\n');
  expect(git('check-ignore', '.keel/cache/index.db')).toBe('.keel/cache/index.db');
});

Then('the last commit is {string}', async ({}, subject: string) => {
  expect(git('log', '-1', '--format=%s')).toBe(subject);
});

Then('the folder is a git repository', async () => {
  expect(git('rev-parse', '--is-inside-work-tree')).toBe('true');
  expect(git('rev-parse', '--show-toplevel')).toMatch(/keel-bdd-project$/);
});

// Opening Keel on a folder. `npx keel <folder>` starts the server with KEEL_PROJECT_DIR and opens "/"
// (src/cli/keel-command.test.ts); the dev server here already runs on the scenario's folder.
When('I open Keel on it', async ({ page }) => {
  await page.goto('/');
});

Then('I see the Initialise screen with the folder path', async ({ $testInfo }) => {
  pending($testInfo, 'R4');
});

Then('there is no Projects page', async ({ $testInfo }) => {
  pending($testInfo, 'R4');
});

Given('a folder initialised by Keel with an approved intent', async () => {
  const store = await initialisedFolder('Expense tracker');
  await createDocument(store, {
    kind: 'intent', title: 'Expense tracker', template: 'standard-intent@3',
    body: '# Intent: Expense tracker\n\n## Requirements\n\n- REQ-001 Record an expense\n',
  });
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  store.index.close();
});

Then('I see the Spec stage', async ({ page }) => {
  await page.waitForURL(/\/spec$/);
  const spec = page.getByRole('navigation', { name: 'Stages' }).getByRole('link', { name: /^\d · Spec\b/ });
  await expect(spec).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('form', { name: 'Generate spec' })).toBeVisible();
});

// Keys stay in the user config folder (ADR-0011). Made up for the test.
const API_KEY = 'sk-ant-api03-folder-test-0123456789abcdefghij';

When('I save an Anthropic API key in Settings', async ({ page }) => {
  await page.goto('/settings');
  const form = page.getByRole('form', { name: 'Anthropic connection' });
  await form.getByLabel('API key').fill(API_KEY);
  await form.getByRole('button', { name: 'Save Anthropic' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
});

Then('no file in the project folder contains the key', async () => {
  const containing = filesUnder(BDD_PROJECT).filter((file) => readFileSync(file).toString('latin1').includes(API_KEY));
  expect(containing).toEqual([]);
});

Then('the key is stored in the user config folder', async () => {
  const settings = readFileSync(join(BDD_USER, 'settings.json'), 'utf8');
  expect(settings).toContain('"provider.anthropic"');
  expect(settings).not.toContain(API_KEY);
  expect(statSync(join(BDD_USER, 'secret.key')).mode & 0o777).toBe(0o600);
  expect(providerConfig(bddStore(), 'anthropic')).toMatchObject({ ok: true, value: { apiKey: API_KEY } });
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

// Commits only Keel's own paths: R5.
Given('I have staged a change to {string}', async ({ $testInfo }, path: string) => {
  pending($testInfo, `R5 (staged ${path})`);
});

When('I save the intent', async ({ $testInfo }) => {
  pending($testInfo, 'R5');
});

Then('the Keel commit contains only docs\\/intent.md', async ({ $testInfo }) => {
  pending($testInfo, 'R5');
});

Then('{string} is still staged', async ({ $testInfo }, path: string) => {
  pending($testInfo, `R5 (staged ${path})`);
});

// Adopting existing documents: R9.
Given('a git repository with a docs\\/intent.md that has a Keel header', async ({ $testInfo }) => {
  pending($testInfo, 'R9');
});

When('I initialise it and choose Adopt', async ({ $testInfo }) => {
  pending($testInfo, 'R9');
});

Then('the intent is shown with its existing version', async ({ $testInfo }) => {
  pending($testInfo, 'R9');
});

Then('.keel\\/config.yml has the intent\'s project id', async ({ $testInfo }) => {
  pending($testInfo, 'R9');
});
