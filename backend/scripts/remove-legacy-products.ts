import { PrismaClient } from '@prisma/client';
import {
  LEGACY_PRODUCT_NAMES,
  isLegacyProductName,
} from '../src/common/products/legacy-products.util';

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log(`🔎 Procurando produtos legados: ${LEGACY_PRODUCT_NAMES.join(', ')}`);

  const products = await prisma.product.findMany({
    select: { id: true, name: true, workspaceId: true, sku: true },
  });

  const legacyProducts = products.filter((product) => isLegacyProductName(product.name));

  if (legacyProducts.length === 0) {
    console.log('ℹ️  Nenhum produto legado encontrado.');
    console.log('');
    return;
  }

  const legacyProductIds = legacyProducts.map((product) => product.id);
  const memoryKeys = legacyProducts.map((product) => `product:${product.sku || product.id}`);
  const normalizedLegacyNames = new Set(
    LEGACY_PRODUCT_NAMES.map((name) =>
      String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toLowerCase(),
    ),
  );

  const checkoutPlans = await prisma.checkoutProductPlan.findMany({
    where: { productId: { in: legacyProductIds } },
    select: { id: true },
  });
  const checkoutPlanIds = checkoutPlans.map((plan) => plan.id);

  console.log(`🧹 Removendo ${legacyProducts.length} produto(s) legado(s):`);
  for (const product of legacyProducts) {
    console.log(`   - ${product.name} (${product.id})`);
  }

  const [affiliateDeleted, checkoutProductPlansDeleted, memoryDeleted, productsDeleted] =
    await prisma.$transaction([
      prisma.affiliateProduct.deleteMany({
        where: { productId: { in: legacyProductIds } },
      }),
      prisma.checkoutProductPlan.deleteMany({
        where: { id: { in: checkoutPlanIds } },
      }),
      prisma.kloelMemory.deleteMany({
        where: {
          OR: [
            { key: { in: memoryKeys } },
            {
              AND: [{ type: 'product' }, { content: { startsWith: 'Produto: PDRN\n' } }],
            },
            {
              AND: [{ type: 'product' }, { content: { startsWith: 'Produto: GHK-Cu\n' } }],
            },
            {
              AND: [{ type: 'product' }, { content: { startsWith: 'Produto: GHK-CU\n' } }],
            },
          ],
        },
      }),
      prisma.product.deleteMany({
        where: { id: { in: legacyProductIds } },
      }),
    ]);

  console.log(`✅ AffiliateProduct removidos: ${affiliateDeleted.count}`);
  console.log(`✅ CheckoutProductPlan removidos: ${checkoutProductPlansDeleted.count}`);
  console.log(`✅ KloelMemory removidas: ${memoryDeleted.count}`);
  console.log(`✅ Product removidos: ${productsDeleted.count}`);

  const survivors = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'pdrn', mode: 'insensitive' } },
        { name: { contains: 'ghk', mode: 'insensitive' } },
        { name: { contains: 'coreamy', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, workspaceId: true },
  });

  const unexpectedSurvivors = survivors.filter((product) => {
    const normalized = String(product.name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
    return normalizedLegacyNames.has(normalized);
  });

  console.log(`🔎 Produtos com nomes relacionados ainda existentes: ${survivors.length}`);
  if (unexpectedSurvivors.length > 0) {
    console.log('⚠️  Produtos legados ainda presentes após limpeza:');
    for (const product of unexpectedSurvivors) {
      console.log(`   - ${product.name} (${product.id}) workspace=${product.workspaceId}`);
    }
  }
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
