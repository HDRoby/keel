// Read-back from the local repository (REQ-007, ADR-0012). The coding agent works in the same folder.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { parseDocument, saveDocument } from '../../src/lib/store/documents';
import { bddStore, BDD_PROJECT, git, stagePath } from './support';

const { When, Then } = createBdd();

const AGENT = ['-c', 'user.name=Coding Agent', '-c', 'user.email=agent@example.com'];
const AGENT_MESSAGE = 'Split T1 so the run command gets its own task';
const RISK = '- The run command differs per operating system.';

function editFile(path: string, change: (text: string) => string): void {
  const file = join(BDD_PROJECT, path);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
}

When('the coding agent commits a change to docs\\/plan.md', async () => {
  editFile('docs/plan.md', (t) => t.replace('## Risks', `## Risks\n\n${RISK}\n`));
  git(...AGENT, 'commit', '-qm', AGENT_MESSAGE, '--', 'docs/plan.md');
});

When('the coding agent edits tasks\\/T2.md without committing', async () => {
  editFile('tasks/T2.md', (t) => `${t}\nCheck the exit code too.\n`);
});

When('Keel commits a new spec version', async () => {
  const store = bddStore();
  const saved = await saveDocument(store, 'docs/spec.md', { reason: 'Clarify the approach', body: '# Spec: Handoff demo\n\nClearer approach.\n' });
  expect(saved.ok).toBe(true);
});

When('Keel checks the folder', async ({ page }) => {
  await page.goto(stagePath('handoff'));
  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByText(/^Checked \d{4}-\d{2}-\d{2}/)).toBeVisible();
});

const changeItem = (page: Page, path: string) =>
  page.getByRole('list', { name: 'Pending changes' }).getByRole('listitem', { name: path });

Then('the change is shown as pending', async ({ page }) => {
  const change = changeItem(page, 'docs/plan.md');
  await expect(change).toContainText('Pending');
  await expect(change).toContainText(AGENT_MESSAGE);
  await expect(change.getByRole('list', { name: 'Changes to docs/plan.md' })).toContainText(`+ ${RISK}`);
});

Then('accepting it creates a new plan version in draft', async ({ page }) => {
  await page.getByRole('button', { name: 'Accept as plan v2' }).click();
  await expect(page.getByText('No changes from the coding agent.')).toBeVisible();
  const plan = parseDocument(readFileSync(join(BDD_PROJECT, 'docs', 'plan.md'), 'utf8'));
  if (!plan.ok) throw new Error(plan.message);
  expect(plan.value.header).toMatchObject({ version: 2, status: 'draft' });
  expect(plan.value.body).toContain(RISK);
  expect(git('log', '-1', '--format=%an')).toBe('Keel');
});

Then('the change is shown as pending and marked Uncommitted', async ({ page }) => {
  const change = changeItem(page, 'tasks/T2.md');
  await expect(change).toContainText('Pending');
  await expect(change).toContainText('Uncommitted');
  await expect(change.getByRole('list', { name: 'Changes to tasks/T2.md' })).toContainText('+ Check the exit code too.');
});

Then('there are no changes to review', async ({ page }) => {
  await expect(page.getByText('No changes from the coding agent.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pending changes' })).toHaveCount(0);
});
