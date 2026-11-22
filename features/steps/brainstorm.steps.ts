// Explore: the template's sections with a comment from the assistant on each (REQ-001, REQ-002, task R10).
// The dev server runs with the fake provider, which writes scripted reviews and logs each model call.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { review } from '../../src/lib/gates/approvals';
import { draftIntent } from '../../src/lib/generate/intent';
import { BDD_PROJECT, exploreWith, field, modelCalls, reviewed, section, stagePath } from './support';

const { Given, When, Then } = createBdd();

const PROBLEM = 'Receipts get lost.';
const WHO = 'Small teams that share a budget.';
const OUTCOME = 'Every expense is recorded within a day.';
const FILLED = { Problem: 'Receipts get lost, and expenses are recorded weeks after the money was spent.', 'Who it is for': WHO, 'Desired outcome': OUTCOME, Requirements: ['Record an expense', 'See expenses by month'] };
const TEXT_SECTIONS = ['Problem', 'Who it is for', 'Desired outcome', 'Scope', 'Constraints', 'Open questions'];

// What a scenario remembers between its steps.
let calls = 0;
let problemComment = '';
let approvedIntent = '';

const comment = (page: import('@playwright/test').Page, key: string) => section(page, key).getByRole('note', { name: `Comment on ${key}` });
const draftButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Draft intent\.md/ });
const intentText = () => readFileSync(join(BDD_PROJECT, 'docs', 'intent.md'), 'utf8');

async function openExplore(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(stagePath('explore'));
  await reviewed(page);
}

Given('an initialised folder using the {string} template', async ({}, name: string) => {
  expect(name).toBe('Standard intent v4');
  await exploreWith({}, 'standard-intent@4');
});

Given('I have filled in Problem and Who it is for', async () => {
  const { fillSections } = await import('../../src/lib/brainstorm/fill');
  const filled = fillSections({ root: BDD_PROJECT }, { Problem: PROBLEM, 'Who it is for': WHO });
  expect(filled.ok).toBe(true);
});

When('I open Explore', async ({ page }) => {
  await openExplore(page);
});

Then('I see a field for each section of the template', async ({ page }) => {
  for (const key of TEXT_SECTIONS) await expect(field(page, key)).toBeVisible();
  await expect(section(page, 'Requirements').getByRole('button', { name: '+ Add requirement' })).toBeVisible();
  await expect(field(page, 'Problem')).toHaveValue(PROBLEM);
  await expect(page.getByText('2 of 4 required filled')).toBeVisible();
});

Then('each section has a comment from the assistant above it', async ({ page }) => {
  for (const key of [...TEXT_SECTIONS, 'Requirements']) await expect(comment(page, key)).toBeVisible();
  await expect(comment(page, 'Who it is for')).toContainText('Looks good');
});

Given('I am editing Who it is for', async ({ page }) => {
  await exploreWith({ Problem: 'Receipts get lost, and expenses are recorded weeks after the money was spent.', 'Who it is for': WHO });
  await openExplore(page);
  problemComment = (await comment(page, 'Problem').textContent()) ?? '';
  calls = modelCalls();
  await field(page, 'Who it is for').click();
});

When('I change its text and move to Desired outcome', async ({ page }) => {
  await field(page, 'Who it is for').fill(`${WHO} Later, product managers in larger companies too.`);
  await field(page, 'Desired outcome').click();
});

Then('the assistant reviews all sections once', async ({ page }) => {
  await expect.poll(modelCalls, { timeout: 10_000 }).toBe(calls + 1);
  await reviewed(page);
  await page.waitForTimeout(2_000);
  expect(modelCalls()).toBe(calls + 1);
});

Then('the comments on other sections are refreshed', async ({ page }) => {
  await expect(comment(page, 'Problem')).not.toHaveText(problemComment);
  await expect(comment(page, 'Problem')).toContainText('words so far');
});

Given('the assistant has reviewed all sections', async ({ page }) => {
  await exploreWith({ Problem: 'Receipts get lost, and expenses are recorded weeks after the money was spent.', 'Who it is for': WHO });
  await openExplore(page);
  calls = modelCalls();
});

When('I move between sections without changing anything', async ({ page }) => {
  for (const key of ['Problem', 'Who it is for', 'Desired outcome', 'Scope', 'Problem']) await field(page, key).click();
  await page.getByRole('heading', { name: 'Your idea, section by section' }).click();
  await page.waitForTimeout(2_500);
});

Then('no review is made', async () => {
  expect(modelCalls()).toBe(calls);
});

Given('Who it is for mentions product managers', async () => {
  await exploreWith({ 'Who it is for': 'Engineers first, later product managers.' });
});

Given('Constraints does not mention a web UI', async () => {
  const { fillSections } = await import('../../src/lib/brainstorm/fill');
  expect(fillSections({ root: BDD_PROJECT }, { Constraints: 'Single user first.' }).ok).toBe(true);
});

When('the assistant reviews the sections', async ({ page }) => {
  await openExplore(page);
});

Then('Constraints has a comment that links it to Who it is for', async ({ page }) => {
  await expect(comment(page, 'Constraints')).toContainText('Links sections');
  await expect(comment(page, 'Constraints')).toContainText('Who it is for');
});

Then('the comment offers a rewrite I can apply', async ({ page }) => {
  await comment(page, 'Constraints').getByRole('button', { name: 'Show' }).click();
  await section(page, 'Constraints').getByRole('button', { name: 'Apply' }).click();
  await expect(field(page, 'Constraints')).toHaveValue(/^Single user first\. A web UI/);
});

