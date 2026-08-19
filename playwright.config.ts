import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * Browser coverage for the paths that are tedious to check by hand and
 * expensive to get wrong.
 *
 * It runs against the development server rather than a production build, so
 * media comes off disk through /api/media-dev and no R2 credentials are needed
 * to run the suite. The database does have to be reachable and migrated, which
 * is the same prerequisite the build has.
 *
 * .env is loaded here as well as by the server, because a test that decides
 * whether to skip on ACCESS_DEV_BYPASS has to read the same value the server
 * acted on. Without it the flag looks unset, the skip does not fire, and the
 * test fails claiming the administration area is open when it is only open
 * because that is what was asked for locally.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* The narrow case is not cosmetic here. The hero picks its encode on layout
       width, and the rule that a phone must not be handed the large file was
       got wrong once already: multiplying by devicePixelRatio pushed a handset
       held sideways over the threshold and pulled 42.8MB over cellular.

       Pixel 7 rather than an iPhone because it runs on Chromium, which is
       already installed. The thing under test is the width arithmetic, not a
       rendering engine, so this costs nothing and saves a browser download. */
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
