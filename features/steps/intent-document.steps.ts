import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { answerRequiredSections, intentHeader, startIdea } from './support';

const { Given, When, Then } = createBdd();

let header: Record<string, unknown>;

Given('a brainstorm with every required section answered', async ({ page }) => {
  await startIdea(page);
  await answerRequiredSections(page);
});

// Also used by brainstorm-styles.feature: drafting needs every required section, so any still
// missing are answered first.
When('I draft intent.md', async ({ page }) => {
  await answerRequiredSections(page);
  await page.getByRole('button', { name: 'Draft intent.md' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'intent.md drafted' })).toBeVisible();
  header = intentHeader();
});

Then('its header has id, project, author, created, updated, status and version', async () => {
  for (const field of ['id', 'project', 'author', 'created', 'updated', 'status', 'version']) {
    expect(header[field], `header field ${field}`).toBeTruthy();
  }
  expect(header).toMatchObject({ id: 'INT-0001', author: 'Ada Lovelace', version: 1, template: 'standard-intent@3' });
});

Then('the status is "draft"', async () => {
  expect(header.status).toBe('draft');
});

Then('its header records brainstorm_style {string}', async ({}, style: string) => {
  expect(header.brainstorm_style).toBe(style);
});
