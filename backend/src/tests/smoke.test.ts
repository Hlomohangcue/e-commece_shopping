/**
 * Backend smoke tests.
 *
 * Validates:
 *  1. The Express app can be imported and Supertest can make requests.
 *  2. GET /health returns 200 with the expected body.
 *  3. GET /api/products returns 200 (empty array — DB is empty at this point).
 *  4. GET /api/products?q=test returns 200 (SQLite search bug regression check).
 *  5. GET /api/products?featured=true returns 200.
 *  6. Unauthenticated GET /api/auth/me returns 401.
 *  7. Unauthenticated GET /api/cart returns 401.
 *  8. Unauthenticated GET /api/orders returns 401.
 *  9. Unauthenticated GET /api/admin/analytics returns 401.
 *
 * These tests are READ-ONLY against the database — no records are created.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Backend smoke tests', () => {
  // ── Health ──────────────────────────────────────────────────────────────

  it('GET /health → 200 with expected body', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      message: 'Backend API is running',
    });
  });

  // ── Products (public, read-only) ─────────────────────────────────────────

  it('GET /api/products → 200 array', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/products?q=test → 200 array (SQLite search regression)', async () => {
    const res = await request(app).get('/api/products?q=test');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/products?featured=true → 200 array', async () => {
    const res = await request(app).get('/api/products?featured=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/products?featured=false → 200 array', async () => {
    const res = await request(app).get('/api/products?featured=false');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── Auth protection ──────────────────────────────────────────────────────

  it('GET /api/auth/me without token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/cart without token → 401', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  it('GET /api/orders without token → 401', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  // ── Admin protection ─────────────────────────────────────────────────────

  it('GET /api/admin/analytics without token → 401', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401);
  });
});
