import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default workspace if none exists
  const workspaceCount = await prisma.workspace.count();
  if (workspaceCount === 0) {
    console.log('No workspaces found. Skipping seed (users create workspaces on signup).');
  } else {
    console.log(`Found ${workspaceCount} workspace(s). No seed data needed.`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
