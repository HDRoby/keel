// Change requests across stages, and the Changes page (REQ-014, REQ-005, task R18).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import matter from 'gray-matter';
import { createChange } from '../../src/lib/changes/store';
import { createDocument } from '../../src/lib/store/documents';
import { commitFiles } from '../../src/lib/store/git';
import { BDD_PROJECT, bddStore, field, initialisedFolder, projectWithApprovedPlan, reviewed, stagePath } from './support';

const { Given, When, Then } = createBdd();

// This repository's own change requests are the fixture (task R18): copied, then given the state each step says.
function copyRequest(id: string, header: (text: string) => string): void {
  const to = join(BDD_PROJECT, 'changes', id);
  cpSync(join(process.cwd(), 'changes', id), to, { recursive: true });
  const file = join(to, `${id}.md`);
  writeFileSync(file, header(readFileSync(file, 'utf8')));
}

const dependsOn = (deps: string) => (text: string) => (/^depends_on:.*$/m.test(text) ? text.replace(/^depends_on:.*$/m, deps ? `depends_on: ${deps}` : '') : text.replace(/^status:/m, deps ? `depends_on: ${deps}\nstatus:` : 'status:'));

async function folderReady(): Promise<void> {
  if (!existsSync(join(BDD_PROJECT, '.keel', 'config.yml'))) (await initialisedFolder('Keel')).index.close();
}

Given('changes\\/CR-0004 is approved and 3 of its 9 tasks are done', async () => {
  await folderReady();
  copyRequest('CR-0004', (t) => t);
  mkdirSync(join(BDD_PROJECT, 'tasks'), { recursive: true });
  for (const task of ['R1', 'R2', 'R3']) {
    const text = readFileSync(join(BDD_PROJECT, 'changes', 'CR-0004', 'tasks', `${task}.md`), 'utf8');
    writeFileSync(join(BDD_PROJECT, 'tasks', `${task}.md`), text.replace(/^status: todo$/m, 'status: done'));
  }
});

Given('changes\\/CR-0005 is approved and depends on CR-0003', async () => {
  await folderReady();
  copyRequest('CR-0005', dependsOn('CR-0003'));
});

Given('changes\\/CR-0003 is approved with no tasks done', async () => {
  await folderReady();
  copyRequest('CR-0003', dependsOn(''));
});

When('I open the Changes page', async ({ page }) => {
  await page.goto('/changes?filter=all');
});

const row = (page: import('@playwright/test').Page, id: string) => page.getByRole('table', { name: 'Change requests' }).getByRole('row', { name: id, exact: true });

Then('CR-0004 is {string} with {string}', async ({ page }, status: string, progress: string) => {
  await expect(row(page, 'CR-0004')).toContainText(status);
  await expect(row(page, 'CR-0004')).toContainText(progress);
  await expect(row(page, 'CR-0004')).toContainText('Written by hand');
});

Then('CR-0005 is {string}', async ({ page }, status: string) => {
  await expect(row(page, 'CR-0005').locator('.pill')).toHaveText(status);
});

Then('{string} is CR-0004', async ({ page }, region: string) => {
  await expect(page.getByRole('region', { name: region })).toContainText('CR-0004 · One project per folder, with a .keel folder');
  await expect(page.getByRole('region', { name: region }).getByRole('button', { name: 'Copy prompt for the agent' })).toBeEnabled();
});

