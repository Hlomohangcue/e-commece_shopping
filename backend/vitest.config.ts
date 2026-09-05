import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests sequentially to avoid DB conflicts on SQLite
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Load .env from workspace root before every test file
    env: {},
    setupFiles: ['./src/tests/setup.ts'],
    // Timeout per test: 15 s (covers DB round-trips)
    testTimeout: 15000,
    // Only look inside src/tests/
    include: ['src/tests/**/*.test.ts'],
  },
});
