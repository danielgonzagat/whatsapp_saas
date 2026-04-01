import { PrismaClient } from '@prisma/client';
import {
  LEGACY_PRODUCT_NAMES,
  isLegacyProductName,
} from '../src/common/products/legacy-products.util';

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log(
    `🔎 Procurando produtos legados: ${LEGACY_PRODUCT_NAMES.join(', ')}`,
  );

  const products = await prisma.product.findMany({
    select: { id: true, name: true, workspaceId: true, sku: true },
  });

  const legacyProducts = products.filter((product) =>
    isLegacyProductName(product.name),
  );

  if (legacyProducts.length === 0) {
    console.log('ℹ️  Nenhum produto legado encontrado.');
    console.log('');
    return;
  }

  const legacyProductIds = legacyProducts.map((product) => product.id);
  const memoryKeys = legacyProducts.map(
    (product) => `product:${product.sku || product.id}`,
  );

  console.log(`🧹 Removendo ${legacyProducts.length} produto(s) legado(s):`);
  for (const product of legacyProducts) {
    console.log(`   - ${product.name} (${product.id})`);
  }

  const [affiliateDeleted, memoryDeleted, productsDeleted] = await prisma.$transaction([
    prisma.affiliateProduct.deleteMany({
      where: { productId: { in: legacyProductIds } },
    }),
    prisma.kloelMemory.deleteMany({
      where: {
        OR: [
          { key: { in: memoryKeys } },
          ...LEGACY_PRODUCT_NAMES.map((name) => ({
            content: { contains: name, mode: 'insensitive' as const },
          })),
        ],
      },
    }),
    prisma.product.deleteMany({
      where: { id: { in: legacyProductIds } },
    }),
  ]);

  console.log(`✅ AffiliateProduct removidos: ${affiliateDeleted.count}`);
  console.log(`✅ KloelMemory removidas: ${memoryDeleted.count}`);
  console.log(`✅ Product removidos: ${productsDeleted.count}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Erro ao remover produtos legados:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
