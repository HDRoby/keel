// One project per folder (REQ-012, CR-0004).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { BDD_PROJECT, git, initialisedFolder, pending, startIdea } from './support';

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

// Opening Keel on a folder: R3 (npx keel) and R4 (Initialise at /, no Projects page).
When('I open Keel on it', async ({ $testInfo }) => {
  pending($testInfo, 'R3 and R4');
});

Then('I see the Initialise screen with the folder path', async ({ $testInfo }) => {
  pending($testInfo, 'R4');
});

Then('there is no Projects page', async ({ $testInfo }) => {
  pending($testInfo, 'R4');
});

Given('a folder initialised by Keel with an approved intent', async ({ $testInfo }) => {
  pending($testInfo, 'R3 and R4');
});

Then('I see the Spec stage', async ({ $testInfo }) => {
  pending($testInfo, 'R4');
});

// Keys stay in the user config folder: R2.
When('I save an Anthropic API key in Settings', async ({ $testInfo }) => {
  pending($testInfo, 'R2');
});

Then('no file in the project folder contains the key', async ({ $testInfo }) => {
  pending($testInfo, 'R2');
});

Then('the key is stored in the user config folder', async ({ $testInfo }) => {
  pending($testInfo, 'R2');
});

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
