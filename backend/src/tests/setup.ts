/**
 * Global test setup — runs once before any test file.
 *
 * Loads the root-level .env so JWT_SECRET and DATABASE_URL are available
 * to every test without each file needing to configure dotenv.
 */
import path from 'path';
import { config } from 'dotenv';

// Load root .env (two levels up from backend/src/tests/)
config({ path: path.resolve(__dirname, '../../../.env'), override: true });
// Also accept a backend-local .env if present
config({ path: path.resolve(__dirname, '../../.env'), override: true });
