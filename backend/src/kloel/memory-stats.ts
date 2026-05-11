import { PrismaService } from '../prisma/prisma.service';

interface MemoryStats {
  total: number;
  byCategory: Record<string, number>;
  byWorkspace: Record<string, number>;
  oldestEntry: Date | null;
  averageAge: number;
}

export type { MemoryStats };

function hasKloelMemoryDelegate(prisma: PrismaService): boolean {
  return 'kloelMemory' in prisma;
}

export async function computeMemoryStats(prisma: PrismaService): Promise<MemoryStats> {
  if (!hasKloelMemoryDelegate(prisma)) {
    return {
      total: 0,
      byCategory: {},
      byWorkspace: {},
      oldestEntry: null,
      averageAge: 0,
    };
  }

  const total = await prisma.kloelMemory.count();

  const byCategory: Record<string, number> = {};
  const categoryGroups = await prisma.kloelMemory.groupBy({
    by: ['category'],
    _count: { id: true },
  });
  for (const g of categoryGroups) {
    const countValue = (g._count as unknown as { id: number }).id;
    byCategory[g.category || 'uncategorized'] = countValue;
  }

  const byWorkspace: Record<string, number> = {};
  const workspaceGroups = await prisma.kloelMemory.groupBy({
    by: ['workspaceId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });
  for (const g of workspaceGroups) {
    const countValue = (g._count as unknown as { id: number }).id;
    byWorkspace[g.workspaceId] = countValue;
  }

  const oldest = await prisma.kloelMemory.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, workspaceId: true },
  });

  const avgResult = await prisma.$queryRaw<{ avg_days: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (NOW() - "createdAt"))) / 86400 as avg_days
    FROM "RAC_KloelMemory"
  `;
  const averageAge = Number.parseFloat(String(avgResult?.[0]?.avg_days ?? '0'));

  return {
    total,
    byCategory,
    byWorkspace,
    oldestEntry: oldest?.createdAt ? new Date(String(oldest.createdAt)) : null,
    averageAge,
  };
}
