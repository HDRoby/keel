// Read-back from the local repository (REQ-007, ADR-0012). Built by rework task R6.
import { createBdd } from 'playwright-bdd';
import { pending } from './support';

const { When, Then } = createBdd();

When('the coding agent commits a change to docs\\/plan.md', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

When('the coding agent edits tasks\\/T2.md without committing', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

When('Keel commits a new spec version', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

When('Keel checks the folder', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

Then('the change is shown as pending', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

Then('accepting it creates a new plan version in draft', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

Then('the change is shown as pending and marked Uncommitted', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});

Then('there are no changes to review', async ({ $testInfo }) => {
  pending($testInfo, 'R6');
});
