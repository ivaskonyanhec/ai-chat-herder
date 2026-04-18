import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Integration tests share real DB/Redis — parallel execution creates race conditions.
  workers: 1,
  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['html', { outputFolder: '../e2e-reports', open: 'never' }],
    ['json', { outputFile: '../e2e-reports/results.json' }],
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
