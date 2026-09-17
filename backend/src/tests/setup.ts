/**
 * Global test setup — runs once before any test file.
 *
 * Loads the root-level .env so JWT_SECRET and DATABASE_URL are available
 * to every test without each file needing to configure dotenv.
 */
import path from 'path';
import { config } from 'dotenv';
import { beforeEach } from 'vitest';

// Load root .env (two levels up from backend/src/tests/)
config({ path: path.resolve(__dirname, '../../../.env'), override: true });
// Also accept a backend-local .env if present
config({ path: path.resolve(__dirname, '../../.env'), override: true });

// Rate-limit stores are intentionally process-local. Reset them between test
// cases so one adversarial threshold test cannot affect an unrelated test;
// production code neither calls nor exposes this test setup hook.
beforeEach(async () => {
  const { loginRateLimiter, registerRateLimiter } = await import('../routes/auth');
  loginRateLimiter.reset();
  registerRateLimiter.reset();
});
