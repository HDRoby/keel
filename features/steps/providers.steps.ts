import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { section, startIdea } from './support';

const { Given, When, Then } = createBdd();

// The dev server runs with KEEL_PROVIDER=fake: each provider answers with a reply that names it.

async function chooseBrainstormProvider(page: Page, label: string, model: string): Promise<void> {
  await page.goto('/settings');
  const form = page.getByRole('form', { name: 'Brainstorm model' });
  await form.getByLabel('Provider').selectOption({ label });
  await form.getByLabel('Model').fill(model);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await expect(form.getByLabel('Provider')).toHaveValue(
    label === 'Anthropic' ? 'anthropic' : 'openai',
  );
}

Given('the brainstorm uses provider "Anthropic"', async ({ page }) => {
  await chooseBrainstormProvider(page, 'Anthropic', 'claude-opus-5-5');
});

When('I switch the brainstorm model to provider "OpenAI" in Settings', async ({ page }) => {
  await chooseBrainstormProvider(page, 'OpenAI', 'openai-test-model');
});

When('I send a message in the brainstorm', async ({ page }) => {
  // A reply under the comment on a section: the assistant answers in that section's thread.
  await startIdea(page);
  await section(page, 'Who it is for').getByRole('textbox', { name: 'Who it is for', exact: true }).click();
  const reply = page.getByRole('textbox', { name: 'Reply on Who it is for' });
  await reply.fill('Who should use this?');
  await reply.press('Enter');
});

Then('I get a reply from the new provider', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Thread on Who it is for' }).getByRole('listitem').last()).toHaveText('Reply from OpenAI: I read "Who should use this?".');
});
