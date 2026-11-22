// Acceptance scenarios edited in the Spec, at least one per requirement (REQ-004, REQ-005, task R11).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { recordDecision } from '../../src/lib/gates/approvals';
import { createDocument } from '../../src/lib/store/documents';
import { commitFiles } from '../../src/lib/store/git';
import { BDD_PROJECT, bddStore, initialisedFolder, stagePath } from './support';

const { Given, When, Then } = createBdd();

const STATEMENTS: Record<string, string> = {
  'REQ-001': 'Record an expense', 'REQ-002': 'Export to CSV', 'REQ-003': 'Share with the accountant',
  'REQ-004': 'See expenses by month', 'REQ-005': 'Reject an expense without a receipt',
};

// What the scenario sets up: which requirements exist, and which have one scenario.
const world = { requirements: [] as string[], covered: new Set<string>(), go: false };

/** An approved intent and a draft spec with the requirements, and one scenario for each covered one. */
async function specWith(requirements: string[], covered: string[], status: 'draft' | 'approved' = 'draft'): Promise<void> {
  const store = await initialisedFolder('Expense tracker');
  const list = requirements.map((id) => `- ${id} ${STATEMENTS[id]}`).join('\n');
  await createDocument(store, { kind: 'intent', title: 'Expense tracker', template: 'standard-intent@4', status: 'approved', body: `# Intent\n\n## Requirements\n\n${list}\n` });
  const rows = requirements.map((id) => `| ${id} | ${STATEMENTS[id]} | Intent |`).join('\n');
  await createDocument(store, { kind: 'spec', title: 'Expense tracker', template: 'requirements-and-design-spec@2', status, body: `# Spec\n\n## Requirements\n\n| ID | Requirement | Source |\n| --- | --- | --- |\n${rows}\n` });
  mkdirSync(join(BDD_PROJECT, 'features'), { recursive: true });
  const scenarios = covered.map((id) => `  @${id}\n  Scenario: ${STATEMENTS[id]} works\n    Given an expense\n    When I ${STATEMENTS[id]?.toLowerCase()}\n    Then it is done\n`).join('\n');
  writeFileSync(join(BDD_PROJECT, 'features', 'expenses.feature'), `Feature: Expenses\n\n${scenarios}`);
  await commitFiles(BDD_PROJECT, ['features/expenses.feature'], 'Scenarios');
}

const group = (page: Page, id: string) => page.getByRole('region', { name: id, exact: true });

async function openScenarios(page: Page): Promise<void> {
  await page.goto(`${stagePath('spec')}?tab=scenarios`);
  await expect(page.getByRole('heading', { name: 'Acceptance scenarios' })).toBeVisible();
}

Given('a spec with requirements REQ-001 to REQ-003', async () => {
  world.go = false;
  world.requirements = ['REQ-001', 'REQ-002', 'REQ-003'];
  world.covered = new Set(world.requirements);
});

Given('REQ-002 has no scenario', async () => {
  if (world.requirements.length === 0) world.requirements = ['REQ-001', 'REQ-002', 'REQ-003'];
  world.covered = new Set(world.requirements.filter((id) => id !== 'REQ-002'));
  await specWith(world.requirements, [...world.covered], world.go ? 'approved' : 'draft');
  if (world.go) {
    const store = bddStore();
    await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth it.', consequences: '' });
  }
});

When('I open the Acceptance scenarios tab', async ({ page }) => {
  await openScenarios(page);
});

Then('each requirement is listed with its scenarios', async ({ page }) => {
  for (const id of ['REQ-001', 'REQ-003']) {
    await expect(group(page, id)).toContainText(STATEMENTS[id] ?? '');
    await expect(group(page, id).getByRole('article', { name: `${STATEMENTS[id]} works` })).toBeVisible();
  }
  await expect(page.getByRole('status', { name: 'Scenario coverage' })).toContainText('2 of 3 requirements have a scenario');
});

Then('REQ-002 is marked {string}', async ({ page }, text: string) => {
  await expect(group(page, 'REQ-002')).toContainText(text);
});

Given('REQ-001 has one scenario', async () => {
  await specWith(['REQ-001', 'REQ-002'], ['REQ-001', 'REQ-002']);
});

When('I add a scenario to REQ-001 with a Given, a When and a Then', async ({ page }) => {
  await openScenarios(page);
  await group(page, 'REQ-001').getByRole('link', { name: '+ Add scenario' }).click();
  const editor = page.getByRole('form', { name: 'Edit scenario for REQ-001' });
  await editor.getByLabel('Scenario').fill('An expense without an amount is refused');
  await editor.getByLabel('Step 1 text').fill('an expense with no amount');
  await editor.getByLabel('Step 2 text').fill('I record it');
  await editor.getByLabel('Step 3 text').fill('I am asked for the amount');
  await editor.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('form', { name: 'Edit scenario for REQ-001' })).toHaveCount(0);
});

Then('REQ-001 has two scenarios', async ({ page }) => {
  await expect(group(page, 'REQ-001')).toContainText('2 scenarios');
  await expect(group(page, 'REQ-001').getByRole('article')).toHaveCount(2);
});

Then('the Gherkin view tags both with @REQ-001', async ({ page }) => {
  await page.getByRole('link', { name: 'Gherkin' }).click();
  const text = (await page.getByLabel('Gherkin of features/expenses.feature').textContent()) ?? '';
  expect(text).toContain('@REQ-001\n  Scenario: Record an expense works');
  expect(text).toContain('@REQ-001\n  Scenario: An expense without an amount is refused\n    Given an expense with no amount\n    When I record it\n    Then I am asked for the amount');
});

Given('REQ-005 has one scenario', async () => {
  await specWith(['REQ-001', 'REQ-005'], ['REQ-001', 'REQ-005']);
});

When('I ask for a failure case for REQ-005', async ({ page }) => {
  await openScenarios(page);
  await group(page, 'REQ-005').getByRole('button', { name: 'Suggest a failure case' }).click();
});

Then('a suggested scenario appears under REQ-005', async ({ page }) => {
  await expect(group(page, 'REQ-005').getByRole('article', { name: /^Suggested: / })).toContainText('Suggested failure case');
  await expect(group(page, 'REQ-005').getByRole('button', { name: 'Accept' })).toBeVisible();
});

Then('REQ-005 still counts one scenario until I accept it', async ({ page }) => {
  await expect(group(page, 'REQ-005').locator('[data-count]')).toHaveText('1 scenario');
  await group(page, 'REQ-005').getByRole('button', { name: 'Accept' }).click();
  await expect(group(page, 'REQ-005').locator('[data-count]')).toHaveText('2 scenarios');
});

Given('the decision is Go', async () => {
  world.go = true;
  world.requirements = ['REQ-001', 'REQ-002', 'REQ-003'];
});

Then('the message names REQ-002', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Plan stage' })).toContainText('Needs at least one accepted scenario for REQ-002');
});
