// Clickable mock made elsewhere from the spec, attached as a versioned mock set (REQ-010, REQ-005, task R14).
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { raiseScenarioChange } from '../../src/lib/changes/scenarios';
import { decide } from '../../src/lib/decisions/records';
import { recordDecision, review } from '../../src/lib/gates/approvals';
import { DESIGN_MARKER } from '../../src/lib/generate/design';
import { generateSpec } from '../../src/lib/generate/spec';
import type { Writer } from '../../src/lib/generate/writer';
import { saveMockSet } from '../../src/lib/mocks/sets';
import { fakeReply } from '../../src/lib/providers/fake';
import { acceptAllSuggestions } from '../../src/lib/scenarios/store';
import type { Store } from '../../src/lib/store/db';
import { createDocument, readDocument, saveDocument } from '../../src/lib/store/documents';
import { bddStore, initialisedFolder, stagePath } from './support';

const { Given, When, Then } = createBdd();

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const designOnly: Writer = async (_t, messages) => (messages[0]?.content.includes(DESIGN_MARKER) ? fakeReply('anthropic', messages) : undefined);
const TOPICS = ['form', 'language-and-framework', 'storage', 'model-access', 'testing'];

/** An approved intent, a draft spec from the template with design topics, its scenarios accepted, and the topics decided. */
async function specProject(decided: string[] = TOPICS): Promise<Store> {
  const store = await initialisedFolder('Readme helper');
  await createDocument(store, { kind: 'intent', title: 'Readme helper', template: 'standard-intent@3', body: '# Intent\n\n## Problem\n\nNewcomers cannot run a project.\n\n## Requirements\n\n- REQ-001 Show the run command\n- REQ-002 Export the log\n' });
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  expect((await generateSpec(store, 'requirements-and-design-spec@3', designOnly)).ok).toBe(true);
  expect((await acceptAllSuggestions(store, raiseScenarioChange)).ok).toBe(true);
  for (const id of decided) expect((await decide(store, id, { chosen: `${id}-1`, reason: '' })).ok).toBe(true);
  return store;
}

const mockTab = (page: Page) => page.getByRole('region', { name: 'Clickable mock', exact: true });

async function openMockTab(page: Page): Promise<void> {
  await page.goto(`${stagePath('spec')}?tab=mock#mock`);
  await expect(mockTab(page)).toBeVisible();
}

Given('a spec whose Form decision is "Local web app"', async () => {
  const store = await specProject(['form']);
  const design = readDocument(store, 'docs/spec.md');
  expect(design.ok && design.value.body).toContain('**Form:** Local web app');
  store.index.close();
});

When('I open the Clickable mock tab', async ({ page }) => {
  await openMockTab(page);
});

Then('the prompt lists each screen with its requirement IDs', async ({ page }) => {
  const prompt = mockTab(page).getByLabel('Clickable mock prompt');
  await expect(prompt).toContainText('Form: Local web app');
  await expect(prompt).toContainText(/01 · .+ \(REQ-001\)/);
  await expect(prompt).toContainText(/02 · .+ \(REQ-002\)/);
  await mockTab(page).getByRole('link', { name: 'Screens it asks for' }).click();
  await expect(mockTab(page).getByRole('list', { name: 'Screens it asks for' }).getByRole('listitem')).toHaveCount(2);
});

Then('it asks for files named {string}', async ({ page }, pattern: string) => {
  await mockTab(page).getByRole('link', { name: 'Prompt', exact: true }).click();
  const spec = readDocument(bddStore(), 'docs/spec.md');
  const version = spec.ok ? spec.value.header.version : 0;
  await expect(mockTab(page).getByLabel('Clickable mock prompt')).toContainText(`Name each file: ${pattern.replace('<N>', String(version))}.png`);
  await expect(mockTab(page).getByRole('link', { name: `Download keel-mock-prompt-spec-v${version}.md` })).toHaveAttribute('href', '/api/mock-prompt');
});

Given('I drop {string} and {string}', async ({ page }, first: string, second: string) => {
  (await specProject(['form'])).index.close();
  await openMockTab(page);
  await mockTab(page).getByLabel('Exported files').setInputFiles([
    { name: first, mimeType: 'image/png', buffer: PNG },
    { name: second, mimeType: 'image/png', buffer: PNG },
  ]);
});

Then('the first file is matched to Explore and REQ-001', async ({ page }) => {
  const row = mockTab(page).getByRole('table', { name: 'Matched files' }).getByRole('row', { name: 'spec-v9 · 03 · Explore · REQ-001.png' });
  await expect(row).toContainText('03 · Explore');
  await expect(row).toContainText('REQ-001');
  await expect(row).toContainText('From the file name');
});

Then('{string} asks me to choose a screen', async ({ page }, name: string) => {
  const row = mockTab(page).getByRole('table', { name: 'Matched files' }).getByRole('row', { name });
  await expect(row).toContainText('Choose a screen');
  await expect(row.getByRole('combobox', { name: `Choose a screen for ${name}` })).toHaveValue('');
});

Given('mock set 1 was made from spec v9', async () => {
  const store = await specProject(['form']);
  // Earlier versions of the spec, up to v9.
  for (let spec = readDocument(store, 'docs/spec.md'); spec.ok && spec.value.header.version < 9; spec = readDocument(store, 'docs/spec.md')) {
    await saveDocument(store, 'docs/spec.md', { reason: `Edit ${spec.value.header.version + 1}`, body: `${spec.value.body}\n` });
  }
  const set = await saveMockSet(store, { files: [{ name: 'spec-v9 · 01 · Run · REQ-001.png', bytes: new Uint8Array(PNG), number: '01', screen: 'Run', reqs: ['REQ-001'], matched: 'name' }] });
  expect(set).toMatchObject({ ok: true, value: { set: 1, specVersion: 9 } });
  store.index.close();
});

When('the spec gets version 10', async () => {
  const store = bddStore();
  const spec = readDocument(store, 'docs/spec.md');
  expect(spec.ok && spec.value.header.version).toBe(9);
  expect((await saveDocument(store, 'docs/spec.md', { reason: 'A change', body: spec.ok ? `${spec.value.body}\nChanged.\n` : '' })).ok).toBe(true);
  store.index.close();
});

Then('mock set 1 is marked {string}', async ({ page }, label: string) => {
  await openMockTab(page);
  await expect(mockTab(page).getByRole('region', { name: 'Mock set 1' })).toContainText(`${label} · made from spec v9, the spec is v10`);
  await expect(page.getByRole('status', { name: 'Mock status' })).toContainText('Mock set 1 was made from spec v9 and is out of date.');
});

Given('the project setting "Clickable mock before the plan" is "Required"', async ({ page }) => {
  (await specProject()).index.close();
  await page.goto('/settings');
  const form = page.getByRole('form', { name: 'Clickable mock before the plan' });
  await form.getByLabel('Clickable mock before the plan').selectOption('required');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
});

Given('the Form decision has a UI', async () => {
  const spec = readDocument(bddStore(), 'docs/spec.md');
  expect(spec.ok && spec.value.body).toContain('**Form:** Local web app');
});

Given('there is no current mock set', async () => {
  const store = bddStore();
  expect((await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth it.', consequences: '' })).ok).toBe(true);
  store.index.close();
});

Then('the message says a current clickable mock is needed', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Plan stage' })).toContainText('Needs a current clickable mock (no mock set yet; Clickable mock before the plan is Required)');
});

