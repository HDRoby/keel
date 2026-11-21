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
  // Scenarios share the dev server's workspace, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'test-results/bdd.json' }]],
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    // Start from an empty workspace so the seed library is current.
    command: 'node -e "require(\'node:fs\').rmSync(process.env.KEEL_HOME, { recursive: true, force: true })" && npm run dev',
    url: 'http://localhost:3000',
    // Never reuse a running Keel: it would be the user's own workspace, not the temporary test one.
    reuseExistingServer: false,
    env: {
      KEEL_HOME: join(tmpdir(), 'keel-bdd'),
      KEEL_PROVIDER: 'fake',
      // Read-back scenarios push to a local bare repository and check on demand.
      KEEL_ALLOW_LOCAL_REMOTES: '1',
      KEEL_READBACK_MINUTES: '0',
    },
  },
});
