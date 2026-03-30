import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Product seed — NO DEFAULT PRODUCTS.
 *
 * The KLOEL platform does NOT ship with pre-created products.
 * Each user (seller) creates their own products via the dashboard.
 * This script is a no-op placeholder kept for backward compatibility
 * with `npm run seed:products`.
 */
async function main() {
  console.log('');
  console.log('ℹ️  Product seed: No default products to create.');
  console.log('   Users create their own products via the dashboard.');
  console.log('   This script is intentionally a no-op.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
