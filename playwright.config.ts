import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Headless Chromium renders the 2x canvas in software, so touch flows are slow on shared CPUs.
  timeout: 150_000,
  fullyParallel: true,
  retries: 0,
  // On CI the github reporter turns each failure into a readable annotation on the run.
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 915, height: 412 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
