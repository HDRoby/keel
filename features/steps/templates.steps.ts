import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { createDocument } from '../../src/lib/store/documents';
import { initialisedFolder } from './support';

const { Given, When, Then } = createBdd();

// One project per folder (CR-0004): "used by 1 project" is this folder's project, through its intent.
Given('the template "Standard intent v3" is used by 1 project', async () => {
  const store = await initialisedFolder('Readme helper');
  const intent = await createDocument(store, {
    kind: 'intent', title: 'Readme helper', body: '# Intent: Readme helper\n', template: 'standard-intent@3',
  });
  expect(intent.ok).toBe(true);
  store.index.close();
});

When('I open it in the template library', async ({ page }) => {
  await page.goto('/templates');
  // The library lists a template under its latest version (v4 since CR-0005); the intent uses v3.
  await page.getByRole('link', { name: /^Standard intent v\d+$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Standard intent v\d+$/ })).toBeVisible();
});

Then('I cannot remove it', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  await expect(page.getByText('cannot be removed while this project uses it (1 document)')).toBeVisible();
});

Then('I see which projects use it', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Used by' })).toContainText('docs/intent.md (standard-intent@3)');
});
