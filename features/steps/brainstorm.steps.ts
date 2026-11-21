import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { answerCurrent, startIdea } from './support';

const { Given, When, Then } = createBdd();

Given('a new idea using the "Standard intent v3" template', async ({ page }) => {
  await startIdea(page, { template: 'Standard intent v3' });
});

// Each section gets a question, then one probe in the chosen style. Answering the first
// question captures Problem; the open question is then the probe on Problem.
Given('the problem section is already captured', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Asking about: Problem');
  await answerCurrent(page, 'Newcomers cannot find how to run a project.');
  await expect(page.getByRole('list', { name: 'Idea summary' }).getByRole('listitem').filter({ hasText: 'captured: Problem' })).toBeVisible();
});

When('I answer the current question', async ({ page }) => {
  await answerCurrent(page, 'We saw it in five onboarding sessions.');
});

Then('the assistant asks about "Desired outcome"', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Asking about: Desired outcome');
});
