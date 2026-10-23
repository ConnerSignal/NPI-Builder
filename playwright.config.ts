import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: process.env.PLAYWRIGHT_CHANNEL, headless: true },
  webServer: { command: `npm run ${process.env.PLAYWRIGHT_PREVIEW ? 'preview' : 'dev'} -- --host 127.0.0.1 --port 5174 --strictPort`, url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PREVIEW },
});
