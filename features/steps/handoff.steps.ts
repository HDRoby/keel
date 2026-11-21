import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { scanForSecrets } from '../../src/lib/handoff/secrets-scan';
import { featureSteps, stepExpression } from '../../src/lib/handoff/stubs';
import { readZip, type ZipEntry } from '../../src/lib/handoff/zip';
import { saveProvider } from '../../src/lib/settings/settings';
import { projectWithApprovedPlan, world } from './support';

const { Given, When, Then } = createBdd();

// A key stored in Settings, which must never reach the package. Made up for the test.
const STORED_KEY = 'sk-ant-api03-handoff-test-0123456789abcdefghij';
let entries: ZipEntry[] = [];
const decode = (data: Uint8Array) => new TextDecoder().decode(data);
const textOf = (path: string) => decode(entries.find((e) => e.path === path)?.data ?? new Uint8Array());

Given('a project with an approved plan', async () => {
  await projectWithApprovedPlan('handoff', (store) => saveProvider(store, 'anthropic', { apiKey: STORED_KEY }));
});

When('I generate the handoff package', async ({ page }) => {
  await page.goto(`/projects/${world.slug}/handoff`);
  await expect(page.getByRole('status').filter({ hasText: 'none found' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download zip' }).click()]);
  entries = readZip(readFileSync(await download.path()));
});

Then('it contains AGENTS.md, docs\\/intent.md, docs\\/spec.md and docs\\/plan.md', async () => {
  const paths = entries.map((e) => e.path);
  expect(paths).toEqual(expect.arrayContaining(['AGENTS.md', 'docs/intent.md', 'docs/spec.md', 'docs/plan.md']));
  expect(textOf('AGENTS.md')).toContain('## Read first');
});

Then('every scenario in it has a failing step stub', async () => {
  const features = entries.filter((e) => /^features\/[^/]+\.feature$/.test(e.path));
  expect(features.length).toBeGreaterThan(0);
  const steps = entries.filter((e) => e.path.startsWith('features/steps/')).map((e) => decode(e.data)).join('\n');
  for (const feature of features) {
    const found = featureSteps(decode(feature.data));
    expect(found.length).toBeGreaterThan(0);
    for (const step of found) {
      expect(steps, `${feature.path}: ${step.text}`).toContain(`${step.keyword}('${stepExpression(step.text)}', async () => {\n  throw new Error('Not implemented: `);
    }
  }
});

Then('it contains no API keys or tokens', async () => {
  const files = entries.map((e) => ({ path: e.path, text: decode(e.data) }));
  expect(scanForSecrets(files, [STORED_KEY])).toEqual([]);
  expect(files.some((f) => f.text.includes(STORED_KEY))).toBe(false);
});
