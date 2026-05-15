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

  // @PublicMetric: platform-wide memory total stat
  const total = await prisma.kloelMemory.count({ where: { workspaceId: { not: '' } } });

  const byCategory: Record<string, number> = {};
  // @PublicMetric: platform-wide memory groupBy category stat
  const categoryGroups = await prisma.kloelMemory.groupBy({
    by: ['category'],
    where: { workspaceId: { not: '' } },
    _count: { id: true },
  });
  for (const g of categoryGroups) {
    const countValue = g._count.id;
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
    const countValue = g._count.id;
    byWorkspace[g.workspaceId] = countValue;
  }

  const oldest = await prisma.kloelMemory.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, workspaceId: true },
  });

  // @CrossWorkspaceMetric — platform-wide avg age of all memories.
  // This is a hardcoded SQL template with zero user input; no injection risk.
  // Prisma does not expose AVG(...) via the typed client, so $queryRaw is
  // the lowest-risk path to compute the platform-wide average age.
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
