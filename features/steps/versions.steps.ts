import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { createDocument, saveDocument } from '../../src/lib/store/documents';
import { initialisedFolder, stagePath } from './support';

const { Given, When, Then } = createBdd();

const table = (rows: string[]) => `# Plan: Versions demo\n\n## Order of work\n\n| Task | Title | Requirements |\n| --- | --- | --- |\n${rows.join('\n')}\n`;
const REASON_4 = 'Split the store task so each pull request stays small';

// The plan is written through the document store, as Generate plan and its edits would.
Given('plan versions 3 and 4 exist', async () => {
  const store = await initialisedFolder('Versions demo');
  await createDocument(store, { kind: 'plan', title: 'Versions demo', template: 'implementation-plan@2', body: table(['| T1 | Store | REQ-001 |']) });
  await saveDocument(store, 'docs/plan.md', { reason: 'Add templates task', body: table(['| T1 | Store | REQ-001 |', '| T2 | Templates | REQ-003 |']) });
  await saveDocument(store, 'docs/plan.md', { reason: 'Add providers task', body: table(['| T1 | Store | REQ-001 |', '| T2 | Templates | REQ-003 |', '| T3 | Providers | REQ-009 |']) });
  await saveDocument(store, 'docs/plan.md', {
    reason: REASON_4,
    body: table(['| T1a | Store files | REQ-001 |', '| T1b | Store index | REQ-001 |', '| T2 | Templates | REQ-003 |', '| T3 | Providers | REQ-009 |']),
  });
  store.index.close();
});

When('I select version 4', async ({ page }) => {
  await page.goto(`${stagePath('versions')}?doc=docs%2Fplan.md`);
  await page.getByRole('navigation', { name: 'Versions' }).getByRole('link', { name: 'v4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version 4, compared with version 3' })).toBeVisible();
});

Then('I see the lines that changed from version 3', async ({ page }) => {
  const changes = page.getByRole('list', { name: 'Changes' });
  await expect(changes.locator('li[data-change="removed"]')).toHaveText(['− | T1 | Store | REQ-001 |']);
  await expect(changes.locator('li[data-change="added"]')).toHaveText(['+ | T1a | Store files | REQ-001 |', '+ | T1b | Store index | REQ-001 |']);
});

Then('I see the reason recorded for version 4', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText(`Reason: ${REASON_4}`);
});
