// Design as decisions in the Spec (REQ-013, REQ-005, task R12).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { raiseScenarioChange } from '../../src/lib/changes/scenarios';
import { decide } from '../../src/lib/decisions/records';
import { recordDecision, review } from '../../src/lib/gates/approvals';
import { DESIGN_MARKER } from '../../src/lib/generate/design';
import { generateSpec } from '../../src/lib/generate/spec';
import type { Writer } from '../../src/lib/generate/writer';
import { fakeReply } from '../../src/lib/providers/fake';
import { acceptAllSuggestions } from '../../src/lib/scenarios/store';
import { createDocument } from '../../src/lib/store/documents';
import type { Store } from '../../src/lib/store/store';
import { BDD_PROJECT, bddStore, initialisedFolder, stagePath } from './support';

const { Given, When, Then } = createBdd();

const TOPICS = ['Form', 'Language and framework', 'Storage', 'Model access', 'Testing'];
const ID: Record<string, string> = { Form: 'form', 'Language and framework': 'language-and-framework', Storage: 'storage', 'Model access': 'model-access', Testing: 'testing' };

/** The fake provider answers the design topics; the spec's other sections are left for the user. */
const designOnly: Writer = async (_task, messages) => (messages[0]?.content.includes(DESIGN_MARKER) ? fakeReply('anthropic', messages) : undefined);

/** An initialised folder with an approved intent; the TypeScript conventions standard selected. */
async function approvedIntent(): Promise<Store> {
  const store = await initialisedFolder('Readme helper', ['typescript-conventions@3']);
  await createDocument(store, { kind: 'intent', title: 'Readme helper', template: 'standard-intent@3', body: '# Intent\n\n## Requirements\n\n- REQ-001 Show the run command\n' });
  expect((await review(store, 'intent', { action: 'approve', by: 'Ada Lovelace', comment: '' })).ok).toBe(true);
  return store;
}

/** A draft spec from the template with design topics, through the same function the Spec page uses. */
async function draftSpec(then?: (store: Store) => Promise<void>): Promise<void> {
  const store = await approvedIntent();
  expect((await generateSpec(store, 'requirements-and-design-spec@3', designOnly)).ok).toBe(true);
  await then?.(store);
}

const design = (page: Page) => page.getByRole('region', { name: 'Design', exact: true });
const card = (page: Page, topic: string) => design(page).getByRole('region', { name: topic, exact: true });

async function openDesign(page: Page): Promise<void> {
  await page.goto(`${stagePath('spec')}?tab=design#design`);
  await expect(design(page)).toBeVisible();
}

async function pick(page: Page, topic: string, option: string): Promise<void> {
  const form = card(page, topic).getByRole('form', { name: `Decide ${topic}` });
  await form.getByRole('radio', { name: option, exact: true }).check();
  await form.getByRole('button', { name: 'Decide' }).click();
  await expect(card(page, topic).getByRole('form')).toHaveCount(0);
}

function recordFile(topic: string): string | undefined {
  const dir = join(BDD_PROJECT, 'docs', 'decisions');
  return existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(`-${ID[topic]}.md`)) : undefined;
}

Given('an approved intent and the TypeScript conventions standard', async () => {
  await approvedIntent();
});

Given('the folder has a package.json with Next.js', async () => {
  writeFileSync(join(BDD_PROJECT, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0', react: '19.0.0' }, devDependencies: { typescript: '5.9.0' } }));
  await approvedIntent();
});

When('the spec is generated', async ({ page }) => {
  const store = bddStore();
  expect((await generateSpec(store, 'requirements-and-design-spec@3', designOnly)).ok).toBe(true);
  await openDesign(page);
});

Then('the Design tab shows a card for each topic of the spec template', async ({ page }) => {
  for (const topic of TOPICS) await expect(card(page, topic)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Design progress' })).toContainText('0 of 5 topics decided');
});

Then('each card offers at most three options with one marked {string}', async ({ page }, label: string) => {
  for (const topic of TOPICS) {
    const options = card(page, topic).getByRole('group', { name: `Options for ${topic}` }).getByRole('radio');
    const count = (await options.count()) - 1;   // the last one is "Your own option"
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
    await expect(card(page, topic).getByText(label, { exact: true })).toHaveCount(1);
  }
});

Then('an option that breaks TypeScript conventions says so', async ({ page }) => {
  await expect(card(page, 'Language and framework')).toContainText('Breaks TypeScript conventions v3: the code must be TypeScript');
});

Then('the first option for {string} is {string}', async ({ page }, topic: string, name: string) => {
  const first = card(page, topic).getByRole('group', { name: `Options for ${topic}` }).getByRole('radio').first();
  await expect(first).toHaveAccessibleName(new RegExp(`^${name}`));
});

Given('the {string} topic is not decided', async ({ page }, topic: string) => {
  await draftSpec();
  await openDesign(page);
  await expect(card(page, topic)).toContainText('Not decided');
});

When('I pick {string} and decide', async ({ page }, option: string) => {
  await pick(page, 'Testing', option);
});

Then('docs\\/decisions has a new record for Testing', async () => {
  expect(recordFile('Testing')).toMatch(/^\d{4}-testing\.md$/);
});

Then('the record lists the other options as alternatives considered', async () => {
  const text = readFileSync(join(BDD_PROJECT, 'docs', 'decisions', recordFile('Testing') ?? ''), 'utf8');
  expect(text).toContain('## Alternatives considered\n\n- Jest and Cypress:');
  expect(text).toContain('- Manual testing:');
});

Given('the spec is a draft and {string} is decided as ADR-0007', async ({ page }, topic: string) => {
  await draftSpec(async (store) => {
    // Six earlier records, so the topic's record is the seventh.
    for (let n = 1; n <= 6; n += 1) await createDocument(store, { kind: 'decision', title: `Earlier decision ${n}`, body: `# Earlier decision ${n}\n`, template: 'decision-record@1', status: 'approved' });
    const decided = await decide(store, ID[topic] ?? '', { chosen: `${ID[topic]}-1`, reason: 'Readable without the tool.' });
    expect(decided).toMatchObject({ ok: true, value: { record: `docs/decisions/0007-${ID[topic]}.md` } });
  });
  await openDesign(page);
});

When('I change it to {string}', async ({ page }, option: string) => {
  await card(page, 'Storage').getByRole('link', { name: 'Change' }).click();
  await pick(page, 'Storage', option);
});

Then('ADR-0007 records the new choice and the previous one', async () => {
  const text = readFileSync(join(BDD_PROJECT, 'docs', 'decisions', '0007-storage.md'), 'utf8');
  expect(text).toContain('# Storage: A single database file');
  expect(text).toMatch(/- Changed from Markdown files in git on \d{4}-\d{2}-\d{2}\./);
});

Given('the decision is Go and every requirement has a scenario', async () => {
  await draftSpec(async (store) => {
    expect((await acceptAllSuggestions(store, raiseScenarioChange)).ok).toBe(true);
    expect((await recordDecision(store, { decision: 'go', by: 'Ada Lovelace', reason: 'Worth it.', consequences: '' })).ok).toBe(true);
  });
});

Given('{string} is not decided', async ({}, topic: string) => {
  const store = bddStore();
  for (const other of TOPICS.filter((t) => t !== topic)) expect((await decide(store, ID[other] ?? '', { chosen: `${ID[other]}-1`, reason: '' })).ok).toBe(true);
});

Then('the message names {string}', async ({ page }, topic: string) => {
  await expect(page.getByRole('region', { name: 'Plan stage' })).toContainText(`Needs every design topic decided (${topic})`);
});
