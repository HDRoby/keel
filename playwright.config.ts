import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// KEEL_BDD_PORT moves the test server off 3000, so a Keel you are using on 3000 is left alone.
const PORT = process.env.KEEL_BDD_PORT ?? '3000';

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
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    // One project folder and one user folder, both temporary; each scenario empties them (steps/support.ts).
    // KEEL_BDD_SERVER=standalone runs them against the pre-built server (npm run build first), as the package does.
    command: 'node -e "for (const d of [process.env.KEEL_PROJECT_DIR, process.env.KEEL_USER_DIR]) { require(\'node:fs\').rmSync(d, { recursive: true, force: true }); require(\'node:fs\').mkdirSync(d) }" && ' + (process.env.KEEL_BDD_SERVER === 'standalone' ? 'node .next/standalone/server.js' : 'npm run dev'),
    url: `http://localhost:${PORT}`,
    // Never reuse a running Keel: it would be the user's own folder, not the temporary test one.
    reuseExistingServer: false,
    env: {
      KEEL_PROJECT_DIR: join(tmpdir(), 'keel-bdd-project'),
      KEEL_USER_DIR: join(tmpdir(), 'keel-bdd-user'),
      KEEL_PROVIDER: 'fake',
      // One line per model call, so a scenario can check that drafting makes none.
      KEEL_FAKE_LOG: join(tmpdir(), 'keel-bdd-fake.log'),
      // Read-back scenarios check on demand.
      KEEL_READBACK_SECONDS: '0',
      PORT,
    },
  },
});
