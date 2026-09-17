/**
 * Phase 17C — Admin Backend Integration Tests
 *
 * Groups:
 *   A — Admin authentication (login, /me, invalid login)
 *   B — Authorization matrix (no-token / customer / admin for every endpoint)
 *   C — Analytics
 *   D — Product CRUD (create, list, edit, delete)
 *   E — Publish / Unpublish
 *   F — Feature / Unfeature  (regression for Phase 17A.5 featured=false fix)
 *   G — Image management via PUT
 *   H — Orders (read-only, admin view)
 *   I — Users  (read-only, admin view)
 *   J — Admin → Customer authorization boundary
 *   K — Stale-role security (DB role changed after JWT issued)
 *
 * Rules:
 *   - All test data is temporary and tracked via the fixture system.
 *   - trackUserId() is called for every user created through the HTTP layer.
 *   - cleanup() deletes only the IDs registered during this file's run.
 *   - No deleteMany({}) on whole tables.
 *   - No Stripe, no OpenAI, no external services called.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import {
  uid,
  createTestAdmin,
  createTestCustomer,
  createTestCategory,
  createTestProduct,
  createTestOrder,
  trackUserId,
  trackProductId,
  trackCategoryId,
  signTestToken,
  cleanup,
  prisma,
} from './helpers/fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Shared state
// ─────────────────────────────────────────────────────────────────────────────
let adminEmail: string;
let adminPassword: string;
let adminToken: string;
let adminId: string;

let customerToken: string;
let customerId: string;

let categoryId: string;
let productId: string;
let productSlug: string;

// Products created via the admin HTTP API during tests — tracked separately
// so cleanup() removes them even though they weren't created by the factory.
const apiCreatedProductIds: string[] = [];

beforeAll(async () => {
  adminPassword = 'AdminPass123!';

  // Admin created directly in DB (not via registration endpoint)
  const admin = await createTestAdmin({ password: adminPassword });
  adminEmail = admin.email;
  adminId = admin.id;
  adminToken = signTestToken(admin.id, 'admin');

  // Customer for boundary tests
  const customer = await createTestCustomer({ password: 'CustPass123!' });
  customerId = customer.id;
  customerToken = signTestToken(customer.id, 'customer');

  // Base category + product for read tests
  const cat = await createTestCategory();
  categoryId = cat.id;

  const product = await createTestProduct(categoryId, {
    name: `Admin Test Product ${uid()}`,
    featured: false,
    published: true,
  });
  productId = product.id;
  productSlug = product.slug;
});

afterAll(async () => {
  // HTTP-created products are not registered by the factory; track them so
  // cleanup() can discover and delete any ProductImage rows first.
  apiCreatedProductIds.forEach(trackProductId);
  await cleanup();
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP A — ADMIN AUTHENTICATION
// ═════════════════════════════════════════════════════════════════════════════
describe('Group A — Admin authentication', () => {
  it('A1: Admin can log in → 200, token returned, role=admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.email).toBe(adminEmail);
    // Password must never be returned
    expect(res.body.user.password).toBeUndefined();
  });

  it('A2: GET /api/auth/me with admin token → 200, role=admin, no password', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(res.body.role).toBe('admin');
    expect(res.body.password).toBeUndefined();
  });

  it('A3: Admin login with wrong password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'WrongPassword!' });
    expect(res.status).toBe(401);
  });

  it('A4: Admin login with nonexistent email → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `no-such-${uid()}@example.test`, password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('A5: Public registration cannot create an admin', async () => {
    const email = `test-customer-${uid()}@example.test`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'TestPass123!', name: 'Sneaky', role: 'admin' });

    expect(res.status).toBe(201); // registration succeeds
    expect(res.body.user.role).toBe('customer'); // but role is customer
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.role).toBe('customer');
    trackUserId(res.body.user.id); // ensure cleanup
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP B — AUTHORIZATION MATRIX
// Every admin endpoint: no-token → 401, customer token → 403, admin token → 2xx
// ═════════════════════════════════════════════════════════════════════════════
describe('Group B — Authorization matrix', () => {
  const endpoints = [
    { method: 'GET',    path: '/api/admin/analytics' },
    { method: 'GET',    path: '/api/admin/products' },
    { method: 'GET',    path: '/api/admin/orders' },
    { method: 'GET',    path: '/api/admin/users' },
  ];

  for (const ep of endpoints) {
    const m = ep.method.toLowerCase() as 'get';

    it(`B: ${ep.method} ${ep.path} — no token → 401`, async () => {
      const res = await request(app)[m](ep.path);
      expect(res.status).toBe(401);
    });

    it(`B: ${ep.method} ${ep.path} — customer token → 403`, async () => {
      const res = await request(app)[m](ep.path)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    it(`B: ${ep.method} ${ep.path} — admin token → 200`, async () => {
      const res = await request(app)[m](ep.path)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  }

  // Write endpoints
  it('B: POST /api/admin/products — no token → 401', async () => {
    const res = await request(app).post('/api/admin/products').send({});
    expect(res.status).toBe(401);
  });

  it('B: POST /api/admin/products — customer token → 403', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('B: PUT /api/admin/products/:id — no token → 401', async () => {
    const res = await request(app).put(`/api/admin/products/${productId}`).send({});
    expect(res.status).toBe(401);
  });

  it('B: PUT /api/admin/products/:id — customer token → 403', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Hijack' });
    expect(res.status).toBe(403);
  });

  it('B: DELETE /api/admin/products/:id — no token → 401', async () => {
    const res = await request(app).delete(`/api/admin/products/${productId}`);
    expect(res.status).toBe(401);
  });

  it('B: DELETE /api/admin/products/:id — customer token → 403', async () => {
    const res = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP C — ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════
describe('Group C — Analytics', () => {
  it('C1: GET /api/admin/analytics → 200, expected shape', async () => {
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.sales).toBe('number');
    expect(typeof res.body.ordersCount).toBe('number');
    expect(typeof res.body.usersCount).toBe('number');
    expect(typeof res.body.productsCount).toBe('number');
  });

  it('C2: Analytics product count matches actual DB count', async () => {
    const dbCount = await prisma.product.count();
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.productsCount).toBe(dbCount);
  });

  it('C3: Analytics user count matches actual DB count', async () => {
    const dbCount = await prisma.user.count();
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.usersCount).toBe(dbCount);
  });

  it('C4: Analytics sales reflects only paid/fulfilled orders', async () => {
    // Create a paid order via fixture
    const order = await createTestOrder(customerId, productId, { status: 'paid', price: 25.00 });

    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sales).toBeGreaterThanOrEqual(25.00);

    // Cleanup order
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('C5: Customer cannot access analytics → 403', async () => {
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('C6: Unauthenticated analytics request → 401', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP D — PRODUCT CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('Group D — Product CRUD', () => {
  let createdProductId: string;
  let createdProductSlug: string;
  const catName = `Test Category ${uid()}`;

  it('D1: POST /api/admin/products — create product → 201, persisted', async () => {
    const slug = `admin-test-${uid()}`;
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Admin Test Product ${uid()}`,
        slug,
        description: 'Phase 17C automated test product. Safe to delete.',
        price: 19.99,
        currency: 'USD',
        categoryName: catName,
        inventory: 5,
        published: true,
        featured: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.slug).toBe(slug);
    expect(res.body.price).toBe(19.99);
    expect(res.body.published).toBe(true);
    expect(res.body.category).toBeDefined();

    createdProductId = res.body.id;
    createdProductSlug = res.body.slug;
    apiCreatedProductIds.push(createdProductId);
    trackCategoryId(res.body.category.id);
  });

  it('D2: GET /api/admin/products → list includes newly created product', async () => {
    const res = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: any) => p.id === createdProductId);
    expect(found).toBeDefined();
  });

  it('D3: Admin product list returns all products (including unpublished)', async () => {
    // Create an unpublished product
    const cat2 = await createTestCategory();
    const hidden = await createTestProduct(cat2.id, { published: false });

    const adminRes = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const publicRes = await request(app).get('/api/products');

    const hiddenInAdmin = adminRes.body.find((p: any) => p.id === hidden.id);
    const hiddenInPublic = publicRes.body.find((p: any) => p.id === hidden.id);

    expect(hiddenInAdmin).toBeDefined();   // admin sees it
    expect(hiddenInPublic).toBeUndefined(); // public does not
  });

  it('D4: PUT /api/admin/products/:id — update name → persisted', async () => {
    const newName = `Updated Name ${uid()}`;
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: newName });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);

    const db = await prisma.product.findUnique({ where: { id: createdProductId } });
    expect(db!.name).toBe(newName);
  });

  it('D5: PUT /api/admin/products/:id — update price → persisted', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 49.99 });

    expect(res.status).toBe(200);
    expect(res.body.price).toBe(49.99);

    const db = await prisma.product.findUnique({ where: { id: createdProductId } });
    expect(db!.price).toBe(49.99);
  });

  it('D6: PUT /api/admin/products/:id — update inventory → persisted', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inventory: 42 });

    expect(res.status).toBe(200);
    expect(res.body.inventory).toBe(42);
  });

  it('D7: PUT /api/admin/products/:id with no fields → 400', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('D8: POST /api/admin/products — missing required fields → 400', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'No slug or price' });
    expect(res.status).toBe(400);
  });

  it('D9: POST /api/admin/products — negative price → 400', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad Product',
        slug: `bad-${uid()}`,
        description: 'test',
        price: -5,
        currency: 'USD',
        categoryName: catName,
        inventory: 1,
      });
    expect(res.status).toBe(400);
  });

  it('D10: DELETE /api/admin/products/:id — deletes product', async () => {
    // Create a disposable product to delete
    const slugToDelete = `delete-me-${uid()}`;
    const createRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Delete Me ${uid()}`,
        slug: slugToDelete,
        description: 'Created to be deleted in D10.',
        price: 1.00,
        currency: 'USD',
        categoryName: catName,
        inventory: 1,
        published: false,
      });
    expect(createRes.status).toBe(201);
    const idToDelete = createRes.body.id;

    const delRes = await request(app)
      .delete(`/api/admin/products/${idToDelete}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);

    const db = await prisma.product.findUnique({ where: { id: idToDelete } });
    expect(db).toBeNull();
  });

  it('D11: DELETE /api/admin/products/:id — nonexistent ID → 4xx', async () => {
    const res = await request(app)
      .delete('/api/admin/products/nonexistent-id-xyz')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP E — PUBLISH / UNPUBLISH
// ═════════════════════════════════════════════════════════════════════════════
describe('Group E — Publish / Unpublish', () => {
  let pubProductId: string;

  beforeAll(async () => {
    // Start unpublished
    const cat = await createTestCategory();
    const p = await createTestProduct(cat.id, { published: false });
    pubProductId = p.id;
  });

  it('E1: Unpublished product not visible via public endpoint', async () => {
    const res = await request(app).get('/api/products');
    const found = res.body.find((p: any) => p.id === pubProductId);
    expect(found).toBeUndefined();
  });

  it('E2: Admin can publish product via PUT', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${pubProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ published: true });
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(true);
    const db = await prisma.product.findUnique({ where: { id: pubProductId } });
    expect(db!.published).toBe(true);
  });

  it('E3: Published product now visible via public endpoint', async () => {
    const res = await request(app).get('/api/products');
    const found = res.body.find((p: any) => p.id === pubProductId);
    expect(found).toBeDefined();
  });

  it('E4: Admin can unpublish product via PUT', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${pubProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ published: false });
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(false);
    const db = await prisma.product.findUnique({ where: { id: pubProductId } });
    expect(db!.published).toBe(false);
  });

  it('E5: Unpublished product hidden from public again', async () => {
    const res = await request(app).get('/api/products');
    const found = res.body.find((p: any) => p.id === pubProductId);
    expect(found).toBeUndefined();
  });

  it('E6: Customer cannot change publish status → 403', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${pubProductId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ published: true });
    expect(res.status).toBe(403);
  });

  it('E7: Unauthenticated publish attempt → 401', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${pubProductId}`)
      .send({ published: true });
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP F — FEATURE / UNFEATURE
// Regression: Phase 17A.5 fixed featured=false filtering; verify via admin flow
// ═════════════════════════════════════════════════════════════════════════════
describe('Group F — Feature / Unfeature', () => {
  let featProductId: string;

  beforeAll(async () => {
    const cat = await createTestCategory();
    const p = await createTestProduct(cat.id, { featured: false, published: true });
    featProductId = p.id;
  });

  it('F1: Product starts unfeatured — not in ?featured=true list', async () => {
    const res = await request(app).get('/api/products?featured=true');
    const found = res.body.find((p: any) => p.id === featProductId);
    expect(found).toBeUndefined();
  });

  it('F2: Product is in ?featured=false list before featuring', async () => {
    const res = await request(app).get('/api/products?featured=false');
    const found = res.body.find((p: any) => p.id === featProductId);
    expect(found).toBeDefined();
  });

  it('F3: Admin can feature product via PUT', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${featProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ featured: true });
    expect(res.status).toBe(200);
    expect(res.body.featured).toBe(true);
    const db = await prisma.product.findUnique({ where: { id: featProductId } });
    expect(db!.featured).toBe(true);
  });

  it('F4: Featured product appears in ?featured=true list', async () => {
    const res = await request(app).get('/api/products?featured=true');
    const found = res.body.find((p: any) => p.id === featProductId);
    expect(found).toBeDefined();
  });

  it('F5: Featured product not in ?featured=false list', async () => {
    const res = await request(app).get('/api/products?featured=false');
    const found = res.body.find((p: any) => p.id === featProductId);
    expect(found).toBeUndefined();
  });

  it('F6: Admin can unfeature product via PUT', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${featProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ featured: false });
    expect(res.status).toBe(200);
    expect(res.body.featured).toBe(false);
    const db = await prisma.product.findUnique({ where: { id: featProductId } });
    expect(db!.featured).toBe(false);
  });

  it('F7: Unfeatured product back in ?featured=false list', async () => {
    const res = await request(app).get('/api/products?featured=false');
    const found = res.body.find((p: any) => p.id === featProductId);
    expect(found).toBeDefined();
  });

  it('F8: Customer cannot feature product → 403', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${featProductId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ featured: true });
    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP G — IMAGE MANAGEMENT (via PUT)
// ═════════════════════════════════════════════════════════════════════════════
describe('Group G — Image management via PUT', () => {
  it('G1: Admin can set image URLs on a product', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrls: ['http://example.com/image1.png'] });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.images)).toBe(true);
    expect(res.body.images.length).toBeGreaterThan(0);
    expect(res.body.images[0].url).toBe('http://example.com/image1.png');
  });

  it('G2: Image URL is persisted in database', async () => {
    const images = await prisma.productImage.findMany({ where: { productId } });
    const found = images.find((i) => i.url === 'http://example.com/image1.png');
    expect(found).toBeDefined();
  });

  it('G3: Invalid image URL (non-http) is rejected → 400', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrls: ['not-a-url'] });
    expect(res.status).toBe(400);
  });

  it('G4: Customer cannot set images → 403', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ imageUrls: ['http://example.com/hack.png'] });
    expect(res.status).toBe(403);
  });

  it('G5: Image upload via base64 imageFiles is validated (invalid file rejected)', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageFiles: [{ filename: 'bad.txt', data: 'not-base64-image' }] });
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP H — ORDERS (read-only admin view)
// ═════════════════════════════════════════════════════════════════════════════
describe('Group H — Admin orders (read-only)', () => {
  let testOrderId: string;
  let testOrderItemIds: string[] = [];

  beforeAll(async () => {
    const order = await createTestOrder(customerId, productId, {
      status: 'pending',
      price: 9.99,
      quantity: 2,
    });
    testOrderId = order.id;
    testOrderItemIds = order.items.map((i) => i.id);
  });

  afterAll(async () => {
    if (testOrderItemIds.length)
      await prisma.orderItem.deleteMany({ where: { id: { in: testOrderItemIds } } });
    if (testOrderId)
      await prisma.order.delete({ where: { id: testOrderId } });
  });

  it('H1: GET /api/admin/orders → 200, array', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('H2: Admin order list includes the test order', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    const found = res.body.find((o: any) => o.id === testOrderId);
    expect(found).toBeDefined();
    expect(found.status).toBe('pending');
    expect(found.totalAmount).toBeCloseTo(19.98, 1);
  });

  it('H3: Admin order response includes user info but NOT password', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    const order = res.body.find((o: any) => o.id === testOrderId);
    expect(order.user).toBeDefined();
    expect(order.user.email).toBeTruthy();
    expect(order.user.password).toBeUndefined();
  });

  it('H4: Admin order response includes items', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    const order = res.body.find((o: any) => o.id === testOrderId);
    expect(Array.isArray(order.items)).toBe(true);
    expect(order.items.length).toBeGreaterThan(0);
  });

  it('H5: Customer cannot access admin orders → 403', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('H6: Unauthenticated admin orders request → 401', async () => {
    const res = await request(app).get('/api/admin/orders');
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP I — USERS (read-only admin view)
// ═════════════════════════════════════════════════════════════════════════════
describe('Group I — Admin users (read-only)', () => {
  it('I1: GET /api/admin/users → 200, array', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('I2: Admin user list includes the test admin', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const found = res.body.find((u: any) => u.id === adminId);
    expect(found).toBeDefined();
    expect(found.role).toBe('admin');
  });

  it('I3: Admin user list includes the test customer', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const found = res.body.find((u: any) => u.id === customerId);
    expect(found).toBeDefined();
    expect(found.role).toBe('customer');
  });

  it('I4: Password/hash is NEVER returned in admin user list', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    for (const user of res.body) {
      expect(user.password).toBeUndefined();
    }
  });

  it('I5: Admin user response has expected fields', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const found = res.body.find((u: any) => u.id === customerId);
    expect(found.id).toBeTruthy();
    expect(found.email).toBeTruthy();
    expect(found.role).toBeTruthy();
    expect(found.createdAt).toBeTruthy();
    expect(typeof found.orderCount).toBe('number');
  });

  it('I6: Customer cannot access admin users → 403', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('I7: Unauthenticated admin users request → 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP J — ADMIN → CUSTOMER AUTHORIZATION BOUNDARY
// ═════════════════════════════════════════════════════════════════════════════
describe('Group J — Admin/Customer authorization boundary', () => {
  // Customer → Admin: already covered thoroughly in Group B and E/F/G.
  // This group focuses on the inverse and edge cases.

  it('J1: Customer cannot view admin analytics', async () => {
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.sales).toBeUndefined();
  });

  it('J2: Customer cannot create product via admin API', async () => {
    const before = await prisma.product.count();
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Injected', slug: `injected-${uid()}`,
        description: 'test', price: 1, currency: 'USD',
        categoryName: 'Injected', inventory: 1,
      });
    expect(res.status).toBe(403);
    const after = await prisma.product.count();
    expect(after).toBe(before); // no product was created
  });

  it('J3: Customer cannot delete products via admin API', async () => {
    const res = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    // Product still exists
    const db = await prisma.product.findUnique({ where: { id: productId } });
    expect(db).not.toBeNull();
  });

  it('J4: Admin can access public product listing (not restricted)', async () => {
    // Admin token should work on public endpoints too
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('J5: Admin /me returns role=admin', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP K — STALE-ROLE SECURITY
// requireAdmin re-queries the DB on every request — a JWT with role=admin
// must be denied if the DB role has been changed to customer.
// ═════════════════════════════════════════════════════════════════════════════
describe('Group K — Stale-role security', () => {
  let staleAdminId: string;
  let staleAdminToken: string;

  beforeAll(async () => {
    // Create a fresh admin directly in DB
    const staleAdmin = await createTestAdmin();
    staleAdminId = staleAdmin.id;
    staleAdminToken = signTestToken(staleAdmin.id, 'admin');
  });

  it('K1: Freshly issued admin token can access admin endpoint', async () => {
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${staleAdminToken}`);
    expect(res.status).toBe(200);
  });

  it('K2: After DB role changed to customer, same JWT is denied on admin endpoint', async () => {
    // Demote in DB (controlled test-only operation)
    await prisma.user.update({
      where: { id: staleAdminId },
      data: { role: 'customer' },
    });

    // Reuse the previously issued JWT — it still contains role=admin in its payload
    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${staleAdminToken}`);

    // requireAdmin re-queries DB → role is now customer → must be 403
    expect(res.status).toBe(403);
  });

  it('K3: After DB role changed back to admin, token works again', async () => {
    // Restore admin role
    await prisma.user.update({
      where: { id: staleAdminId },
      data: { role: 'admin' },
    });

    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${staleAdminToken}`);
    expect(res.status).toBe(200);
  });
});
