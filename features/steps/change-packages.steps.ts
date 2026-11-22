// Change packages as complete as hand-written ones (REQ-015, REQ-003, REQ-014, task R19).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { planChange, settlePlannedScenario } from '../../src/lib/changes/plan';
import { createChange } from '../../src/lib/changes/store';
import type { Writer } from '../../src/lib/generate/writer';
import { fakeReply } from '../../src/lib/providers/fake';
import { createDocument } from '../../src/lib/store/documents';
import { commitFiles } from '../../src/lib/store/git';
import { updateConfig } from '../../src/lib/store/workspace';
import { BDD_PROJECT, bddStore, initialisedFolder } from './support';

const { Given, When, Then } = createBdd();

const fake: Writer = async (_t, messages) => fakeReply('anthropic', messages);
const read = (path: string) => readFileSync(join(BDD_PROJECT, path), 'utf8');

/** A project with code, an intent naming REQ-009, task R18 already done, and an approved request touching REQ-009. */
async function projectWithRequest(impact = true): Promise<void> {
  const store = await initialisedFolder('Keel');
  for (const path of ['src/lib/providers/registry.ts', 'src/lib/providers/ollama-models.ts', 'src/lib/settings/settings.ts', 'src/app/settings/page.tsx', 'README.md']) {
    mkdirSync(join(BDD_PROJECT, path, '..'), { recursive: true });
    writeFileSync(join(BDD_PROJECT, path), '// code\n');
  }
  mkdirSync(join(BDD_PROJECT, 'tasks'), { recursive: true });
  writeFileSync(join(BDD_PROJECT, 'tasks', 'R18.md'), '---\nid: R18\nstatus: done\n---\n\n# R18 · Earlier\n');
  await commitFiles(BDD_PROJECT, ['src', 'README.md', 'tasks'], 'Our code');
  await createDocument(store, { kind: 'intent', title: 'Keel', template: 'standard-intent@3', status: 'approved', body: '# Intent\n\n## Requirements\n\n- REQ-009 Any model provider, with Ollama on this computer as the default\n' });
  const made = await createChange(store, {
    title: 'Ollama is the default provider', reason: 'Work out of the box, privately and for free.', status: 'approved', size: 'significant',
    source: 'docs/intent.md', affects: ['INT-0001@1'], requirements: ['REQ-009'], ...(impact ? {} : { impact: [] }),
  });
  expect(made.ok).toBe(true);
}

// "I open Settings" is defined in providers.steps.ts.

Then('"Templates for new documents" offers Task, Change request, Prompt for the coding agent and Changes index', async ({ page }) => {
  const form = page.getByRole('form', { name: 'Templates for new documents' });
  // A select's accessible name includes its chosen option, so each is found by its label text and name.
  const select = (label: string, name: string) => form.locator('label', { hasText: label }).locator(`select[name="${name}"]`);
  await expect(select('Task', 'task')).toHaveValue('task@2');
  await expect(select('Change request', 'change')).toHaveValue('change-request@2');
  await expect(select('Prompt for the coding agent', 'change-prompt')).toHaveValue('prompt@1');
  await expect(select('Changes index', 'changes-index')).toHaveValue('changes-index@1');
});

Then('the chosen Change request template is used for the next change request', async ({ page }) => {
  const form = page.getByRole('form', { name: 'Templates for new documents' });
  await form.locator('select[name="change"]').selectOption('change-request@1');
  await form.getByRole('button', { name: 'Save templates' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await page.goto('/changes');
  const raise = page.getByRole('form', { name: 'New change request' });
  await raise.getByLabel('Title').fill('Export the log as CSV');
  await raise.getByLabel('Reason').fill('Finance asked for it.');
  await raise.getByRole('button', { name: 'Raise change request' }).click();
  await page.waitForURL(/\/changes\/CR-0001/);
  const text = read('changes/CR-0001/CR-0001.md');
  expect(text).toContain('template: change-request@1');
  expect(text).toContain('## Reason\n\nFinance asked for it.');
});

Given('the code map is "File and folder names only"', async () => {
  // The default (CR-0013); set explicitly once the folder exists, in the next step.
});

Given('an approved change request {string} touching REQ-009', async ({}, title: string) => {
  expect(title).toBe('Ollama is the default provider');
  await projectWithRequest();
  const store = bddStore();
  expect((await updateConfig(store, { code_map: 'names' }, 'Code map: names')).ok).toBe(true);
});

When('I plan the change', async ({ page }) => {
  await page.goto('/changes/CR-0001');
  await page.getByRole('form', { name: 'Plan the change' }).getByRole('button', { name: 'Plan the change' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Planned \d+ task/ })).toBeVisible();
});

Then('at least one new task is proposed with an ID after the highest R number', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Planned tasks' }).getByRole('listitem', { name: 'R19' })).toContainText('R19 · Ollama is the default provider');
});

