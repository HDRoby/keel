import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { openIndex } from '../../src/lib/store/db';
import { createDocument } from '../../src/lib/store/documents';
import { createProject } from '../../src/lib/store/workspace';
import { ensureLibrary, seedDir } from '../../src/lib/templates/library';

const { Given, When, Then } = createBdd();

// Same workspace folder the dev server uses (playwright.config.ts).
const home = join(tmpdir(), 'keel-bdd');

Given('the template "Standard intent v3" is used by 1 project', async () => {
  rmSync(join(home, 'projects'), { recursive: true, force: true });
  rmSync(join(home, 'templates'), { recursive: true, force: true });
  const seeded = ensureLibrary(home, seedDir());
  expect(seeded.ok).toBe(true);
  const index = openIndex(home);
  const store = { home, index };
  const project = await createProject(store, { slug: 'readme-helper', title: 'Readme helper', author: 'Ada Lovelace' });
  expect(project.ok).toBe(true);
  const intent = await createDocument(store, 'readme-helper', {
    kind: 'intent', title: 'Readme helper', body: '# Intent: Readme helper\n', template: 'standard-intent@3',
  });
  expect(intent.ok).toBe(true);
  index.close();
});

When('I open it in the template library', async ({ page }) => {
  await page.goto('/templates');
  await page.getByRole('link', { name: 'Standard intent v3' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Standard intent v3' })).toBeVisible();
});

Then('I cannot remove it', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  await expect(page.getByText('cannot be removed while 1 project uses it')).toBeVisible();
});

Then('I see which projects use it', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Used by' })).toContainText('Readme helper');
});
