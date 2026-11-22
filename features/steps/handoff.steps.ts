// Handoff into the project folder (REQ-006). Writing: R7. Pushing to the folder's remote: R8.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { scanForSecrets } from '../../src/lib/handoff/secrets-scan';
import { featureSteps, stepExpression } from '../../src/lib/handoff/stubs';
import { saveProvider } from '../../src/lib/settings/settings';
import { BDD_PROJECT, git, pending, projectWithApprovedPlan, stagePath } from './support';

const { Given, When, Then } = createBdd();

// A key stored in Settings, which must never reach the folder. Made up for the test.
const STORED_KEY = 'sk-ant-api03-handoff-test-0123456789abcdefghij';
const MY_AGENTS = '# AGENTS.md\n\nOur own instructions, written by hand.\n';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '.git' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const read = (path: string) => readFileSync(join(BDD_PROJECT, path), 'utf8');

Given('an initialised folder with an approved plan', async () => {
  await projectWithApprovedPlan((store) => saveProvider(store, 'anthropic', { apiKey: STORED_KEY }));
});

When('I write the handoff to the folder', async ({ page }) => {
  await page.goto(stagePath('handoff'));
  await page.getByRole('button', { name: 'Write to folder' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Wrote \d+ files in one Keel commit\.$/ })).toBeVisible();
});

Then('the folder contains AGENTS.md, REVIEW.md and the agent kit', async () => {
  expect(read('AGENTS.md')).toContain('## Read first');
  expect(read('REVIEW.md')).toContain('## Do not report');
  const agents = readdirSync(join(BDD_PROJECT, '.claude', 'agents'));
  expect(agents).toEqual(expect.arrayContaining(['verifier.md', 'researcher.md', 'code-simplifier.md']));
});

Then('every scenario in features\\/ has a failing step stub', async () => {
  const features = readdirSync(join(BDD_PROJECT, 'features')).filter((f) => f.endsWith('.feature'));
  expect(features.length).toBeGreaterThan(0);
  const steps = readdirSync(join(BDD_PROJECT, 'features', 'steps')).map((f) => read(`features/steps/${f}`)).join('\n');
  for (const feature of features) {
    const found = featureSteps(read(`features/${feature}`));
    expect(found.length).toBeGreaterThan(0);
    for (const step of found) {
      expect(steps, `${feature}: ${step.text}`).toContain(`${step.keyword}('${stepExpression(step.text)}', async () => {\n  throw new Error('Not implemented: `);
    }
  }
});

Then('no file in the folder contains an API key or token', async () => {
  const files = filesUnder(BDD_PROJECT).map((file) => ({ path: relative(BDD_PROJECT, file), text: readFileSync(file).toString('latin1') }));
  expect(files.filter((f) => f.text.includes(STORED_KEY)).map((f) => f.path)).toEqual([]);
  const texts = files.filter((f) => !f.path.startsWith('.keel/cache/'));
  expect(scanForSecrets(texts, [STORED_KEY])).toEqual([]);
});

Then('the last commit is a Keel commit with the handoff files', async () => {
  expect(git('log', '-1', '--format=%an <%ae>|%s')).toBe('Keel <keel@localhost>|Keel: Handoff for plan v1');
  const committed = git('show', '--name-only', '--format=', 'HEAD').split('\n');
  expect(committed).toEqual(expect.arrayContaining(['AGENTS.md', 'CLAUDE.md', 'REVIEW.md', '.claude/agents/verifier.md', '.github/workflows/ci.yml', '.keel/config.yml']));
  expect(committed.every((p) => !p.startsWith('src/'))).toBe(true);
});

Given('the folder already has an AGENTS.md that Keel did not write', async () => {
  writeFileSync(join(BDD_PROJECT, 'AGENTS.md'), MY_AGENTS);
  git('-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'add', 'AGENTS.md');
  git('-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', 'commit', '-qm', 'Our agent instructions');
});

When('I open the Handoff page', async ({ page }) => {
  await page.goto(stagePath('handoff'));
});

Then('AGENTS.md is shown as a conflict', async ({ page }) => {
  const row = page.getByRole('table', { name: 'Handoff files' }).getByRole('row', { name: 'AGENTS.md', exact: true });
  await expect(row).toContainText('Conflict');
  await expect(row.getByLabel('Keep mine')).toBeChecked();
  await expect(row.getByLabel("Use Keel's")).toBeVisible();
  await expect(row.getByText('AGENTS.keel.md')).toBeVisible();
});

Then('writing the handoff leaves my AGENTS.md unchanged until I choose', async ({ page }) => {
  await page.getByRole('button', { name: 'Write to folder' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Wrote' })).toBeVisible();
  expect(read('AGENTS.md')).toBe(MY_AGENTS);
  const row = page.getByRole('table', { name: 'Handoff files' }).getByRole('row', { name: 'AGENTS.md', exact: true });
  await expect(row).toContainText('Conflict');
  await expect(page.getByRole('table', { name: 'Handoff files' }).getByRole('row', { name: 'REVIEW.md', exact: true })).toContainText('Unchanged');
});

Given('an initialised folder with a handoff written', async ({ $testInfo }) => {
  pending($testInfo, 'R8');
});

Given('the folder has a remote called origin', async ({ $testInfo }) => {
  pending($testInfo, 'R8');
});

When('I push from the Handoff page', async ({ $testInfo }) => {
  pending($testInfo, 'R8');
});

Then('the remote has the Keel commits', async ({ $testInfo }) => {
  pending($testInfo, 'R8');
});
