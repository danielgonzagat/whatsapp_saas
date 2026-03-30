import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 BOOTSTRAP PRODUCTION — Kloel Platform\n');

  // 1. Create workspace
  console.log('1. Creating workspace...');
  const workspace = await prisma.workspace.upsert({
    where: { id: 'ws_lavinci_prod' },
    update: {},
    create: {
      id: 'ws_lavinci_prod',
      name: 'LaVinci',
    },
  });
  console.log(`   ✅ Workspace: ${workspace.name} (${workspace.id})`);

  // 2. Create admin agent
  console.log('2. Creating admin agent...');
  const passwordHash = await bcrypt.hash('Kloel@2026!', 10);
  const agent = await prisma.agent.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email: 'danielgonzagatj@gmail.com' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'Daniel Gonzaga',
      email: 'danielgonzagatj@gmail.com',
      password: passwordHash,
      role: 'OWNER',
      displayRole: 'OWNER',
      kycStatus: 'approved',
    },
  });
  console.log(`   ✅ Agent: ${agent.name} (${agent.email}) role=${agent.role}`);

  // 3. Seed products (Skincare catalog)
  console.log('3. Seeding products...');
  const products = [
    {
      name: 'Serum Regenerador Premium',
      sku: 'SRP-001',
      description: 'Serum de regeneracao celular avancada.',
      price: 297.0,
      category: 'Skincare',
      format: 'PHYSICAL',
      active: true,
      status: 'APPROVED',
      tags: ['bioestimulador', 'skincare', 'anti-aging'],
    },
    {
      name: 'Peptideo Bioativo Plus',
      sku: 'PBP-001',
      description: 'Peptideo bioativo de alta performance. Bioestimulador de colageno.',
      price: 347.0,
      category: 'Skincare',
      format: 'PHYSICAL',
      active: true,
      status: 'APPROVED',
      tags: ['peptideo', 'colageno', 'skincare'],
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { workspaceId_sku: { workspaceId: workspace.id, sku: p.sku } },
      update: { name: p.name, description: p.description, price: p.price },
      create: { workspaceId: workspace.id, ...p },
    });
    console.log(`   ✅ Product: ${product.name} (${product.id})`);

    // Create KloelMemory for AI context
    const memoryKey = `product:${p.sku}`;
    const memoryContent = `Produto: ${p.name}\nPreco: R$ ${p.price.toFixed(2)}\nCategoria: ${p.category}\nDescricao: ${p.description}`;
    await prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: memoryKey } },
      update: { content: memoryContent },
      create: {
        workspaceId: workspace.id,
        key: memoryKey,
        value: { productId: product.id, name: p.name, price: p.price },
        content: memoryContent,
        category: 'catalog',
        type: 'product',
        metadata: { sku: p.sku, format: p.format },
      },
    });
    console.log(`   ✅ KloelMemory: ${memoryKey}`);
  }

  // 4. Create subscription
  console.log('4. Creating subscription...');
  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspace: { connect: { id: workspace.id } },
      plan: 'PRO',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`   ✅ Subscription: PRO`);

  console.log('\n🎉 Bootstrap complete!\n');
  console.log('Summary:');
  console.log(`  Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`  Admin: ${agent.email}`);
  console.log(`  Products: ${products.length}`);
  console.log(`  Temp password: Kloel@2026!`);
  console.log(`\n⚠️  TROQUE A SENHA DO POSTGRES NO RAILWAY DASHBOARD!`);
}

main()
  .catch((e) => {
    console.error('❌ Bootstrap failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
