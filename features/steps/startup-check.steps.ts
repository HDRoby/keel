// The startup check and setup mode (REQ-009, REQ-012, REQ-005, task R17).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { saveModelChoice, saveProvider } from '../../src/lib/settings/settings';
import { createDocument } from '../../src/lib/store/documents';
import { readConfig, writeConfig } from '../../src/lib/store/workspace';
import { BDD_PROJECT, BDD_USER, bddStore, initialisedFolder } from './support';
import { ollamaStub } from './providers.steps';

const { Given, When, Then } = createBdd();

/** What `npx keel` printed for the startup check: the same check, run as the CLI does. */
let terminal: string[] = [];
let configBefore = '';

/**
 * Runs the startup check as the CLI does, with the scenario's folders and the fake provider. Asynchronously, so a
 * stub server in this process can still answer it.
 */
async function cliCheck(): Promise<string[]> {
  const run = promisify(execFile);
  try {
    const { stdout } = await run(process.execPath, [join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/cli.ts', 'check', '--dir', BDD_PROJECT], {
      encoding: 'utf8', env: { ...process.env, KEEL_USER_DIR: BDD_USER, KEEL_PROVIDER: 'fake', KEEL_FAKE_LOG: '' },
    });
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Exit code 2: setup mode. The lines are on stdout either way.
    return String((error as { stdout?: string }).stdout ?? '').trim().split('\n').filter(Boolean);
  }
}

const setupLinks = (page: Page) => page.getByRole('navigation', { name: 'Setup' }).getByRole('link');

Given('there is no ~\\/.config\\/keel\\/settings.json', async () => {
  rmSync(join(BDD_USER, 'settings.json'), { force: true });
});

When('I start Keel', async ({ page }) => {
  terminal = await cliCheck();
  await page.goto('/');
});

Then('I see "Set up Keel first"', async ({ page }) => {
  await page.waitForURL(/\/check$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up Keel first');
  await expect(page.getByRole('listitem', { name: 'Your settings' })).toContainText('This looks like the first time Keel runs on this computer.');
  await expect(page.getByRole('link', { name: 'Choose a model provider' })).toHaveAttribute('href', '/settings');
});

Then('only Startup check and Settings are available', async ({ page }) => {
  await expect(setupLinks(page)).toHaveText(['Startup check', 'Settings']);
  await expect(page.getByRole('navigation', { name: 'Library' })).toHaveCount(0);
  await page.goto('/templates');
  await page.waitForURL(/\/check$/);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
});

Given('my provider is Ollama', async () => {
  // With nothing saved, every task uses Ollama (CR-0011).
});

Then('the terminal says {string}', async ({}, line: string) => {
  expect(terminal).toContain(line);
  expect(terminal[0]).toContain('Model provider: Keel could not reach Ollama');
});

Then('the Startup check says Keel could not reach Ollama', async ({ page }) => {
  await page.waitForURL(/\/check$/);
  await expect(page.getByRole('listitem', { name: 'Model provider' })).toContainText('Keel could not reach Ollama at http://127.0.0.1:');
  await expect(page.getByRole('listitem', { name: 'Model provider' })).toContainText('Fix: start Ollama (open the app, or run ollama serve)');
  await expect(page.getByRole('listitem', { name: 'Models for each task' })).toContainText('Waiting');
});

Then('opening the Spec page takes me back to the Startup check', async ({ page }) => {
  await page.goto('/spec');
  await page.waitForURL(/\/check$/);
});

Given('{string} is set to a model that is not installed', async ({}, task: string) => {
  const base = await ollamaStub([{ name: 'qwen3:14b', size: 9_000_000_000, parameters: '14.8B', context: 40960 }]);
  saveProvider(bddStore(), 'ollama', { baseUrl: base });
  expect(task).toBe('Spec and plan');
  saveModelChoice(bddStore(), 'documents', { provider: 'ollama', model: 'qwen3:32b' });
});

Then('the Startup check names {string} and the missing model', async ({ page }, task: string) => {
  await page.waitForURL(/\/check$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A model is missing');
  await expect(page.getByRole('listitem', { name: 'Models for each task' })).toContainText(`"${task}" is set to qwen3:32b, which is not installed in Ollama.`);
  await expect(page.getByRole('listitem', { name: 'Models for each task' })).toContainText('ollama pull qwen3:32b');
});

Given('.keel\\/config.yml names a template version that is not in .keel\\/templates', async () => {
  await initialisedFolder('Broken config');
  const config = readConfig(BDD_PROJECT) ?? {};
  writeConfig(BDD_PROJECT, { ...config, templates: { ...(config.templates as Record<string, string>), spec: 'requirements-and-design-spec@9' } });
  configBefore = readFileSync(join(BDD_PROJECT, '.keel', 'config.yml'), 'utf8');
});

Then('the Startup check shows the line that is wrong', async ({ page }) => {
  await page.waitForURL(/\/check$/);
  const lines = configBefore.split('\n');
  const number = lines.findIndex((l) => l.includes('requirements-and-design-spec@9')) + 1;
  const item = page.getByRole('listitem', { name: 'Project config' });
  await expect(item).toContainText(`.keel/config.yml line ${number}: "templates.spec" names requirements-and-design-spec@9, which is not in .keel/templates.`);
  await expect(item).toContainText(`line ${number}: spec: requirements-and-design-spec@9`);
});

Then('Project setup and Settings are the only pages available', async ({ page }) => {
  await expect(setupLinks(page)).toHaveText(['Startup check', 'Settings', 'Project setup']);
  await page.goto('/explore');
  await page.waitForURL(/\/check$/);
});

Then('.keel\\/config.yml is unchanged', async () => {
  expect(readFileSync(join(BDD_PROJECT, '.keel', 'config.yml'), 'utf8')).toBe(configBefore);
});

Given('valid settings, a running provider and a valid project config', async () => {
  // Settings: written by the Before hook; provider: the fake one (a running Ollama); project: an approved intent.
  const store = await initialisedFolder('Readme helper');
  await createDocument(store, { kind: 'intent', title: 'Readme helper', template: 'standard-intent@3', status: 'approved', body: '# Intent\n\n## Requirements\n\n- REQ-001 Show the run command\n' });
});

Then('the terminal prints one {string} line', async ({}, start: string) => {
  expect(terminal).toHaveLength(1);
  expect(terminal[0]).toMatch(new RegExp(`^${start}: settings OK · Ollama running, 2 models · test message answered$`));
});

Then('I see the current stage of the project', async ({ page }) => {
  await page.waitForURL(/\/spec$/);
  await expect(page.getByRole('form', { name: 'Generate spec' })).toBeVisible();
});
