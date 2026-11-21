import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { pushHandoff } from '../../src/lib/github/push';
import { buildHandoff } from '../../src/lib/handoff/scaffold';
import { parseDocument } from '../../src/lib/store/documents';
import { BDD_HOME, projectWithApprovedPlan, world } from './support';

const { Given, When, Then } = createBdd();

// A local bare repository stands in for GitHub (plan: test strategy); the server allows it with KEEL_ALLOW_LOCAL_REMOTES.
let remote = '';
const AGENT_MESSAGE = 'Split T1 so the run command gets its own task';
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

Given('a project pushed to a repository', async () => {
  await projectWithApprovedPlan('readback', async (store) => {
    remote = join(mkdtempSync(join(tmpdir(), 'keel-remote-')), 'repo.git');
    git(tmpdir(), 'init', '-q', '--bare', '--initial-branch=main', remote);
    const built = await buildHandoff(store, world.slug);
    if (!built.ok) throw new Error(built.message);
    const pushed = await pushHandoff(store, world.slug, { kind: 'local', path: remote, branch: 'main' }, built.value, 'PLN-0001@1', { env: { KEEL_ALLOW_LOCAL_REMOTES: '1' } });
    expect(pushed.ok).toBe(true);
  });
});

When('the coding agent commits a change to docs\\/plan.md', async () => {
  const clone = mkdtempSync(join(tmpdir(), 'keel-agent-'));
  git(clone, 'clone', '-q', remote, '.');
  const plan = join(clone, 'docs', 'plan.md');
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('## Risks', '## Risks\n\n- The run command differs per operating system.\n'));
  git(clone, '-c', 'user.name=Coding Agent', '-c', 'user.email=agent@example.com', 'commit', '-qam', AGENT_MESSAGE);
  git(clone, 'push', '-q', 'origin', 'main');
});

When('Keel checks the repository', async ({ page }) => {
  await page.goto(`/projects/${world.slug}/handoff`);
  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByRole('list', { name: 'Pending changes' })).toBeVisible();
});

Then('the change is shown as pending', async ({ page }) => {
  const change = page.getByRole('list', { name: 'Pending changes' }).getByRole('listitem', { name: 'docs/plan.md' });
  await expect(change).toContainText('Pending');
  await expect(change).toContainText(AGENT_MESSAGE);
  await expect(change.getByRole('list', { name: 'Changes to docs/plan.md' })).toContainText('+ - The run command differs per operating system.');
});

Then('accepting it creates a new plan version', async ({ page }) => {
  await page.getByRole('button', { name: 'Accept as plan v2' }).click();
  await expect(page.getByText('No changes from the coding agent.')).toBeVisible();
  const plan = parseDocument(readFileSync(join(BDD_HOME, 'projects', world.slug, 'docs', 'plan.md'), 'utf8'));
  if (!plan.ok) throw new Error(plan.message);
  expect(plan.value.header.version).toBe(2);
  expect(plan.value.body).toContain('The run command differs per operating system.');
  await page.goto(`/projects/${world.slug}/versions?doc=docs%2Fplan.md&v=2`);
  await expect(page.getByRole('status')).toContainText(`Read back from`);
  await expect(page.getByRole('status')).toContainText(AGENT_MESSAGE);
});
