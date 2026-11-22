// Discuss a change (REQ-017, CR-0016). The fake provider proposes on its first reply, answers "yes" with plain text,
// records each discussion request (KEEL_FAKE_LOG.discuss) and reads KEEL_FAKE_LOG.control.json for the odd cases.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { readChange } from '../../src/lib/changes/store';
import { review } from '../../src/lib/gates/approvals';
import { createDocument } from '../../src/lib/store/documents';
import { BDD_PROJECT, FAKE_LOG, git, initialisedFolder } from './support';

const { Given, When, Then } = createBdd();
const REQUESTS = `${FAKE_LOG}.discuss`;
const KEY = 'sk-test-fixture-0000000000000000';

const control = (discussion: 'no-proposal' | 'invalid' | 'unknown-req') => writeFileSync(`${FAKE_LOG}.control.json`, JSON.stringify({ discussion }));
const card = (page: Page) => page.getByRole('region', { name: 'Proposed change request' });
const requests = () => (existsSync(REQUESTS) ? readFileSync(REQUESTS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { messages: { role: string; content: string }[] }) : []);

async function approvedIntent(): Promise<void> {
  const store = await initialisedFolder('Keel');
  await createDocument(store, { kind: 'intent', title: 'Keel', template: 'standard-intent@3', body: '# Intent\n\n## Requirements\n\n- REQ-005 Each stage unlocks only when the previous one is approved\n' });
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  if (!page.url().includes('/discuss')) await page.goto('/discuss');
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function startWith(page: Page, text: string): Promise<void> {
  await sendMessage(page, text);
  await page.waitForURL(/\/discuss\/DSC-\d+$/, { timeout: 30_000 });
  await expect(page.getByLabel('The assistant is answering')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText(text.slice(0, 40));
}

const changeIds = () => (existsSync(join(BDD_PROJECT, 'changes')) ? readdirSync(join(BDD_PROJECT, 'changes')).filter((f) => /^CR-\d+$/.test(f)) : []);

Given('an initialised folder with an approved intent', async () => {
  await approvedIntent();
});

When('I start a discussion with {string}', async ({ page }, text: string) => {
  await startWith(page, text);
});

When('the assistant proposes a change request', async ({ page }) => {
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
});

Then('I see a {string} card with Why, What changes and Requirement changes', async ({ page }, name: string) => {
  const c = page.getByRole('region', { name });
  for (const field of ['Why', 'What changes', 'Requirement changes']) await expect(c.getByRole('term').filter({ hasText: new RegExp(`^${field}$`) })).toBeVisible();
});

Then('new requirements, tasks and decisions show {string} instead of an ID', async ({ page }, label: string) => {
  const c = card(page);
  for (const field of ['Requirement changes', 'Tasks', 'Decision']) {
    await expect(c.locator('dt', { hasText: new RegExp(`^${field}$`) }).locator('xpath=following-sibling::dd[1]')).toContainText(label);
  }
  await expect(c).not.toContainText(/REQ-006|R1\b|ADR-0001/);
});

Given('a discussion with a proposal waiting', async ({ page }) => {
  await approvedIntent();
  await startWith(page, 'Reviewers should comment on the spec before I approve it');
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
});

When('I send {string}', async ({ page }, text: string) => {
  const before = (await page.getByRole('list', { name: 'Messages' }).getByRole('listitem').count());
  await sendMessage(page, text);
  await expect(page.getByRole('list', { name: 'Messages' }).getByRole('listitem')).toHaveCount(before + 2, { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('Press Agree and create the change request');
  // The turn is saved and committed before the reply is final.
  await expect(page.getByLabel('The assistant is answering')).toHaveCount(0, { timeout: 30_000 });
});

Then('no change request is created', async () => {
  expect(changeIds()).toEqual([]);
});

Then('I see "Typing “yes” creates nothing: use Agree on the proposal"', async ({ page }) => {
  await expect(page.getByText('Typing “yes” creates nothing: use Agree on the proposal')).toBeVisible();
});

Then('I see "The proposal could not be read; ask the assistant to propose again"', async ({ page }) => {
  await expect(page.getByText('The proposal could not be read; ask the assistant to propose again')).toBeVisible();
});

Then('a change request is created as a Draft with the next free ID', async ({ page }) => {
  await expect(page.getByText('CR-0001 created as a draft')).toBeVisible({ timeout: 30_000 });
  expect(readChange(BDD_PROJECT, 'CR-0001')).toMatchObject({ status: 'draft', origin: 'keel' });
});

Then('its folder contains the change request, PROMPT.md, the tasks, the scenarios and discussion.md', async () => {
  const folder = join(BDD_PROJECT, 'changes', 'CR-0001');
  expect(readdirSync(folder)).toEqual(expect.arrayContaining(['CR-0001.md', 'PROMPT.md', 'tasks', 'features', 'discussion.md']));
  expect(readdirSync(join(folder, 'tasks')).length).toBeGreaterThan(0);
  expect(readdirSync(join(folder, 'features')).some((f) => f.endsWith('.feature'))).toBe(true);
  expect(readFileSync(join(folder, 'discussion.md'), 'utf8')).toContain('Reviewers should comment on the spec before I approve it');
});

Then('the change request header names the discussion', async () => {
  expect(readChange(BDD_PROJECT, 'CR-0001')?.discussion).toBe('DSC-0001');
});

Then('all of it is in one Keel commit', async () => {
  expect(git('log', '-1', '--format=%an|%s')).toBe('Keel|Keel: CR-0001 from discussion DSC-0001');
  const files = git('show', '--name-only', '--format=', 'HEAD').split('\n');
  expect(files).toEqual(expect.arrayContaining(['changes/CR-0001/CR-0001.md', 'changes/CR-0001/PROMPT.md', 'changes/CR-0001/discussion.md', 'changes/README.md']));
  expect(git('status', '--porcelain', '--', 'changes', '.keel')).toBe('');
});

Given('the assistant proposes a change to {string}, which does not exist', async ({ page }, id: string) => {
  expect(id).toBe('REQ-099');
  await approvedIntent();
  control('unknown-req');
  await startWith(page, 'Reviewers should comment on the spec before I approve it');
});

When('the proposal is shown', async ({ page }) => {
  await expect(card(page)).toBeVisible({ timeout: 30_000 });
});

Then('the card shows {string}', async ({ page }, text: string) => {
  await expect(card(page).getByRole('list', { name: 'Checks' })).toContainText(text);
});

Then('{string} is disabled until I edit it', async ({ page }, label: string) => {
  await expect(card(page).getByRole('button', { name: label })).toBeDisabled();
  await card(page).getByRole('link', { name: 'Edit' }).click();
  const form = page.getByRole('form', { name: 'Edit the proposal' });
  const field = form.getByLabel('Requirement changes');
  await field.fill((await field.inputValue()).split('\n').filter((l) => !l.startsWith('REQ-099')).join('\n'));
  await form.getByRole('button', { name: 'Save the proposal' }).click();
  await expect(card(page).getByRole('button', { name: label })).toBeEnabled();
  expect(readFileSync(join(BDD_PROJECT, '.keel', 'discussions', 'DSC-0001.md'), 'utf8')).toContain('edited the proposal');
});

Given('the assistant answers with an invalid proposal twice', async () => {
  await approvedIntent();
  control('invalid');
});

When('the proposal is read', async ({ page }) => {
  await startWith(page, 'Reviewers should comment on the spec before I approve it');
});

Then('the reply is shown as text', async ({ page }) => {
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('"title": "Reviewer comments"');
  // Asked again once: two discussion requests, the second with the correction.
  const sent = requests();
  expect(sent).toHaveLength(2);
  expect(sent[1]?.messages.at(-1)?.content).toContain('could not be read');
});

Given('I untick {string} in {string}', async ({ page }, source: string, panel: string) => {
  await approvedIntent();
  await page.goto('/discuss');
  await expect(page.getByRole('region', { name: panel })).toBeVisible();
  await page.getByRole('checkbox', { name: source, exact: true }).uncheck();
});

When('I send a message', async ({ page }) => {
  await startWith(page, 'Should the plan show comments?');
});

Then('the model receives the requirements and the code map as file names', async () => {
  const system = requests()[0]?.messages[0]?.content ?? '';
  expect(system).toContain('## Requirements');
  expect(system).toContain('- REQ-005 Each stage unlocks');
  expect(system).toContain('## Code map (file names)');
});

Then('the model does not receive the plan', async () => {
  const system = requests()[0]?.messages[0]?.content ?? '';
  expect(system).not.toContain('## Plan');
});

When('I try to send {string}', async ({ page }, text: string) => {
  await approvedIntent();
  await page.goto('/discuss');
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
});

Then('the message is held with {string}', async ({ page }, text: string) => {
  await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
});

Then('the text appears in no model request and in no discussion file', async () => {
  expect(existsSync(REQUESTS) ? readFileSync(REQUESTS, 'utf8') : '').not.toContain(KEY);
  const dir = join(BDD_PROJECT, '.keel', 'discussions');
  for (const f of existsSync(dir) ? readdirSync(dir) : []) expect(readFileSync(join(dir, f), 'utf8')).not.toContain(KEY);
  expect(execFileSync('git', ['log', '--all', '-p'], { cwd: BDD_PROJECT, encoding: 'utf8' })).not.toContain(KEY);
});

Given('a discussion without a proposal', async ({ page }) => {
  await approvedIntent();
  control('no-proposal');
  await startWith(page, 'Maybe reviewers should comment?');
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('Before I propose anything');
});

When('I park it', async ({ page }) => {
  await page.getByRole('button', { name: 'Park it' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Parked' })).toBeVisible();
});

Then('it stays in .keel\\/discussions as Parked', async () => {
  expect(readFileSync(join(BDD_PROJECT, '.keel', 'discussions', 'DSC-0001.md'), 'utf8')).toMatch(/^status: parked$/m);
  expect(git('log', '-1', '--format=%s')).toBe('Keel: Park discussion DSC-0001');
});

Then('Earlier discussions lists it', async ({ page }) => {
  const list = page.getByRole('list', { name: 'Earlier discussions' });
  await expect(list.getByRole('listitem').filter({ hasText: 'DSC-0001' })).toContainText('Parked');
});
