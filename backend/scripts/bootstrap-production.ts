import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 BOOTSTRAP PRODUCTION — Kloel Platform\n');
  const workspaceId = process.env.BOOTSTRAP_WORKSPACE_ID || 'ws_kloel_prod';
  const workspaceName = process.env.BOOTSTRAP_WORKSPACE_NAME || 'Kloel Production';
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@kloel.com';
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'Kloel Admin';
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Kloel@2026!';

  // 1. Create workspace
  console.log('1. Creating workspace...');
  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      name: workspaceName,
    },
  });
  console.log(`   ✅ Workspace: ${workspace.name} (${workspace.id})`);

  // 2. Create admin agent
  console.log('2. Creating admin agent...');
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const agent = await prisma.agent.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email: adminEmail } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: adminName,
      email: adminEmail,
      password: passwordHash,
      role: 'OWNER',
      displayRole: 'OWNER',
      kycStatus: 'approved',
    },
  });
  console.log(`   ✅ Agent: ${agent.name} (${agent.email}) role=${agent.role}`);

  // 3. Products — Users create their own products via dashboard. No defaults.
  console.log('3. Products: skipped (users create their own via dashboard)');

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
  console.log(`  Products: users create their own via dashboard`);
  console.log(`  Temp password: ${adminPassword}`);
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
