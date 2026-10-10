import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the app on the web (Metro, :8081) against the dev API (:3001) and its database.
 * Every run starts from the fixture data — `global-setup.ts` resets the test organisations, which
 * include the tournament *Test Spring Festival* (`fixtures/testOrgs.ts`). Run from the repo root:
 * `npm run e2e`. Both servers must be running (`npm run web` in expo-app, `npm run dev` in server).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // `explore/` takes screenshots to look at, rather than testing: run it with E2E_EXPLORE=1.
  testIgnore: process.env.E2E_EXPLORE ? [] : ['**/explore/**'],
  globalSetup: './global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // One at a time: the tests share one database and some change it.
  fullyParallel: false,
  workers: 1,
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // After the phone, so its read-only tests see the data before the desktop tests change it.
    { name: 'desktop', dependencies: ['phone'], use: { viewport: { width: 1280, height: 900 } } },
    // The phone runs only the tests tagged @phone — ones that read and change nothing, so the same
    // data is not changed twice.
    { name: 'phone', grep: /@phone/, use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
});
