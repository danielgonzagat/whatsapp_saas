import { PrismaService } from '../../prisma/prisma.service';

interface MemoryStats {
  total: number;
  byCategory: Record<string, number>;
  byWorkspace: Record<string, number>;
  oldestEntry: Date | null;
  averageAge: number;
}

export type { MemoryStats };

export async function computeMemoryStats(prisma: PrismaService): Promise<MemoryStats> {
  if (!(prisma as unknown as { kloelMemory?: unknown }).kloelMemory) {
    return {
      total: 0,
      byCategory: {},
      byWorkspace: {},
      oldestEntry: null,
      averageAge: 0,
    };
  }

  const total = await prisma.kloelMemory.count({
    where: { workspaceId: { not: undefined } },
  });

  const byCategory: Record<string, number> = {};
  const categoryGroups = await prisma.kloelMemory.groupBy({
    by: ['category'],
    where: { workspaceId: { not: undefined } },
    _count: { id: true },
  });
  for (const g of categoryGroups) {
    byCategory[g.category || 'uncategorized'] = g._count.id;
  }

  const byWorkspace: Record<string, number> = {};
  const workspaceGroups = await prisma.kloelMemory.groupBy({
    by: ['workspaceId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });
  for (const g of workspaceGroups) {
    byWorkspace[g.workspaceId] = g._count.id;
  }

  const oldest = await prisma.kloelMemory.findFirst({
    where: { workspaceId: { not: undefined } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, workspaceId: true },
  });

  const avgResult = await prisma.$queryRaw`
    SELECT AVG(EXTRACT(EPOCH FROM (NOW() - "createdAt"))) / 86400 as avg_days
    FROM "RAC_KloelMemory"
  `;
  const averageAge = Number.parseFloat(avgResult?.[0]?.avg_days ?? '0');

  return {
    total,
    byCategory,
    byWorkspace,
    oldestEntry: oldest?.createdAt ? new Date(String(oldest.createdAt)) : null,
    averageAge,
  };
}
