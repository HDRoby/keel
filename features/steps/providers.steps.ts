import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { saveProvider } from '../../src/lib/settings/settings';
import { createDocument } from '../../src/lib/store/documents';
import { bddStore, initialisedFolder, section, stagePath, startIdea } from './support';

const { Given, When, Then, After } = createBdd();

// The dev server runs with KEEL_PROVIDER=fake: each provider answers with a reply that names it.

async function chooseBrainstormProvider(page: Page, label: string, model: string): Promise<void> {
  await page.goto('/settings');
  const form = page.getByRole('form', { name: 'Section comments model' });
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

// Ollama as the default provider (REQ-009, task R16). A small stub stands in for Ollama's HTTP API.
let stub: Server | undefined;

/** Starts a stub of Ollama's /api/tags and /api/show with the given models; returns its address. */
export async function ollamaStub(models: { name: string; size: number; parameters: string; context: number }[]): Promise<string> {
  stub = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/tags') {
        response.end(JSON.stringify({ models: models.map((m) => ({ name: m.name, size: m.size, details: { parameter_size: m.parameters } })) }));
      } else if (request.url === '/api/show') {
        const model = models.find((m) => m.name === (JSON.parse(body || '{}') as { model?: string }).model);
        response.end(JSON.stringify({ details: { parameter_size: model?.parameters }, model_info: { 'llama.context_length': model?.context } }));
      } else {
        response.statusCode = 404;
        response.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => stub?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
}

After(async () => {
  await new Promise<void>((resolve) => (stub ? stub.close(() => resolve()) : resolve()));
  stub = undefined;
});

const ollamaCard = (page: Page) => page.getByRole('region', { name: 'Ollama (on this computer)' });

Given('a user with no saved settings', async () => {
  // Each scenario starts with an empty user folder (support.ts).
});

When('I open Settings', async ({ page }) => {
  await page.goto('/settings');
});

Then('the provider is {string}', async ({ page }, label: string) => {
  for (const task of ['Section comments', 'Spec and plan', 'Feasibility review']) {
    await expect(page.getByRole('form', { name: `${task} model` }).getByLabel('Provider')).toHaveValue('ollama');
  }
  await expect(page.getByRole('form', { name: 'Section comments model' }).getByLabel('Provider').locator('option:checked')).toHaveText(label);
  await expect(ollamaCard(page)).toBeVisible();
});

Then('no API key is asked for', async ({ page }) => {
  await expect(ollamaCard(page)).toContainText('No API key needed: nothing leaves this computer.');
  await expect(ollamaCard(page).getByLabel('API key', { exact: true })).toHaveCount(0);
  await expect(ollamaCard(page).getByLabel('Server address')).toBeVisible();
});

Given('Ollama is running with the models {string} and {string}', async ({}, first: string, second: string) => {
  const base = await ollamaStub([
    { name: first, size: 20_200_000_000, parameters: '32.8B', context: 40960 },
    { name: second, size: 8_100_000_000, parameters: '12.2B', context: 131072 },
  ]);
  saveProvider(bddStore(), 'ollama', { baseUrl: base });
});

Then('both models are listed with their size and parameters', async ({ page }) => {
  await expect(ollamaCard(page)).toContainText('Running · 2 models');
  const table = ollamaCard(page).getByRole('table', { name: 'Models on this computer' });
  await expect(table.getByRole('row', { name: 'qwen3:32b' })).toContainText('20.2 GB');
  await expect(table.getByRole('row', { name: 'qwen3:32b' })).toContainText('32.8B');
  await expect(table.getByRole('row', { name: 'gemma3:12b' })).toContainText('8.1 GB');
  await expect(table.getByRole('row', { name: 'gemma3:12b' })).toContainText('12.2B');
});

Then('{string} uses {string}', async ({ page }, task: string, model: string) => {
  await expect(page.getByRole('form', { name: `${task} model` }).getByLabel('Model')).toHaveValue(model);
  await expect(page.getByRole('form', { name: 'Section comments model' }).getByLabel('Model')).toHaveValue('gemma3:12b');
});

Given('Ollama is not running', async () => {
  // A port nothing listens on: start a server to get a free port, then close it.
  const base = await ollamaStub([]);
  await new Promise<void>((resolve) => stub?.close(() => resolve()));
  stub = undefined;
  saveProvider(bddStore(), 'ollama', { baseUrl: base });
});

Then('I see "Ollama is not running" and how to start it', async ({ page }) => {
  await expect(ollamaCard(page)).toContainText('Not running');
  await expect(ollamaCard(page)).toContainText('Ollama is not running');
  await expect(ollamaCard(page)).toContainText('Open the Ollama app, or run ollama serve in a terminal');
});

Then('actions that need a model say why they are unavailable', async ({ page }) => {
  // In setup mode (CR-0012) a page whose actions need a model opens the Startup check, which says why.
  const store = await initialisedFolder('Readme helper');
  await createDocument(store, { kind: 'intent', title: 'Readme helper', template: 'standard-intent@3', status: 'approved', body: '# Intent\n\n## Requirements\n\n- REQ-001 Show the run command\n' });
  store.index.close();
  await page.goto(stagePath('spec'));
  await page.waitForURL(/\/check$/);
  await expect(page.getByRole('listitem', { name: 'Model provider' })).toContainText('Keel could not reach Ollama');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Keel cannot reach your model');
});
