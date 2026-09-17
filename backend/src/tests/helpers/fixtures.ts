/**
 * Test fixture factory.
 *
 * Creates temporary test records in the live SQLite database and tracks
 * every created ID so they can be deleted precisely after each test.
 *
 * Rules:
 *  - All test emails use the pattern  <role>-<uid>@example.test
 *  - All test slugs/names use the pattern  test-<uid>
 *  - Cleanup deletes ONLY the records whose IDs were registered here.
 *  - Never calls deleteMany({}) on a whole table.
 *  - Call fixtures.cleanup() in afterEach / afterAll.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

// ── helpers ────────────────────────────────────────────────────────────────

/** Generates a short random identifier safe for emails and slugs. */
export function uid(): string {
  return randomBytes(6).toString('hex'); // 12 hex chars, always unique
}

// ── tracked ID registry ────────────────────────────────────────────────────

const created = {
  userIds: [] as string[],
  categoryIds: [] as string[],
  productIds: [] as string[],
  productImageIds: [] as string[],
  cartItemIds: [] as string[],
  orderIds: [] as string[],
  orderItemIds: [] as string[],
  reviewIds: [] as string[],
  wishlistIds: [] as string[],
};

function track<K extends keyof typeof created>(key: K, id: string): string {
  (created[key] as string[]).push(id);
  return id;
}

/**
 * Registers an externally-created user ID (e.g. one created via the HTTP
 * registration endpoint rather than the fixture factory) so it will be
 * included in cleanup().
 */
export function trackUserId(id: string): void {
  track('userIds', id);
}

/**
 * Registers an externally-created product ID (e.g. one created via the admin
 * HTTP API rather than the fixture factory) so cleanup() will delete it
 * and any ProductImage rows attached to it.
 */
export function trackProductId(id: string): void {
  track('productIds', id);
}

/** Registers a category created through an HTTP product API response. */
export function trackCategoryId(id: string): void {
  track('categoryIds', id);
}

// ── factories ──────────────────────────────────────────────────────────────

/**
 * Creates a customer user.
 * Email format: test-customer-<uid>@example.test
 */
export async function createTestCustomer(overrides: {
  name?: string;
  email?: string;
  password?: string;
} = {}) {
  const id = uid();
  const hashed = await bcrypt.hash(overrides.password ?? 'TestPass123!', 10);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `test-customer-${id}@example.test`,
      name: overrides.name ?? `Test Customer ${id}`,
      password: hashed,
      role: 'customer',
    },
  });
  track('userIds', user.id);
  return user;
}

/**
 * Creates an admin user.
 * Email format: test-admin-<uid>@example.test
 *
 * NOTE: Role is set directly in the DB — this is the only correct way to
 * create admin users. Registration always defaults to 'customer'.
 */
export async function createTestAdmin(overrides: {
  name?: string;
  email?: string;
  password?: string;
} = {}) {
  const id = uid();
  const hashed = await bcrypt.hash(overrides.password ?? 'AdminPass123!', 10);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `test-admin-${id}@example.test`,
      name: overrides.name ?? `Test Admin ${id}`,
      password: hashed,
      role: 'admin',
    },
  });
  track('userIds', user.id);
  return user;
}

/**
 * Creates a category.
 * Name format: Test Category <uid>
 */
export async function createTestCategory(overrides: { name?: string } = {}) {
  const id = uid();
  const category = await prisma.category.create({
    data: { name: overrides.name ?? `Test Category ${id}` },
  });
  track('categoryIds', category.id);
  return category;
}

/**
 * Creates a published product linked to a given categoryId.
 * Slug format: test-product-<uid>
 */
export async function createTestProduct(
  categoryId: string,
  overrides: {
    name?: string;
    slug?: string;
    price?: number;
    inventory?: number;
    published?: boolean;
    featured?: boolean;
  } = {}
) {
  const id = uid();
  const product = await prisma.product.create({
    data: {
      name: overrides.name ?? `Test Product ${id}`,
      slug: overrides.slug ?? `test-product-${id}`,
      description: `Automated test product ${id}. Safe to delete.`,
      price: overrides.price ?? 9.99,
      currency: 'USD',
      inventory: overrides.inventory ?? 10,
      published: overrides.published ?? true,
      featured: overrides.featured ?? false,
      categoryId,
    },
    include: { images: true, category: true },
  });
  track('productIds', product.id);
  return product;
}

/**
 * Creates a cart item for a user + product.
 */
export async function createTestCartItem(
  userId: string,
  productId: string,
  quantity = 1
) {
  const item = await prisma.cartItem.create({
    data: { userId, productId, quantity },
  });
  track('cartItemIds', item.id);
  return item;
}

/**
 * Creates an order with one line item.
 */
export async function createTestOrder(
  userId: string,
  productId: string,
  overrides: { status?: string; price?: number; quantity?: number } = {}
) {
  const price = overrides.price ?? 9.99;
  const quantity = overrides.quantity ?? 1;
  const order = await prisma.order.create({
    data: {
      userId,
      status: overrides.status ?? 'pending',
      totalAmount: price * quantity,
      shippingAddress: JSON.stringify({
        fullName: 'Test User',
        line1: '1 Test St',
        city: 'Testville',
        postalCode: '00000',
        country: 'Test Country',
      }),
      items: {
        create: [{ productId, quantity, price }],
      },
    },
    include: { items: true },
  });
  track('orderIds', order.id);
  order.items.forEach((i) => track('orderItemIds', i.id));
  return order;
}

// ── cleanup ────────────────────────────────────────────────────────────────

/**
 * Deletes all records registered during this fixture session.
 *
 * Deletion order respects FK constraints:
 *   wishlists → reviews → order items → orders
 *   → cart items → product images → products → categories → users
 *
 * Call in afterEach or afterAll.
 */
export async function cleanup() {
  // Dependents first
  if (created.wishlistIds.length)
    await prisma.wishlist.deleteMany({ where: { id: { in: created.wishlistIds } } });

  if (created.reviewIds.length)
    await prisma.review.deleteMany({ where: { id: { in: created.reviewIds } } });

  if (created.orderItemIds.length)
    await prisma.orderItem.deleteMany({ where: { id: { in: created.orderItemIds } } });

  if (created.orderIds.length)
    await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });

  if (created.cartItemIds.length)
    await prisma.cartItem.deleteMany({ where: { id: { in: created.cartItemIds } } });

  if (created.productImageIds.length)
    await prisma.productImage.deleteMany({ where: { id: { in: created.productImageIds } } });

  // Discover ProductImage rows attached to tracked products, including those
  // created indirectly via admin HTTP PUT/POST (not listed in productImageIds).
  if (created.productIds.length)
    await prisma.productImage.deleteMany({ where: { productId: { in: created.productIds } } });

  if (created.productIds.length)
    await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });

  if (created.categoryIds.length)
    await prisma.category.deleteMany({ where: { id: { in: created.categoryIds } } });

  if (created.userIds.length)
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });

  // Reset tracking arrays
  (Object.keys(created) as Array<keyof typeof created>).forEach(
    (k) => ((created[k] as string[]) = [])
  );
}

/**
 * Generates a signed JWT for a user without going through the HTTP layer.
 * Useful for seeding auth headers in Supertest requests.
 */
export function signTestToken(userId: string, role: string): string {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set — check test setup.ts');
  return jwt.sign({ sub: userId, role }, secret, { expiresIn: '1h' });
}

export { prisma };
