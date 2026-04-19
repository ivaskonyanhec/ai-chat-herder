import { defineConfig, devices } from '@playwright/test';

const reportDir = process.env.E2E_REPORT_DIR ?? '../e2e-reports/latest';

export default defineConfig({
  testDir: './tests',
  outputDir: `${reportDir}/artifacts`,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Integration tests share real DB/Redis — parallel execution creates race conditions.
  workers: 1,
  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['html', { outputFolder: `${reportDir}/html`, open: 'never' }],
    ['json', { outputFile: `${reportDir}/results.json` }],
    ['junit', { outputFile: `${reportDir}/junit.xml` }],
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
