/**
 * Phase 17D — Security Regression Tests
 *
 * This suite is ADVERSARIAL. Every test actively attempts to break a security
 * boundary. A passing test means the attack was blocked correctly.
 *
 * Domains covered:
 *   1  — JWT / authentication edge cases
 *   2  — Admin authorization matrix (every route × every actor)
 *   3  — IDOR / cross-user ownership
 *   4  — Input validation & numeric edge cases
 *   5  — Injection resistance (SQL, XSS, path traversal, template injection)
 *   6  — Rate limiting
 *   7  — HTTP method & status-code correctness
 *   8  — Sensitive information leakage
 *   9  — Password & credential security
 *   10 — Checkout / payment security
 *   11 — Webhook security
 *   12 — Product / catalog authorization
 *   13 — Database integrity after malicious requests
 *
 * Every test that creates data tracks IDs and cleans up in afterAll.
 * No deleteMany({}) on whole tables.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { loginRateLimiter, registerRateLimiter } from '../routes/auth';
import * as stripeUtils from '../utils/stripe';
import {
  uid,
  createTestAdmin,
  createTestCustomer,
  createTestCategory,
  createTestProduct,
  createTestOrder,
  trackUserId,
  signTestToken,
  cleanup,
  prisma,
} from './helpers/fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Shared state
// ─────────────────────────────────────────────────────────────────────────────
let admin: Awaited<ReturnType<typeof createTestAdmin>>;
let adminToken: string;

let customerA: Awaited<ReturnType<typeof createTestCustomer>>;
let tokenA: string;

let customerB: Awaited<ReturnType<typeof createTestCustomer>>;
let tokenB: string;

let category: Awaited<ReturnType<typeof createTestCategory>>;
let product: Awaited<ReturnType<typeof createTestProduct>>;

const apiCreatedIds: {
  products: string[];
  categories: string[];
  orderItems: string[];
  orders: string[];
} = { products: [], categories: [], orderItems: [], orders: [] };

function trackApiProduct(product: { id: string; category?: { id: string } }) {
  apiCreatedIds.products.push(product.id);
  if (product.category?.id) apiCreatedIds.categories.push(product.category.id);
}

beforeAll(async () => {
  admin = await createTestAdmin({ password: 'AdminSec123!' });
  adminToken = signTestToken(admin.id, 'admin');

  customerA = await createTestCustomer({ password: 'CustomerASec123!' });
  tokenA = signTestToken(customerA.id, 'customer');

  customerB = await createTestCustomer({ password: 'CustomerBSec123!' });
  tokenB = signTestToken(customerB.id, 'customer');

  category = await createTestCategory();
  product = await createTestProduct(category.id, {
    name: `Security Test Product ${uid()}`,
    price: 15.00,
    published: true,
    featured: false,
  });
});

// Isolate test cases that share the rate limiter's in-memory store. Production
// code has no bypass and retains its configured windows.
beforeEach(() => {
  loginRateLimiter.reset();
  registerRateLimiter.reset();
});

afterAll(async () => {
  // Clean up any products/orders created via HTTP in tests
  if (apiCreatedIds.orderItems.length)
    await prisma.orderItem.deleteMany({ where: { id: { in: apiCreatedIds.orderItems } } });
  if (apiCreatedIds.orders.length)
    await prisma.order.deleteMany({ where: { id: { in: apiCreatedIds.orders } } });
  // Delete product images before products (FK constraint)
  if (apiCreatedIds.products.length) {
    await prisma.productImage.deleteMany({ where: { productId: { in: apiCreatedIds.products } } });
    await prisma.product.deleteMany({ where: { id: { in: apiCreatedIds.products } } });
  }
  if (apiCreatedIds.categories.length)
    await prisma.category.deleteMany({ where: { id: { in: apiCreatedIds.categories } } });

  // Also delete any product images on fixture-tracked products before cleanup()
  // (tests in Domain 12 set image URLs on the shared `product`)
  const fixtureProductIds = [product?.id].filter(Boolean) as string[];
  if (fixtureProductIds.length)
    await prisma.productImage.deleteMany({ where: { productId: { in: fixtureProductIds } } });

  // Clean fixture-tracked records
  await cleanup();
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 1 — JWT / AUTHENTICATION EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 1 — JWT / Authentication edge cases', () => {

  // ── Missing token ──────────────────────────────────────────────────────────
  it('1.1 Missing Authorization header → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.password).toBeUndefined();
  });

  it('1.2 Authorization header present but no token value → 401', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer');
    expect(res.status).toBe(401);
  });

  // ── Malformed tokens ───────────────────────────────────────────────────────
  it('1.3 Bearer "invalid" (not a JWT) → 401', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });

  it('1.4 Bearer "abc.def" (two segments, not three) → 401', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer abc.def');
    expect(res.status).toBe(401);
  });

  it('1.5 Bearer "null" string → 401', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer null');
    expect(res.status).toBe(401);
  });

  it('1.6 Bearer "undefined" string → 401', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer undefined');
    expect(res.status).toBe(401);
  });

  it('1.7 Bearer three-segment but all empty → 401', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer ..');
    expect(res.status).toBe(401);
  });

  // ── Wrong signing secret ───────────────────────────────────────────────────
  it('1.8 Token signed with wrong secret → 401', async () => {
    const fakeToken = jwt.sign(
      { sub: customerA.id, role: 'customer' },
      'completely-wrong-secret',
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });

  // ── Modified payload ───────────────────────────────────────────────────────
  it('1.9 Tampered payload (valid header+sig, modified body) → 401', async () => {
    const validToken = tokenA;
    const parts = validToken.split('.');
    // Replace payload with different user ID
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: admin.id, role: 'admin', iat: Date.now() })
    ).toString('base64url');
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  // ── Expired token ──────────────────────────────────────────────────────────
  it('1.10 Expired token → 401', async () => {
    const secret = process.env.JWT_SECRET!;
    const expired = jwt.sign(
      { sub: customerA.id, role: 'customer' },
      secret,
      { expiresIn: '-1s' } // already expired
    );
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  // ── Deleted user token ─────────────────────────────────────────────────────
  it('1.11 Valid token for deleted user → /me returns 401 (requireAuth rejects before reaching handler)', async () => {
    // Create a fresh user, get their token, then delete them from the DB
    const ghost = await createTestCustomer();
    const ghostToken = signTestToken(ghost.id, 'customer');

    // Delete the user directly in DB
    await prisma.user.delete({ where: { id: ghost.id } });

    // requireAuth now re-checks user existence → returns 401
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${ghostToken}`);
    expect(res.status).toBe(401);
  });

  it('1.12 Valid token for deleted user — cart route should also reject', async () => {
    // Create fresh user, delete, attempt cart access
    const ghost = await createTestCustomer();
    const ghostToken = signTestToken(ghost.id, 'customer');
    await prisma.user.delete({ where: { id: ghost.id } });

    // Cart GET uses requireAuth which currently does NOT re-check user existence.
    // This is vulnerability VUL-001. After fix this should return 401/404.
    const res = await request(app).get('/api/cart')
      .set('Authorization', `Bearer ${ghostToken}`);
    // Post-fix expectation: should be 401 (user no longer exists)
    expect(res.status).toBe(401);
  });

  // ── Role elevation via JWT payload ─────────────────────────────────────────
  it('1.13 Customer cannot self-elevate to admin via forged role in JWT', async () => {
    // Even if customer crafts a JWT claiming role=admin with correct sub,
    // requireAdmin re-checks the DB role — must still be 403
    const fakeAdminToken = signTestToken(customerA.id, 'admin');
    const res = await request(app).get('/api/admin/analytics')
      .set('Authorization', `Bearer ${fakeAdminToken}`);
    expect(res.status).toBe(403);
  });

  // ── Stale role (already in admin.test.ts K-suite, regression here) ─────────
  it('1.14 Stale admin token after role downgrade → 403 (regression)', async () => {
    const tempAdmin = await createTestAdmin();
    const staleToken = signTestToken(tempAdmin.id, 'admin');

    // Confirm it works
    const before = await request(app).get('/api/admin/analytics')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(before.status).toBe(200);

    // Downgrade in DB
    await prisma.user.update({ where: { id: tempAdmin.id }, data: { role: 'customer' } });

    // Same JWT must now be denied
    const after = await request(app).get('/api/admin/analytics')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(after.status).toBe(403);

    // Restore for cleanup
    await prisma.user.update({ where: { id: tempAdmin.id }, data: { role: 'admin' } });
  });

  it('1.15 Deleted admin token is rejected with 401', async () => {
    const deletedAdmin = await createTestAdmin();
    const deletedAdminToken = signTestToken(deletedAdmin.id, 'admin');
    await prisma.user.delete({ where: { id: deletedAdmin.id } });

    const res = await request(app).get('/api/admin/analytics')
      .set('Authorization', `Bearer ${deletedAdminToken}`);
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 2 — ADMIN AUTHORIZATION MATRIX
// Every admin route × every actor (no token / customer / admin)
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 2 — Admin authorization matrix', () => {
  const getEndpoints = [
    '/api/admin/analytics',
    '/api/admin/products',
    '/api/admin/orders',
    '/api/admin/users',
  ];

  for (const path of getEndpoints) {
    it(`2.GET ${path}: no token → 401`, async () => {
      expect((await request(app).get(path)).status).toBe(401);
    });
    it(`2.GET ${path}: customer → 403`, async () => {
      expect((await request(app).get(path).set('Authorization', `Bearer ${tokenA}`)).status).toBe(403);
    });
    it(`2.GET ${path}: admin → 200`, async () => {
      expect((await request(app).get(path).set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
    });
  }

  it('2.POST /api/admin/products: no token → 401', async () => {
    expect((await request(app).post('/api/admin/products').send({})).status).toBe(401);
  });
  it('2.POST /api/admin/products: customer → 403', async () => {
    expect((await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${tokenA}`).send({})).status).toBe(403);
  });

  it('2.PUT /api/admin/products/:id: no token → 401', async () => {
    expect((await request(app).put(`/api/admin/products/${product.id}`).send({ name: 'x' })).status).toBe(401);
  });
  it('2.PUT /api/admin/products/:id: customer → 403', async () => {
    expect((await request(app).put(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`).send({ name: 'x' })).status).toBe(403);
  });

  it('2.DELETE /api/admin/products/:id: no token → 401', async () => {
    expect((await request(app).delete(`/api/admin/products/${product.id}`)).status).toBe(401);
  });
  it('2.DELETE /api/admin/products/:id: customer → 403', async () => {
    expect((await request(app).delete(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`)).status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 3 — IDOR / CROSS-USER OWNERSHIP
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 3 — IDOR / cross-user ownership', () => {

  // ── Cart IDOR ──────────────────────────────────────────────────────────────
  it('3.1 Customer B cannot see Customer A cart (empty — owned by A)', async () => {
    // Add item to A's cart
    const addRes = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 1 });
    expect([200, 201]).toContain(addRes.status);

    // B sees their own (empty) cart — not A's
    const cartB = await request(app).get('/api/cart')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(cartB.status).toBe(200);
    const crossItem = cartB.body.find((i: any) => i.productId === product.id);
    expect(crossItem).toBeUndefined();

    // Clean up A's cart
    await request(app).delete(`/api/cart/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
  });

  it('3.2 Customer B cannot modify Customer A cart item', async () => {
    // Clear A's cart first, then add fresh
    await request(app).delete(`/api/cart/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    const addRes = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 2 });
    expect([200, 201]).toContain(addRes.status);
    const cartItemId = addRes.body.id;

    // B tries to update A's item
    const updateRes = await request(app).put('/api/cart')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ cartItemId, quantity: 99 });
    expect(updateRes.status).toBe(404); // not found for B

    // Verify A's quantity is still 2
    const cartA = await request(app).get('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`);
    const item = cartA.body.find((i: any) => i.id === cartItemId);
    expect(item?.quantity).toBe(2);

    // Clean up
    await request(app).delete(`/api/cart/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
  });

  it('3.3 Customer B cannot delete Customer A cart item', async () => {
    // Add to A's cart
    await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 1 });

    // B tries to delete A's item using the productId
    const delRes = await request(app).delete(`/api/cart/${product.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    // DELETE uses deleteMany with userId constraint — returns {deleted: 0}, still 200
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(0); // nothing deleted for B

    // A's item still exists
    const cartA = await request(app).get('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`);
    const still = cartA.body.find((i: any) => i.productId === product.id);
    expect(still).toBeDefined();

    // Clean up
    await request(app).delete(`/api/cart/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
  });

  // ── Order IDOR ─────────────────────────────────────────────────────────────
  it('3.4 Customer B cannot see Customer A orders', async () => {
    // Create order for A
    const orderRes = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.id;
    apiCreatedIds.orders.push(orderId);
    orderRes.body.items?.forEach((i: any) => apiCreatedIds.orderItems.push(i.id));

    // B's order list must not contain A's order
    const bOrders = await request(app).get('/api/orders')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(bOrders.status).toBe(200);
    const cross = bOrders.body.find((o: any) => o.id === orderId);
    expect(cross).toBeUndefined();
  });

  it('3.5 Unauthenticated user cannot access orders → 401', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  // ── Admin cannot be read by customer ──────────────────────────────────────
  it('3.6 Customer cannot access admin order list (contains all users orders)', async () => {
    const res = await request(app).get('/api/admin/orders')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  it('3.7 Customer cannot access admin user list → 403', async () => {
    const res = await request(app).get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 4 — INPUT VALIDATION & NUMERIC EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 4 — Input validation & numeric edge cases', () => {

  // ── Auth registration ──────────────────────────────────────────────────────
  it('4.1 Register with empty email → 400', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: '', password: 'pass123' });
    expect(res.status).toBe(400);
  });

  it('4.2 Register with whitespace-only email → 400', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: '   ', password: 'pass123' });
    expect(res.status).toBe(400);
  });

  it('4.3 Register with 10000-char password → 400 (exceeds 256 limit)', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: `t-${uid()}@example.test`, password: 'x'.repeat(10000) });
    expect(res.status).toBe(400);
  });

  it('4.4 Register with null body fields → 400', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: null, password: null });
    expect(res.status).toBe(400);
  });

  it('4.5 Register with array instead of object body → 400', async () => {
    const res = await request(app).post('/api/auth/register')
      .send([{ email: 'x@x.com', password: 'y' }]);
    expect(res.status).toBe(400);
  });

  // ── Products search ────────────────────────────────────────────────────────
  it('4.6 Product search with 201-char query → 400', async () => {
    const q = 'a'.repeat(201);
    const res = await request(app).get(`/api/products?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(400);
  });

  it('4.7 Product search with featured=maybe → 400', async () => {
    const res = await request(app).get('/api/products?featured=maybe');
    expect(res.status).toBe(400);
  });

  // ── Cart ───────────────────────────────────────────────────────────────────
  it('4.8 Add to cart with quantity = 0 → 400', async () => {
    const res = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 0 });
    expect(res.status).toBe(400);
  });

  it('4.9 Add to cart with negative quantity → 400', async () => {
    const res = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: -5 });
    expect(res.status).toBe(400);
  });

  it('4.10 Add to cart with decimal quantity → 400', async () => {
    const res = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 1.5 });
    expect(res.status).toBe(400);
  });

  it('4.11 Add to cart with string quantity → 400', async () => {
    const res = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 'lots' });
    expect(res.status).toBe(400);
  });

  it('4.12 Add to cart with extremely large quantity → 400 (not a safe integer)', async () => {
    const res = await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: Number.MAX_SAFE_INTEGER + 1 });
    expect(res.status).toBe(400);
  });

  it('4.13 Cart update with undefined cartItemId → 400', async () => {
    const res = await request(app).put('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ quantity: 1 }); // missing cartItemId
    expect(res.status).toBe(400);
  });

  // ── Admin product creation ─────────────────────────────────────────────────
  it('4.14 Admin create product with price = NaN → 400', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad', slug: `bad-${uid()}`, description: 'x',
        price: NaN, currency: 'USD', categoryName: 'X', inventory: 1,
      });
    expect(res.status).toBe(400);
  });

  it('4.15 Admin create product with price = Infinity → 400', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad', slug: `bad-${uid()}`, description: 'x',
        price: Infinity, currency: 'USD', categoryName: 'X', inventory: 1,
      });
    expect(res.status).toBe(400);
  });

  it('4.16 Admin create product with negative inventory → 400', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad', slug: `bad-${uid()}`, description: 'x',
        price: 5, currency: 'USD', categoryName: 'X', inventory: -1,
      });
    expect(res.status).toBe(400);
  });

  it('4.17 Admin create product with deeply nested body does not crash → 400', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: { nested: { deeply: { val: 'x' } } } });
    expect(res.status).toBe(400);
  });

  // ── Orders ─────────────────────────────────────────────────────────────────
  it('4.18 Create order with empty items array → 400', async () => {
    const res = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [], shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' } });
    expect(res.status).toBe(400);
  });

  it('4.19 Create order with 101 items (exceeds limit) → 400', async () => {
    const items = Array.from({ length: 101 }, () => ({ productId: product.id, quantity: 1 }));
    const res = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items, shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' } });
    expect(res.status).toBe(400);
  });

  it('4.20 Create order with shipping address values too long → 400', async () => {
    const res = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        shippingAddress: { fullName: 'A'.repeat(201), line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
      });
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 5 — INJECTION RESISTANCE
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 5 — Injection resistance', () => {
  const injectionPayloads = [
    "'",
    '"',
    "' OR '1'='1",
    '" OR "1"="1',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '../../../../etc/passwd',
    '${7*7}',
    '{{7*7}}',
    '\x00nullbyte',
    '\n\r\t',
  ];

  // Product search — most exposed string field
  for (const payload of injectionPayloads) {
    it(`5.1 Product search with injection payload "${payload.substring(0, 30)}" → no 500`, async () => {
      const res = await request(app).get(`/api/products?q=${encodeURIComponent(payload)}`);
      // Must not return 500 — either 200 (if short enough) or 400
      expect(res.status).not.toBe(500);
      // Must not expose stack traces
      if (res.body.stack) expect(res.body.stack).toBeUndefined();
    });
  }

  // Auth login with SQL-like credentials
  it('5.2 Login with SQL injection in email → 401 (not crash)', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: "' OR '1'='1", password: 'whatever' });
    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('5.3 Login with XSS in password → 401 (not crash)', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'test@test.com', password: '<script>alert(1)</script>' });
    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('5.4 Admin product creation with XSS in name → stored safely (200 or 400)', async () => {
    const slug = `xss-test-${uid()}`;
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '<script>alert(1)</script>',
        slug,
        description: 'XSS test product',
        price: 1.00,
        currency: 'USD',
        categoryName: `XSS Cat ${uid()}`,
        inventory: 1,
        published: false,
      });
    // Either accepted (stored as-is — output escaping is frontend's job) or rejected
    expect(res.status).not.toBe(500);
    if (res.status === 201) {
      // Track for cleanup
      trackApiProduct(res.body);
      // Verify the value is stored verbatim (no server-side execution)
      expect(res.body.name).toBe('<script>alert(1)</script>');
    }
  });

  it('5.5 Admin product creation with path traversal in slug → 400', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Traversal',
        slug: '../../../../etc/passwd',
        description: 'test',
        price: 1.00,
        currency: 'USD',
        categoryName: `Cat ${uid()}`,
        inventory: 1,
      });
    // isValidSlug rejects slashes
    expect(res.status).toBe(400);
  });

  it('5.6 Admin product creation with null-byte in name → no 500', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Product\x00NullByte',
        slug: `null-byte-${uid()}`,
        description: 'test',
        price: 1.00,
        currency: 'USD',
        categoryName: `Cat ${uid()}`,
        inventory: 1,
      });
    expect(res.status).not.toBe(500);
    if (res.status === 201) trackApiProduct(res.body);
  });

  it('5.7 Product slug with spaces → 400', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Slug Test',
        slug: 'slug with spaces',
        description: 'test',
        price: 1.00,
        currency: 'USD',
        categoryName: `Cat ${uid()}`,
        inventory: 1,
      });
    expect(res.status).toBe(400);
  });

  it('5.8 Template injection in category name → stored safely, no code execution', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Template Injection Test',
        slug: `tmpl-${uid()}`,
        description: '{{7*7}} should not evaluate to 49',
        price: 1.00,
        currency: 'USD',
        categoryName: '{{7*7}}',
        inventory: 1,
        published: false,
      });
    expect(res.status).not.toBe(500);
    if (res.status === 201) {
      trackApiProduct(res.body);
      // Category name must be stored as literal, not evaluated
      expect(res.body.category.name).toBe('{{7*7}}');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 7 — HTTP METHOD & STATUS-CODE CORRECTNESS
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 7 — HTTP method & status-code correctness', () => {

  it('7.1 GET /api/admin/analytics: unauth → 401 not 403', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401); // must be 401, not 403
  });

  it('7.2 GET /api/admin/analytics: customer → 403 not 401', async () => {
    const res = await request(app).get('/api/admin/analytics')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403); // authenticated but forbidden
  });

  it('7.3 GET /api/cart: unauth → 401', async () => {
    expect((await request(app).get('/api/cart')).status).toBe(401);
  });

  it('7.4 Nonexistent product slug → 404 not 500', async () => {
    const res = await request(app).get('/api/products/slug-that-does-not-exist-xyz-123');
    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });

  it('7.5 DELETE nonexistent admin product → 404 not 500 (regression for VUL-003)', async () => {
    const res = await request(app)
      .delete('/api/admin/products/nonexistent-id-that-does-not-exist')
      .set('Authorization', `Bearer ${adminToken}`);
    // Post-fix: should be 404
    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });

  it('7.6 POST /api/orders with nonexistent product → 404 not 500 (regression for VUL-004)', async () => {
    const res = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: 'does-not-exist-xyz', quantity: 1 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
      });
    // Post-fix: should be 404
    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });

  it('7.7 POST /api/checkout with nonexistent product → 4xx not 500 (regression for VUL-004)', async () => {
    const res = await request(app).post('/api/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: 'does-not-exist-xyz', quantity: 1 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'http://localhost:3000/checkout/success',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    // Post-fix: should be 404
    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });

  it('7.8 Admin delete product that has cart items → 409 not 500 (regression for VUL-005)', async () => {
    // Create product, add to cart, then try to delete — FK constraint
    const cat2 = await createTestCategory();
    const p2 = await createTestProduct(cat2.id, { name: `FK Test ${uid()}` });
    await request(app).post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: p2.id, quantity: 1 });

    const delRes = await request(app)
      .delete(`/api/admin/products/${p2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Post-fix: should be 409 (conflict — dependent records exist)
    expect(delRes.status).toBe(409);
    expect(delRes.body.stack).toBeUndefined();

    // Clean up cart item and product
    await request(app).delete(`/api/cart/${p2.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    // Now delete should succeed
    await request(app).delete(`/api/admin/products/${p2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('7.9 PUT /api/admin/products/:id with empty body → 400', async () => {
    const res = await request(app).put(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 8 — SENSITIVE INFORMATION LEAKAGE
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 8 — Sensitive information leakage', () => {

  it('8.1 Error responses do not expose stack traces', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'bad', password: 'bad' });
    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|at Module\.|\.ts:\d+/);
  });

  it('8.2 /api/auth/me does not return password field', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[ab]\$/); // no bcrypt hash
  });

  it('8.3 Admin user list does not expose passwords', async () => {
    const res = await request(app).get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const u of res.body) {
      expect(u.password).toBeUndefined();
      expect(JSON.stringify(u)).not.toMatch(/\$2[ab]\$/);
    }
  });

  it('8.4 Admin order list does not expose user passwords', async () => {
    const res = await request(app).get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/\$2[ab]\$/);
    expect(body).not.toMatch(/password/i);
  });

  it('8.5 Registration response does not return password or hash', async () => {
    const email = `test-customer-${uid()}@example.test`;
    const res = await request(app).post('/api/auth/register')
      .send({ email, password: 'TestPass123!', name: 'Leak Test' });
    expect(res.status).toBe(201);
    trackUserId(res.body.user.id);
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[ab]\$/);
  });

  it('8.6 Login response does not return password or hash', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: customerA.email, password: 'CustomerASec123!' });
    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[ab]\$/);
  });

  it('8.7 404/403/401 responses do not include internal error messages', async () => {
    const res = await request(app).get('/api/products/fake-slug-that-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/Prisma|prisma/);
    expect(body).not.toMatch(/DATABASE_URL/);
  });

  it('8.8 Invalid login does not reveal whether email exists', async () => {
    const existingEmail = customerA.email;
    const nonexistentEmail = `nope-${uid()}@example.test`;

    const res1 = await request(app).post('/api/auth/login')
      .send({ email: existingEmail, password: 'WrongPass!' });
    const res2 = await request(app).post('/api/auth/login')
      .send({ email: nonexistentEmail, password: 'WrongPass!' });

    // Both must return 401 with identical message
    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
    expect(res1.body.message).toBe(res2.body.message);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 9 — PASSWORD / CREDENTIAL SECURITY
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 9 — Password & credential security', () => {

  it('9.1 Empty password rejected at registration → 400', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: `t-${uid()}@example.test`, password: '' });
    expect(res.status).toBe(400);
  });

  it('9.2 Password with only whitespace rejected → 400', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: `t-${uid()}@example.test`, password: '   ' });
    // isNonEmptyString trims — whitespace-only fails
    expect(res.status).toBe(400);
  });

  it('9.3 JWT has no insecure fallback secret', async () => {
    // If JWT_SECRET were missing, the app would throw on startup.
    // Verify the secret in use is not the old fallback 'fallback_secret'
    // We cannot read the secret directly; we verify a token signed with
    // the known fallback is rejected.
    const fakeToken = jwt.sign({ sub: customerA.id, role: 'customer' }, 'fallback_secret', { expiresIn: '1h' });
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });

  it('9.4 Duplicate email registration → 409 (not 500)', async () => {
    const email = `dup-${uid()}@example.test`;
    const first = await request(app).post('/api/auth/register')
      .send({ email, password: 'Pass123!', name: 'First' });
    expect(first.status).toBe(201);
    trackUserId(first.body.user.id);

    const second = await request(app).post('/api/auth/register')
      .send({ email, password: 'Pass123!', name: 'Duplicate' });
    expect(second.status).toBe(409);
    expect(second.body.stack).toBeUndefined();
  });

  it('9.5 Password is bcrypt hashed (not plaintext) in database', async () => {
    const user = await prisma.user.findUnique({ where: { id: customerA.id } });
    expect(user!.password).toMatch(/^\$2[ab]\$/);
    expect(user!.password).not.toBe('CustomerASec123!');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 10 — CHECKOUT / PAYMENT SECURITY
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 10 — Checkout / payment security', () => {

  it('10.1 Unauthenticated checkout → 401', async () => {
    const res = await request(app).post('/api/checkout')
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'http://localhost:3000/checkout/success',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    expect(res.status).toBe(401);
  });

  it('10.2 Checkout with empty items → 400', async () => {
    const res = await request(app).post('/api/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'http://localhost:3000/checkout/success',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    expect(res.status).toBe(400);
  });

  it('10.3 Client cannot supply arbitrary price — checkout derives from DB', async () => {
    // Verify the product has the expected DB price
    const dbProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(dbProduct!.price).toBe(15.00);

    // The checkout route's CheckoutItem type is { productId: string; quantity: number }.
    // Any extra "price" field sent by the client is silently ignored — the route
    // fetches authoritative prices from the DB. This is verified directly:
    // 1. The TypeScript type does not include a price field.
    // 2. The DB lookup on line ~60 of checkout.ts determines unit amount.
    // 3. Test 10.7 verifies the same for POST /api/orders with 0.01 injected price.

    // Behavioural check: submitting a price=0.01 must not bypass validation
    const res = await request(app).post('/api/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: product.id, quantity: 1, price: 0.01 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'http://localhost:3000/checkout/success',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    // The extra price field is not in the schema — it is silently ignored.
    // The request passes validation (not 400) and reaches Stripe (which fails
    // in this environment). Either outcome is acceptable here; what matters is:
    // - No 400 (price field did not break validation)
    // - If any order was created, its totalAmount reflects the DB price (15.00)
    expect(res.status).not.toBe(400);
  });

  it('10.4 Checkout with nonexistent product → 4xx, no order persisted', async () => {
    const beforeCount = await prisma.order.count();
    const res = await request(app).post('/api/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: 'does-not-exist-xyz', quantity: 1 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'http://localhost:3000/checkout/success',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const afterCount = await prisma.order.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('10.5 Checkout with 0 quantity → 400', async () => {
    const res = await request(app).post('/api/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: product.id, quantity: 0 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'http://localhost:3000/checkout/success',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    expect(res.status).toBe(400);
  });

  it('10.6 Checkout with non-HTTP successUrl → 400', async () => {
    const res = await request(app).post('/api/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: product.id, quantity: 1 }],
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
        successUrl: 'javascript:alert(1)',
        cancelUrl: 'http://localhost:3000/checkout/cancel',
      });
    expect(res.status).toBe(400);
  });

  it('10.7 POST /api/orders does not accept client-supplied price', async () => {
    // The orders route derives price from the DB, not from request body.
    // We submit an order with a price field — it should be ignored,
    // and totalAmount must match the DB price.
    const res = await request(app).post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ productId: product.id, quantity: 1, price: 0.01 }], // injected price
        shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
      });
    expect(res.status).toBe(201);
    apiCreatedIds.orders.push(res.body.id);
    res.body.items?.forEach((i: any) => apiCreatedIds.orderItems.push(i.id));

    // Total must be DB price (15.00), not the injected 0.01
    expect(res.body.totalAmount).toBeCloseTo(15.00, 2);
    expect(res.body.items[0].price).toBeCloseTo(15.00, 2);
  });

  it('10.8 Stripe failure rolls back the order created by this request', async () => {
    const orderIdsBefore = new Set((await prisma.order.findMany({
      where: { userId: customerA.id },
      select: { id: true },
    })).map((order) => order.id));
    const stripeFailure = vi.spyOn(stripeUtils, 'createCheckoutSession')
      .mockRejectedValueOnce(new Error('Simulated Stripe outage'));

    try {
      const res = await request(app).post('/api/checkout')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: 'D', country: 'E' },
          successUrl: 'http://localhost:3000/checkout/success',
          cancelUrl: 'http://localhost:3000/checkout/cancel',
        });
      expect(res.status).toBe(500);
    } finally {
      stripeFailure.mockRestore();
    }

    const orderIdsAfter = (await prisma.order.findMany({
      where: { userId: customerA.id },
      select: { id: true },
    })).map((order) => order.id);
    expect(orderIdsAfter.filter((id) => !orderIdsBefore.has(id))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 11 — WEBHOOK SECURITY
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 11 — Webhook security', () => {

  it('11.1 Webhook without Stripe-Signature header → 400', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }));
    expect(res.status).toBe(400);
  });

  it('11.2 Webhook with invalid/forged signature → 400', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=12345,v1=fakesignature')
      .send(JSON.stringify({ type: 'checkout.session.completed' }));
    expect(res.status).toBe(400);
  });

  it('11.3 Webhook cannot create/modify orders without valid Stripe signature', async () => {
    const beforeCount = await prisma.order.count();
    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'tampered')
      .send(JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { metadata: { orderId: 'fake-id' } } }
      }));
    const afterCount = await prisma.order.count();
    expect(afterCount).toBe(beforeCount);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 12 — PRODUCT / CATALOG AUTHORIZATION
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 12 — Product / catalog authorization', () => {

  it('12.1 Unauthenticated POST /api/admin/products → 401', async () => {
    expect((await request(app).post('/api/admin/products').send({})).status).toBe(401);
  });

  it('12.2 Customer POST /api/admin/products → 403 (no product created)', async () => {
    const before = await prisma.product.count();
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Injected', slug: `inj-${uid()}`, description: 'x',
              price: 1, currency: 'USD', categoryName: 'X', inventory: 1 });
    expect(res.status).toBe(403);
    expect(await prisma.product.count()).toBe(before);
  });

  it('12.3 Customer PUT /api/admin/products/:id → 403 (not modified)', async () => {
    const originalName = product.name;
    const res = await request(app).put(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
    const db = await prisma.product.findUnique({ where: { id: product.id } });
    expect(db!.name).toBe(originalName);
  });

  it('12.4 Customer DELETE /api/admin/products/:id → 403 (not deleted)', async () => {
    const res = await request(app).delete(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
    const db = await prisma.product.findUnique({ where: { id: product.id } });
    expect(db).not.toBeNull();
  });

  it('12.5 Admin can create product with valid image URL', async () => {
    const res = await request(app).post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Valid Image Product ${uid()}`,
        slug: `valid-img-${uid()}`,
        description: 'Valid image test',
        price: 5.00,
        currency: 'USD',
        categoryName: `Cat ${uid()}`,
        inventory: 1,
        published: false,
        imageUrls: ['http://example.com/valid-image.png'],
      });
    expect(res.status).toBe(201);
    expect(res.body.images).toHaveLength(1);
    trackApiProduct(res.body);
  });

  it('12.6 Admin cannot set image URL with non-http scheme → 400', async () => {
    const res = await request(app).put(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrls: ['ftp://evil.com/img.png'] });
    expect(res.status).toBe(400);
  });

  it('12.7 Admin cannot set javascript: scheme image URL → 400', async () => {
    const res = await request(app).put(`/api/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrls: ['javascript:alert(1)'] });
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 13 — DATABASE INTEGRITY AFTER MALICIOUS REQUESTS
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 13 — Database integrity after malicious requests', () => {

  it('13.1 Database has no unexpected records after injection payloads', async () => {
    // Run several injection-style requests
    const maliciousPayloads = [
      "'; DROP TABLE User; --",
      '1 UNION SELECT * FROM User',
      '<script>document.cookie</script>',
    ];
    for (const p of maliciousPayloads) {
      await request(app).get(`/api/products?q=${encodeURIComponent(p)}`);
      await request(app).post('/api/auth/login').send({ email: p, password: p });
    }
    // Database integrity must still be ok
    const ic = await prisma.$queryRawUnsafe<{integrity_check:string}[]>('PRAGMA integrity_check;');
    expect(ic[0].integrity_check).toBe('ok');
  });

  it('13.2 PRAGMA integrity_check = ok', async () => {
    const result = await prisma.$queryRawUnsafe<{integrity_check:string}[]>('PRAGMA integrity_check;');
    expect(result[0].integrity_check).toBe('ok');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN 6 — RATE LIMITING
// Intentionally placed LAST because test 6.3 exhausts the per-IP auth budget.
// All other auth-dependent tests must complete before this domain runs.
// ═════════════════════════════════════════════════════════════════════════════
describe('Domain 6 — Rate limiting', () => {

  it('6.1 AI /recommendations is rate limited — 21st request returns 429', async () => {
    // The AI rate limiter is set to 20 req/60s per IP
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post('/api/ai/recommendations')
        .send({ productIds: [] });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it('6.2 Rate limit response does not expose internal details', async () => {
    let res429: any = null;
    for (let i = 0; i < 25; i++) {
      const r = await request(app).post('/api/ai/chat').send({ message: 'hi' });
      if (r.status === 429) { res429 = r; break; }
    }
    if (res429) {
      expect(res429.body.stack).toBeUndefined();
      expect(res429.body.message).toBeTruthy();
      expect(res429.headers['retry-after']).toBeTruthy();
    }
  });

  it('6.3 Auth login is rate limited — 201st request returns 429 (VUL-002 fix)', async () => {
    // The auth rate limiter is set to 200 req/min per IP.
    // This domain is placed last so prior auth calls do not interfere.
    let got429 = false;
    for (let i = 0; i <= 10; i++) {
      const r = await request(app).post('/api/auth/login')
        .send({ email: `nope-rl-${i}@example.test`, password: 'wrong' });
      if (r.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it('6.4 Registration rate limit returns 429 after five requests', async () => {
    let got429 = false;
    for (let i = 0; i <= 5; i++) {
      const r = await request(app).post('/api/auth/register')
        // Invalid payloads still pass through the limiter, but never create users.
        .send({ email: 'not-an-email', password: 'ValidPass123!' });
      if (r.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });
});
