/**
 * One-off cleanup script: removes all data created by the automated test
 * suites (accounts ending in @example.test, and products named like test
 * fixtures) so the demo database only shows real, client-facing data.
 *
 * Usage (from the backend/ folder):
 *   npx ts-node scripts/cleanup-test-data.ts
 *
 * This is destructive and cannot be undone — it's intended for a dev/demo
 * database only. Review the console output before confirming if you're
 * unsure what will be deleted; add --dry-run to only print what WOULD be
 * deleted without actually deleting anything:
 *   npx ts-node scripts/cleanup-test-data.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const testUsers = await prisma.user.findMany({
    where: { email: { contains: '@example.test' } },
    select: { id: true, email: true },
  });

  const testProducts = await prisma.product.findMany({
    where: {
      OR: [{ name: { startsWith: 'FK Test' } }, { name: { startsWith: 'Security Test Product' } }],
    },
    select: { id: true, name: true },
  });

  console.log(`Found ${testUsers.length} test user account(s) (@example.test).`);
  console.log(`Found ${testProducts.length} test product(s) (FK Test / Security Test Product).`);

  if (dryRun) {
    console.log('\n--dry-run set, not deleting anything. Users that would be removed:');
    testUsers.forEach((u) => console.log('  -', u.email));
    console.log('Products that would be removed:');
    testProducts.forEach((p) => console.log('  -', p.name));
    return;
  }

  const userIds = testUsers.map((u) => u.id);
  const productIds = testProducts.map((p) => p.id);

  if (userIds.length > 0) {
    const userOrders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const orderIds = userOrders.map((o) => o.id);

    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.wishlist.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cartItem.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (productIds.length > 0) {
    await prisma.orderItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.wishlist.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.review.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }

  console.log('\nCleanup complete.');
  console.log(`Removed ${userIds.length} test user(s) and ${productIds.length} test product(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });