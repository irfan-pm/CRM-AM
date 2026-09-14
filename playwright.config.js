const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'https://appdev.hisabkitab360.com',
    headless: false,
    viewport: { width: 1366, height: 768 },
    video: 'on',
    screenshot: 'on',
    trace: 'off',
    launchOptions: {
      slowMo: 300,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