Given('I wrote Problem myself', async () => {
  await exploreWith({ Problem: PROBLEM });
});

Then('Problem still has my text', async ({ page }) => {
  await expect(field(page, 'Problem')).toHaveValue(PROBLEM);
  await expect(comment(page, 'Problem')).toContainText('Challenge');
});

Then('any rewrite is only offered in the comment', async ({ page }) => {
  await comment(page, 'Problem').getByRole('button', { name: 'Show' }).click();
  await expect(comment(page, 'Problem').getByRole('blockquote')).toHaveText(`${PROBLEM} It happens every week and costs the team hours.`);
  await expect(comment(page, 'Problem').getByRole('button', { name: 'Apply' })).toBeVisible();
  await expect(field(page, 'Problem')).toHaveValue(PROBLEM);
});

Given('Desired outcome is empty', async () => {
  await exploreWith({ Problem: 'Receipts get lost, and expenses are recorded weeks after the money was spent.', 'Who it is for': WHO, Requirements: ['Record an expense'] });
});

When('the assistant fills it with a suggestion', async ({ page }) => {
  await openExplore(page);
  await expect(field(page, 'Desired outcome')).toHaveValue('Every expense is recorded within a day of spending it.');
});

Then('Draft intent.md is still disabled', async ({ page }) => {
  await expect(section(page, 'Desired outcome').getByText('Suggested by the assistant. It counts once you accept it.')).toBeVisible();
  await expect(draftButton(page)).toBeDisabled();
});

Then('accepting the suggestion enables Draft intent.md', async ({ page }) => {
  await section(page, 'Desired outcome').getByRole('button', { name: 'Accept' }).click();
  await expect(draftButton(page)).toBeEnabled();
});

Given('I have accepted three requirement rows in Explore', async ({ page }) => {
  await exploreWith({ Problem: 'Receipts get lost, and expenses are recorded weeks after the money was spent.', 'Who it is for': WHO, 'Desired outcome': OUTCOME });
  await openExplore(page);
  const rows = section(page, 'Requirements');
  await expect(rows.getByText('suggested', { exact: true })).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    await rows.getByRole('button', { name: 'Accept' }).first().click();
    await expect(rows.getByText('suggested', { exact: true })).toHaveCount(2 - i);
  }
  await expect(rows.getByText('new', { exact: true })).toHaveCount(3);
});

When('I draft the intent', async ({ page }) => {
  if (!(await page.getByRole('status', { name: 'Review status' }).isVisible())) await openExplore(page);
  calls = modelCalls();
  await draftButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'intent.md drafted' })).toContainText('INT-0001 v1, status draft');
});

Then('intent.md lists them as REQ-001, REQ-002 and REQ-003', async () => {
  expect(intentText()).toContain('## Requirements\n\n- REQ-001 Record an expense in under a minute\n- REQ-002 See the team\'s expenses by month\n- REQ-003 Export the expenses to CSV\n');
});

Then('Explore shows those IDs next to the rows', async ({ page }) => {
  const rows = section(page, 'Requirements');
  for (const id of ['REQ-001', 'REQ-002', 'REQ-003']) await expect(rows.getByText(id, { exact: true })).toBeVisible();
});

Then('a row I add later shows {string} until the next draft', async ({ page }, label: string) => {
  const rows = section(page, 'Requirements');
  await rows.getByRole('button', { name: '+ Add requirement' }).click();
  await rows.getByRole('textbox').last().fill('Share with the accountant');
  await expect(rows.getByRole('listitem', { name: 'Row 4' }).getByText(label, { exact: true })).toBeVisible();
});

Given('every required section is filled', async ({ page }) => {
  await exploreWith(FILLED);
  await openExplore(page);
});

Then('intent.md contains each section exactly as I wrote it', async () => {
  const text = intentText();
  for (const [key, value] of Object.entries(FILLED)) {
    const body = Array.isArray(value) ? value.map((v, i) => `- REQ-00${i + 1} ${v}`).join('\n') : value;
    expect(text, key).toContain(`## ${key}\n\n${body}\n`);
  }
  expect(text).toContain('## Scope\n\n_Not written yet._\n');
});

Then('no model call is made', async ({ page }) => {
  await reviewed(page);
  await page.waitForTimeout(1_500);
  expect(modelCalls()).toBe(calls);
});

Given('the intent is approved', async () => {
  const store = await exploreWith(FILLED);
  expect((await draftIntent(store)).ok).toBe(true);
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: 'Clear.' })).ok).toBe(true);
  store.index.close();
  approvedIntent = intentText();
});

When('I change Desired outcome in Explore and save', async ({ page }) => {
  await openExplore(page);
  await expect(page.getByRole('region', { name: 'Intent approved' })).toContainText('Intent v1 is approved');
  await field(page, 'Desired outcome').fill('Every expense is recorded the same day.');
  await page.getByRole('button', { name: 'Save as change request' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved as change request CR-0001' })).toBeVisible();
});

Then('a change request is created with the change to Desired outcome', async () => {
  // A change request is a folder in changes/ since CR-0003, waiting for approval.
  const file = join(BDD_PROJECT, 'changes', 'CR-0001', 'CR-0001.md');
  expect(existsSync(file)).toBe(true);
  const text = readFileSync(file, 'utf8');
  expect(text).toContain('status: waiting');
  expect(text).toContain(`### Desired outcome\n\nBefore:\n\n> ${OUTCOME}\n\nAfter:\n\n> Every expense is recorded the same day.`);
});

Then('the approved intent is unchanged', async () => {
  expect(intentText()).toBe(approvedIntent);
  expect(intentText()).toContain('status: approved');
});
