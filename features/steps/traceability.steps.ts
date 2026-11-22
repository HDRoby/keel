import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { createDocument, saveDocument } from '../../src/lib/store/documents';
import { commitFiles } from '../../src/lib/store/git';
import { bddStore, BDD_PROJECT, initialisedFolder, stagePath } from './support';

const { Given, When, Then } = createBdd();

// Tasks and feature files are written into the project as the plan and handoff will (T8a); the
// intent change is a new intent version, as read-back (T9) or an edit would make it.
const intentBody = (req3: string) => `# Intent: Templates\n\n## Requirements\n\n- REQ-001 Brainstorm with an LLM\n- REQ-003 ${req3}\n`;
const scenario = 'A template used by a project cannot be removed';

Given('REQ-003 is linked to task T2 and to a scenario', async () => {
  const s = await initialisedFolder('Trace demo');
  await createDocument(s, { kind: 'intent', title: 'Templates', body: intentBody('Versioned, editable templates'), template: 'standard-intent@3' });
  await createDocument(s, { kind: 'task', title: 'Document store', body: '# T1 · Document store\n', template: 'task@1', extra: { requirements: ['REQ-001'] } });
  await createDocument(s, {
    kind: 'task', title: 'Template library', template: 'task@1', extra: { requirements: ['REQ-003'] },
    body: '# T2 · Template library\n\n## Scenarios that prove it\n\n- `features/templates.feature`\n',
  });
  const dir = BDD_PROJECT;
  mkdirSync(join(dir, 'features'), { recursive: true });
  writeFileSync(join(dir, 'features/templates.feature'), `Feature: Templates\n\n  @REQ-003\n  Scenario: ${scenario}\n    Given a template\n`);
  await commitFiles(dir, ['features/templates.feature'], 'Add acceptance scenarios');
  s.index.close();
});

When('REQ-003 changes in a new intent version', async () => {
  const s = bddStore();
  const saved = await saveDocument(s, 'docs/intent.md', {
    reason: 'Templates in use cannot be removed', body: intentBody('Versioned, editable templates. A template used by any project cannot be removed.'),
  });
  expect(saved.ok).toBe(true);
  s.index.close();
});

Then('task T2 and that scenario are listed as affected', async ({ page }) => {
  await page.goto(stagePath('trace'));
  await expect(page.getByText('Changed: REQ-003.')).toBeVisible();
  const affected = page.getByRole('list', { name: 'Affected' });
  await expect(affected.getByRole('listitem')).toHaveText([
    'Task T2 · Template library (REQ-003)',
    `Scenario features/templates.feature › ${scenario} (REQ-003)`,
  ]);
});
