import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: 'features/steps/*.ts',
});

export default defineConfig({
  testDir,
  // Scenarios share the dev server's project folder, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'test-results/bdd.json' }]],
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    // One project folder and one user folder, both temporary; each scenario empties them (steps/support.ts).
    command: 'node -e "for (const d of [process.env.KEEL_PROJECT_DIR, process.env.KEEL_USER_DIR]) { require(\'node:fs\').rmSync(d, { recursive: true, force: true }); require(\'node:fs\').mkdirSync(d) }" && npm run dev',
    url: 'http://localhost:3000',
    // Never reuse a running Keel: it would be the user's own folder, not the temporary test one.
    reuseExistingServer: false,
    env: {
      KEEL_PROJECT_DIR: join(tmpdir(), 'keel-bdd-project'),
      KEEL_USER_DIR: join(tmpdir(), 'keel-bdd-user'),
      KEEL_PROVIDER: 'fake',
      // Read-back scenarios check on demand.
      KEEL_ALLOW_LOCAL_REMOTES: '1',
      KEEL_READBACK_SECONDS: '0',
    },
  },
});
