import { createBdd } from 'playwright-bdd';
import { startIdea } from './support';

const { Given } = createBdd();

// "When I draft intent.md" and the header check are shared with intent-document.steps.ts.
Given('a new idea started with the "Challenger" brainstorm style', async ({ page }) => {
  await startIdea(page, { style: 'Challenger' });
});
