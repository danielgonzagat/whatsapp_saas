/**
 * Seed script: Create AffiliateProduct records for all active products.
 *
 * Usage: npx ts-node scripts/seed-affiliate-products.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Searching for active products...\n');

  const products = await prisma.product.findMany({
    where: {
      active: true,
    },
  });

  if (products.length === 0) {
    console.log('⚠️  Nenhum produto ativo encontrado no banco.');
    console.log('   Crie os produtos primeiro via dashboard ou API.\n');
    return;
  }

  console.log(`✅ Encontrados ${products.length} produto(s):\n`);

  for (const product of products) {
    console.log(`   → ${product.name} (id: ${product.id})`);

    const existing = await prisma.affiliateProduct.findUnique({
      where: { productId: product.id },
    });

    if (existing) {
      console.log(`     ↳ AffiliateProduct já existe (id: ${existing.id}). Pulando.\n`);
      continue;
    }

    const affiliateProduct = await prisma.affiliateProduct.create({
      data: {
        productId: product.id,
        listed: true,
        category: product.category || 'Skincare',
        commissionPct: 30,
        commissionType: 'PERCENTAGE',
        cookieDays: 30,
        approvalMode: 'AUTO',
        temperature: 80,
        thumbnailUrl: product.imageUrl,
      },
    });

    console.log(`     ↳ AffiliateProduct criado (id: ${affiliateProduct.id})\n`);
  }

  console.log('✅ Seed concluído.\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
