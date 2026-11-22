// Handoff into the project folder (REQ-006). Writing (R7) and pushing (R8) are built by later rework tasks.
import { createBdd } from 'playwright-bdd';
import { pending, projectWithApprovedPlan } from './support';

const { Given, When, Then } = createBdd();

Given('an initialised folder with an approved plan', async () => {
  await projectWithApprovedPlan();
});

When('I write the handoff to the folder', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Then('the folder contains AGENTS.md, REVIEW.md and the agent kit', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Then('every scenario in features\\/ has a failing step stub', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Then('no file in the folder contains an API key or token', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Then('the last commit is a Keel commit with the handoff files', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Given('the folder already has an AGENTS.md that Keel did not write', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

When('I open the Handoff page', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Then('AGENTS.md is shown as a conflict', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
});

Then('writing the handoff leaves my AGENTS.md unchanged until I choose', async ({ $testInfo }) => {
  pending($testInfo, 'R7');
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
