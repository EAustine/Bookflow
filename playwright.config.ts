/**
 * Playwright — one job: prove the exported web bundle actually loads.
 *
 * It serves `dist/` statically rather than running a dev server, so the
 * thing under test is the artifact CI would deploy, not a Metro dev
 * build. The `import.meta` failure M4a guards against only appears in
 * the exported bundle, because it is a consequence of how Expo's
 * `index.html` includes the script.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 8102;
const DIST = process.env.WEB_DIST ?? 'apps/app/dist';

export default defineConfig({
  testDir: './e2e',
  // A blank page fails fast and identically every time; a retry would
  // only hide a flake that matters.
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npx --yes http-server ${DIST} -p ${PORT} -s --proxy http://127.0.0.1:${PORT}?`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