When('I change Desired outcome in Explore and save as a change request', async ({ page }) => {
  await page.goto(stagePath('explore'));
  await reviewed(page);
  await field(page, 'Desired outcome').fill('Every expense is recorded the same day.');
  await page.getByRole('button', { name: 'Save as change request' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved as change request CR-0001' })).toBeVisible();
});

Then('a new folder changes\\/CR-NNNN exists with its header', async () => {
  const file = join(BDD_PROJECT, 'changes', 'CR-0001', 'CR-0001.md');
  expect(existsSync(file)).toBe(true);
  expect(matter(readFileSync(file, 'utf8')).data).toMatchObject({ id: 'CR-0001', status: 'waiting', size: 'minor', origin: 'keel', source: 'docs/intent.md', affects: ['INT-0001@1'] });
});

Then('the change request shows the change to Desired outcome', async ({ page }) => {
  await page.goto('/changes/CR-0001');
  const what = page.getByRole('region', { name: '1 · What changed' });
  await expect(what).toContainText('Desired outcome');
  await expect(what).toContainText('Every expense is recorded within a day.');
  await expect(what).toContainText('Every expense is recorded the same day.');
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
});

const intentBody = '# Intent: Expense tracker\n\n## Requirements\n\n- REQ-001 Record an expense\n- REQ-003 Export to CSV\n';

Given('an approved spec and plan', async () => {
  const store = await initialisedFolder('Expense tracker');
  await createDocument(store, { kind: 'intent', title: 'Expense tracker', body: intentBody, template: 'standard-intent@4', status: 'approved' });
  await createDocument(store, { kind: 'spec', title: 'Expense tracker', body: '# Spec\n\n## Requirements\n\n| ID | Requirement |\n| --- | --- |\n| REQ-001 | Record an expense |\n| REQ-003 | Export to CSV |\n', template: 'requirements-and-design-spec@2', status: 'approved' });
  await createDocument(store, { kind: 'plan', title: 'Expense tracker', body: '# Plan\n\n| Task | Title | Requirements |\n| --- | --- | --- |\n| T1 | Expenses | REQ-001 |\n| T2 | CSV export | REQ-003 |\n', template: 'implementation-plan@2', status: 'approved' });
  await createDocument(store, { kind: 'task', title: 'Expenses', body: '# T1 · Expenses\n', template: 'task@1', extra: { requirements: ['REQ-001'] } });
  await createDocument(store, { kind: 'task', title: 'CSV export', body: '# T2 · CSV export\n\n## Scenarios that prove it\n\n- `features/export.feature`\n', template: 'task@1', extra: { requirements: ['REQ-003'] } });
  mkdirSync(join(BDD_PROJECT, 'features'), { recursive: true });
  writeFileSync(join(BDD_PROJECT, 'features', 'export.feature'), 'Feature: Export\n\n  @REQ-003\n  Scenario: Expenses export to CSV\n    Given some expenses\n');
  await commitFiles(BDD_PROJECT, ['features/export.feature'], 'Add acceptance scenarios');
  store.index.close();
});

Given('a change request that changes REQ-003', async () => {
  const store = bddStore();
  const made = await createChange(store, {
    title: 'Export to CSV and PDF', reason: 'Finance needs PDF.', status: 'approved', size: 'significant', source: 'docs/intent.md',
    affects: ['INT-0001@1'], requirements: ['REQ-003'], impact: [{ document: 'docs/spec.md', decision: 'pending' }, { document: 'docs/plan.md', decision: 'pending' }],
  });
  store.index.close();
  expect(made.ok).toBe(true);
});

When('I open the change request', async ({ page }) => {
  await page.goto('/changes/CR-0001');
});

Then('task T2 and its scenario are listed as affected by REQ-003', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Affected in plan.md' })).toContainText('Task T2 · CSV export (REQ-003)');
  await expect(page.getByRole('list', { name: 'Affected in spec.md' })).toContainText('Scenario features/export.feature › Expenses export to CSV (REQ-003)');
  await expect(page.getByRole('list', { name: 'Affected in plan.md' })).not.toContainText('T1');
});

Then('each affected document offers Update, Still valid and Later', async ({ page }) => {
  for (const doc of ['spec.md', 'plan.md']) {
    const group = page.getByRole('group', { name: doc });
    await expect(group).toContainText('Out of date');
    for (const action of ['Update', 'Still valid', 'Later']) await expect(group.getByRole('button', { name: action, exact: true })).toBeVisible();
  }
});

Given('a significant change request to the intent is approved but not applied', async () => {
  await projectWithApprovedPlan(async (store) => {
    const made = await createChange(store, {
      title: 'Add PDF export', reason: 'Finance needs PDF.', status: 'approved', size: 'significant', source: 'docs/intent.md',
      affects: ['INT-0001@1'], requirements: ['REQ-002'], impact: [{ document: 'docs/spec.md', decision: 'pending' }, { document: 'docs/plan.md', decision: 'pending' }],
    });
    expect(made.ok).toBe(true);
  });
});

When('I open the Plan stage', async ({ page }) => {
  await page.goto(stagePath('plan'));
});

Then('the stage bar says {string} with the change request ID', async ({ page }, text: string) => {
  const plan = page.getByRole('navigation', { name: 'Stages' }).getByRole('link', { name: /^\d · Plan\b/ });
  await expect(plan).toContainText(`${text} · CR-0001`);
  await expect(page.getByRole('note').filter({ hasText: 'Out of date · CR-0001' }).getByRole('link', { name: 'CR-0001' })).toHaveAttribute('href', '/changes/CR-0001');
});
