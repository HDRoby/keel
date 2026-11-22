import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { answerRequiredSections, stagePath, startIdea } from './support';

const { Given, When, Then } = createBdd();

async function projectWithDraftIntent(page: Page): Promise<void> {
  await startIdea(page);
  await answerRequiredSections(page);
  await page.getByRole('button', { name: 'Draft intent.md' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'intent.md drafted' })).toContainText('status draft');
}

function stage(page: Page, label: string) {
  return page.getByRole('navigation', { name: 'Stages' }).getByRole('link', { name: new RegExp(`^\\d · ${label}\\b`) });
}

Given('a project whose intent is still a draft', async ({ page }) => {
  await projectWithDraftIntent(page);
});

Given('a project whose intent is a draft', async ({ page }) => {
  await projectWithDraftIntent(page);
});

// A locked stage is not a link in the stage bar, so the step goes to its address directly.
When('I open the Spec stage', async ({ page }) => {
  await page.goto(stagePath('spec'));
});

Then('the stage is locked', async ({ page }) => {
  await expect(page.getByRole('status')).toContainText('Locked.');
  await expect(stage(page, 'Spec')).toHaveAttribute('aria-disabled', 'true');
});

Then('I see "Needs an approved intent"', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Spec stage' })).toContainText('Needs an approved intent');
});

When('I approve the intent', async ({ page }) => {
  await stage(page, 'Intent').click();
  const review = page.getByRole('form', { name: 'Review' });
  await review.getByLabel('Approve').check();
  await review.getByLabel('Comment').fill('Clear enough to spec.');
  await review.getByRole('button', { name: 'Record review' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'status approved' })).toBeVisible();
});

Then('the Spec stage is available', async ({ page }) => {
  const spec = stage(page, 'Spec');
  await expect(spec).not.toHaveAttribute('aria-disabled', 'true');
  await spec.click();
  await expect(stage(page, 'Spec')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('form', { name: 'Generate spec' })).toBeVisible();
});