Then('it lists files that are likely to change from the code map', async ({ page }) => {
  const files = page.getByRole('list', { name: 'Files for R19' });
  await expect(files).toContainText('src/lib/providers/registry.ts');
  await expect(files).toContainText('src/lib/providers/ollama-models.ts');
});

Then('at least one scenario for REQ-009 is suggested', async ({ page }) => {
  await expect(page.getByRole('article', { name: /^Suggested: / })).toContainText('@REQ-009');
});

Given('a planned change request with one accepted scenario', async () => {
  await projectWithRequest(false);
  const store = bddStore();
  const planned = await planChange(store, 'CR-0001', {}, fake);
  expect(planned.ok).toBe(true);
  expect((await settlePlannedScenario(store, 'CR-0001', 'S1', 'accepted')).ok).toBe(true);
});

When('I write the package', async ({ page }) => {
  await page.goto('/changes/CR-0001');
  await page.getByRole('button', { name: 'Write change package' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Wrote \d+ files to changes\/CR-0001\/\.$/ })).toBeVisible();
});

Then('changes\\/CR-NNNN contains CR-NNNN.md with "Why", "What changes" and "Done when"', async () => {
  const text = read('changes/CR-0001/CR-0001.md');
  for (const heading of ['## Why', '## What changes', '## Done when']) expect(text).toContain(heading);
});

Then('PROMPT.md tells the agent to commit each task as {string}', async ({}, pattern: string) => {
  const prompt = read('changes/CR-0001/PROMPT.md');
  expect(prompt).toContain(`commit each one as \`${pattern}\``);
  expect(prompt).toContain('Implement R19 in order');
});

Then('the task files have an "As built" section', async () => {
  const task = read('changes/CR-0001/tasks/R19.md');
  expect(task).toContain('change: CR-0001');
  expect(task).toContain('## As built');
  expect(task).toContain('- `src/lib/providers/registry.ts`');
  expect(read('changes/CR-0001/features/ollama-is-the-default-provider.feature')).toContain('@REQ-009');
});

Given('"Keep changes\\/README.md up to date" is on', async () => {
  const store = await initialisedFolder('Keel');
  await createChange(store, { title: 'Export the log as CSV', reason: 'Finance asked.', status: 'waiting', size: 'minor', requirements: ['REQ-002'] });
  await createChange(store, { title: 'Share with the accountant', reason: 'Asked too.', status: 'waiting', size: 'minor', requirements: ['REQ-003'], dependsOn: ['CR-0001'] });
});

When('I approve a change request', async ({ page }) => {
  await page.goto('/changes/CR-0001');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('CR-0001');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
});

Then('changes\\/README.md lists it in dependency order with its status', async () => {
  const index = read('changes/README.md');
  expect(index).toContain('| Order | Change request | What it does | Tasks | Status |');
  const order = index.split('\n').filter((l) => /^\| \d+ \| \[CR-/.test(l));
  expect(order.map((l) => /CR-\d{4}/.exec(l)?.[0])).toEqual(['CR-0002', 'CR-0001']);
  expect(order[1]).toContain('Applied');
  expect(order[0]).toContain('Waiting for approval');
});

Given('two open change requests that both name REQ-016 as new', async () => {
  const store = await initialisedFolder('Keel');
  await createChange(store, { title: 'Export to PDF', reason: 'Asked.', status: 'waiting', requirements: ['REQ-016 (new)'] });
  await createChange(store, { title: 'Export to Excel', reason: 'Asked.', status: 'waiting', requirements: ['REQ-016 (new)'] });
});

// "I open the Changes page" is defined in change-requests.steps.ts.

Then('both show a requirement ID warning', async ({ page }) => {
  for (const id of ['CR-0001', 'CR-0002']) {
    await expect(page.getByRole('table', { name: 'Change requests' }).getByRole('row', { name: id, exact: true })).toContainText('ID clash · REQ-016');
  }
});

Then('the later one is offered the next free ID', async ({ page }) => {
  const notice = page.getByRole('note', { name: 'Requirement ID clash' });
  await expect(notice).toContainText('REQ-016 is named as new by CR-0001 and CR-0002.');
  await notice.getByRole('button', { name: 'Use REQ-017 in CR-0002' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'REQ-016 is now REQ-017 in CR-0002.' })).toBeVisible();
  expect(read('changes/CR-0002/CR-0002.md')).toContain('REQ-017 (new)');
});
