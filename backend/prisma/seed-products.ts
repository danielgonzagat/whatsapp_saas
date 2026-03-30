import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    name: 'Serum Regenerador Premium',
    sku: 'SRP-001',
    description:
      'Serum de regeneracao celular avancada. Bioestimulador que promove renovacao da pele, reducao de rugas e melhora da textura. Uso topico.',
    price: 297.0,
    category: 'Skincare',
    format: 'PHYSICAL',
    active: true,
    status: 'APPROVED',
    tags: ['bioestimulador', 'skincare', 'anti-aging', 'regeneracao'],
  },
  {
    name: 'Peptideo Bioativo Plus',
    sku: 'PBP-001',
    description:
      'Peptideo bioativo de alta performance. Bioestimulador que estimula producao de colageno, melhora elasticidade da pele e acelera cicatrizacao. Uso topico.',
    price: 347.0,
    category: 'Skincare',
    format: 'PHYSICAL',
    active: true,
    status: 'APPROVED',
    tags: ['peptideo', 'colageno', 'skincare', 'anti-aging', 'cicatrizacao'],
  },
];

async function main() {
  console.log('🌱 Seeding products (Skincare catalog)...\n');

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
  });

  if (workspaces.length === 0) {
    console.log('⚠️  No workspaces found. Create a workspace first.');
    return;
  }

  console.log(`Found ${workspaces.length} workspace(s).\n`);

  for (const workspace of workspaces) {
    console.log(`--- Workspace: ${workspace.name} (${workspace.id}) ---`);

    for (const product of PRODUCTS) {
      // Upsert Product using the unique constraint [workspaceId, sku]
      const upserted = await prisma.product.upsert({
        where: {
          workspaceId_sku: {
            workspaceId: workspace.id,
            sku: product.sku,
          },
        },
        update: {
          name: product.name,
          description: product.description,
          price: product.price,
          category: product.category,
          format: product.format,
          active: product.active,
          status: product.status,
          tags: product.tags,
        },
        create: {
          workspaceId: workspace.id,
          name: product.name,
          sku: product.sku,
          description: product.description,
          price: product.price,
          category: product.category,
          format: product.format,
          active: product.active,
          status: product.status,
          tags: product.tags,
        },
      });

      console.log(`  ✅ Product "${upserted.name}" upserted (id: ${upserted.id})`);

      // Upsert KloelMemory so the AI agent has product info in context
      const memoryKey = `product:${product.sku}`;
      const memoryValue = {
        productId: upserted.id,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: 'BRL',
        category: product.category,
        tags: product.tags,
      };
      const memoryContent = [
        `Produto: ${product.name}`,
        `Preco: R$ ${product.price.toFixed(2)}`,
        `Categoria: ${product.category}`,
        `Descricao: ${product.description}`,
        `Tags: ${product.tags.join(', ')}`,
      ].join('\n');

      await prisma.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId: workspace.id,
            key: memoryKey,
          },
        },
        update: {
          value: memoryValue,
          content: memoryContent,
          category: 'catalog',
          type: 'product',
          metadata: { sku: product.sku, format: product.format },
        },
        create: {
          workspaceId: workspace.id,
          key: memoryKey,
          value: memoryValue,
          content: memoryContent,
          category: 'catalog',
          type: 'product',
          metadata: { sku: product.sku, format: product.format },
        },
      });

      console.log(`  ✅ KloelMemory "${memoryKey}" upserted`);
    }

    console.log('');
  }

  console.log('🎉 Product seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
