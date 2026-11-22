// Opening a folder: new, already Keel, existing project, existing project with its own AI setup (REQ-012, REQ-006, task R15).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { raiseScenarioChange } from '../../src/lib/changes/scenarios';
import { recordDecision, review } from '../../src/lib/gates/approvals';
import { generatePlan } from '../../src/lib/generate/plan';
import { generateSpec } from '../../src/lib/generate/spec';
import { acceptAllSuggestions } from '../../src/lib/scenarios/store';
import { createDocument } from '../../src/lib/store/documents';
import { readConfig, writeConfig } from '../../src/lib/store/workspace';
import { BDD_PROJECT, bddStore, git, initialisedFolder, modelCalls } from './support';

const { Given, When, Then } = createBdd();

const MY_AGENTS = '# Our agent instructions\n\nUse pnpm, never npm or yarn\n';
let configBefore = '';
let commitsBefore = '';

function files(entries: Record<string, string>): void {
  for (const [path, text] of Object.entries(entries)) {
    mkdirSync(join(BDD_PROJECT, path, '..'), { recursive: true });
    writeFileSync(join(BDD_PROJECT, path), text);
  }
}

function repository(entries: Record<string, string>): void {
  files(entries);
  git('init', '-q');
  git('-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'add', '-A');
  git('-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'commit', '-qm', 'Our project');
}

const found = (page: Page) => page.getByRole('region', { name: 'What Keel found' });

/** Fills Initialise as a user does and presses the main button. */
async function initialise(page: Page, path?: 'baseline' | 'feature'): Promise<void> {
  await page.getByLabel('Title').fill('Our project');
  await page.getByLabel('Your name').fill('Ada Lovelace');
  if (path) await page.getByRole('radiogroup', { name: 'How to start' }).getByRole('radio', { name: path === 'baseline' ? 'Record what exists, then plan the next change' : 'Treat the next feature as the project' }).check();
  await page.getByRole('button', { name: /^Initialise and / }).click();
  await page.waitForURL(/\/explore/);
}

Given('an empty folder', async () => {
  // Each scenario starts from an empty folder (support.ts).
});

// "I open Keel on it" is defined in project-folder.steps.ts: it opens /.

Then('"What Keel found" says it is a new project', async ({ page }) => {
  await expect(found(page)).toContainText('New project');
  await expect(found(page).getByRole('status')).toContainText('This is a new project');
  await expect(found(page)).toContainText('Not a git repository yet: Keel will run git init.');
});

Then('the main button is {string}', async ({ page }, label: string) => {
  await expect(page.getByRole('button', { name: label })).toBeVisible();
});

Given('a folder whose .keel\\/config.yml has format 1', async () => {
  const store = await initialisedFolder('Old project');
  store.index.close();
  const old = { ...readConfig(BDD_PROJECT) };
  delete old.format;
  delete old.mock_gate;
  writeConfig(BDD_PROJECT, old);
  git('-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'commit', '-qam', 'A config from an older Keel');
  configBefore = readFileSync(join(BDD_PROJECT, '.keel', 'config.yml'), 'utf8');
  commitsBefore = git('rev-list', '--count', 'HEAD');
});

Then('I am offered to upgrade the config in one Keel commit', async ({ page }) => {
  const card = page.getByRole('region', { name: 'Upgrade the config' });
  await expect(card).toContainText('.keel/config.yml is format 1; this Keel writes format 2');
  await expect(card.getByRole('list', { name: 'What the upgrade changes' })).toContainText('Adds format: 2, so later versions of Keel know the shape of this file.');
  await expect(card.getByRole('button', { name: 'Upgrade in one Keel commit' })).toBeVisible();
});

Then('nothing is changed until I agree', async ({ page }) => {
  expect(readFileSync(join(BDD_PROJECT, '.keel', 'config.yml'), 'utf8')).toBe(configBefore);
  expect(git('rev-list', '--count', 'HEAD')).toBe(commitsBefore);
  await page.getByRole('button', { name: 'Upgrade in one Keel commit' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The config is upgraded' })).toBeVisible();
  expect(git('log', '-1', '--format=%an|%s')).toBe('Keel|Keel: Upgrade config from format 1 to 2');
  expect(readConfig(BDD_PROJECT)).toMatchObject({ format: 2 });
});

Given('a git repository with a package.json and a README', async () => {
  repository({ 'package.json': '{"name":"readme-helper","dependencies":{"express":"4.0.0"}}\n', 'README.md': '# Readme helper\n\nNewcomers cannot run a project.\n', 'src/index.js': 'console.log(1);\n' });
});

Given('no AI agent files', async () => {
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.cursorrules']) expect(() => readFileSync(join(BDD_PROJECT, f))).toThrow();
});

Then('the recommended path is {string}', async ({ page }, label: string) => {
  await expect(found(page)).toContainText('Existing project');
  const option = page.getByRole('radiogroup', { name: 'How to start' }).getByRole('radio', { name: label });
  await expect(option).toBeChecked();
  await expect(page.getByRole('radiogroup', { name: 'How to start' }).locator('label', { hasText: label })).toContainText('Recommended');
  await expect(page.getByRole('button', { name: 'Initialise and draft the baseline' })).toBeVisible();
});

Then('the files the assistant would read are listed with their sizes', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Files the assistant would read' });
  await expect(table.getByRole('row', { name: 'README.md' })).toContainText(/\d+ B/);
  await expect(table.getByRole('row', { name: 'package.json' })).toContainText(/\d+ B/);
  await expect(table.getByRole('checkbox', { name: 'Share README.md' })).toBeChecked();
});

Then('nothing has been sent to the model', async () => {
  expect(modelCalls()).toBe(0);
});

Given('a repository with an AGENTS.md that says {string}', async ({}, rule: string) => {
  repository({ 'package.json': '{"name":"x"}\n', 'AGENTS.md': `# Agents\n\n- ${rule}\n` });
});

When('I open Keel on it and accept the proposed rules', async ({ page }) => {
  await page.goto('/');
  const rules = page.getByRole('list', { name: 'Rules found in your agent files' });
  for (const box of await rules.getByRole('checkbox').all()) await box.check();
  await initialise(page, 'feature');
});

Then('.keel\\/standards\\/project-conventions\\/SKILL.md contains that rule', async () => {
  const skill = readFileSync(join(BDD_PROJECT, '.keel', 'standards', 'project-conventions', 'SKILL.md'), 'utf8');
  expect(skill).toContain('- Use pnpm, never npm or yarn');
  expect(readConfig(BDD_PROJECT)?.standards).toContain('project-conventions@1');
});

Given('a repository with my own AGENTS.md', async ({ page }) => {
  repository({ 'package.json': '{"name":"x"}\n', 'AGENTS.md': MY_AGENTS });
  await page.goto('/');
  await initialise(page, 'feature');
  // Through the stages with the same functions the pages use, to an approved plan.
  const store = bddStore();
  await createDocument(store, { kind: 'intent', title: 'Our project', template: 'standard-intent@3', body: '# Intent\n\n## Requirements\n\n- REQ-001 Show the run command\n' });
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  expect((await generateSpec(store, 'requirements-and-design-spec@2', async () => undefined)).ok).toBe(true);
  expect((await acceptAllSuggestions(store, raiseScenarioChange)).ok).toBe(true);
  expect((await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Yes.', consequences: '' })).ok).toBe(true);
  expect((await generatePlan(store, async () => undefined)).ok).toBe(true);
  expect((await review(store, 'plan', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  store.index.close();
});

When('I write the handoff', async ({ page }) => {
  await page.goto('/handoff');
  await expect(page.getByRole('table', { name: 'Handoff files' }).getByRole('row', { name: 'AGENTS.md', exact: true })).toContainText('Changed');
  await page.getByRole('button', { name: 'Write to folder' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Wrote' })).toBeVisible();
});

Then('my text in AGENTS.md is unchanged', async () => {
  expect(readFileSync(join(BDD_PROJECT, 'AGENTS.md'), 'utf8').startsWith(MY_AGENTS)).toBe(true);
});

Then("Keel's instructions are inside the keel:start and keel:end markers", async () => {
  const text = readFileSync(join(BDD_PROJECT, 'AGENTS.md'), 'utf8');
  const block = /<!-- keel:start -->\n([\s\S]*)\n<!-- keel:end -->/.exec(text)?.[1] ?? '';
  expect(block).toContain('## Read first');
  expect(text.slice(text.indexOf('<!-- keel:end -->') + '<!-- keel:end -->'.length).trim()).toBe('');
});

