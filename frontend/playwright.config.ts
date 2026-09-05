import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Targets the existing Next.js dev server at http://localhost:3000.
 * The frontend proxies /api/* to the backend at http://localhost:4000
 * via next.config.js rewrites — no changes needed here.
 *
 * HOW TO RUN:
 *   1. Start the backend:   cd backend && npm run dev
 *   2. Start the frontend:  cd frontend && npm run dev
 *   3. Run E2E tests:       cd frontend && npm run test:e2e
 *
 * The `webServer` block is intentionally NOT used here because both servers
 * are expected to already be running during test execution (avoids spawning
 * conflicting Next.js processes which can cause .next chunk build errors).
 */
export default defineConfig({
  testDir: './e2e',
  // Run tests sequentially — avoids port conflicts and SQLite lock contention
  workers: 1,
  // Fail fast on first failure in CI; continue locally
  fullyParallel: false,
  // Retry once on CI to handle flakiness
  retries: process.env.CI ? 1 : 0,
  // Reporter
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    // Base URL — all page.goto('/path') calls are relative to this
    baseURL: 'http://localhost:3000',
    // Capture trace on first retry
    trace: 'on-first-retry',
    // Screenshot on failure
    screenshot: 'only-on-failure',
    // Headless by default
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
