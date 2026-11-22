import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { createDocument } from '../../src/lib/store/documents';
import { BDD_PROJECT, initialisedFolder, stagePath } from './support';

const { Given, When, Then } = createBdd();

Given('an intent with requirements REQ-001 and REQ-002', async () => {
  const store = await initialisedFolder('Mocks demo');
  await createDocument(store, {
    kind: 'intent', title: 'Mocks demo', template: 'standard-intent@3',
    body: '# Intent: Mocks demo\n\n## Requirements\n\n- REQ-001 Show the stage bar\n- REQ-002 Record approvals\n',
  });
  store.index.close();
});

When('I attach the link "https:\\/\\/example.com\\/mock" to the intent', async ({ page }) => {
  await page.goto(stagePath('intent'));
  const attach = page.getByRole('form', { name: 'Attach a mock reference' });
  await attach.getByLabel('Title').fill('Stage bar mockup');
  await attach.getByLabel('Link').fill('https://example.com/mock');
  await attach.getByRole('button', { name: 'Attach' }).click();
  await expect(page.getByRole('listitem', { name: 'MOCK-001' })).toContainText('https://example.com/mock');
});

When('I link it to REQ-001', async ({ page }) => {
  const form = page.getByRole('form', { name: 'Requirements for MOCK-001' });
  await form.getByLabel('REQ-001').check();
  await form.getByRole('button', { name: 'Link requirements' }).click();
});

Then('the reference lists REQ-001', async ({ page }) => {
  await expect(page.getByRole('listitem', { name: 'MOCK-001' })).toContainText('shows REQ-001');
});

Then('it is saved under .keel\\/mocks\\/', async () => {
  const index = readFileSync(join(BDD_PROJECT, '.keel', 'mocks', 'references.md'), 'utf8');
  expect(index).toContain('| MOCK-001 | [Stage bar mockup](https://example.com/mock) | Link | Intent | REQ-001 |');
});
