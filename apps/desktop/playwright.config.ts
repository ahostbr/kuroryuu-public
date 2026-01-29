import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',

  // Electron requires serial execution
  fullyParallel: false,
  workers: 1,

  // Reasonable timeout for Electron startup
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'e2e-report' }],
    ['list'],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Build before testing (optional - can be done manually)
  // webServer: {
  //   command: 'npm run build',
  //   timeout: 120000,
  //   reuseExistingServer: !process.env.CI,
  // },
});
