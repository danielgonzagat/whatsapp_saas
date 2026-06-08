import { computeMemoryStats } from './memory-stats';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Focused unit tests for the canonicalized `computeMemoryStats` helper.
 *
 * Brain → Mind unification: the helper's `kloelMemory` delegate accesses
 * (`count`, `groupBy` ×2, `findFirst`) must route through the canonical
 * surface supplied by `MindMemoryItemService.items` when the caller provides
 * it, while staying byte-identical (same queries / args / ordering) and while
 * `$queryRaw` + the delegate-presence guard remain on raw `prisma`.
 */
describe('computeMemoryStats — canonical Mind surface routing', () => {
  function buildDelegate() {
    return {
      count: jest.fn().mockResolvedValue(7),
      groupBy: jest
        .fn()
        // first call → byCategory groups, second call → byWorkspace groups
        .mockResolvedValueOnce([{ category: 'general', _count: { id: 4 } }])
        .mockResolvedValueOnce([{ workspaceId: 'ws-1', _count: { id: 5 } }]),
      findFirst: jest.fn().mockResolvedValue({
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        workspaceId: 'ws-1',
      }),
    };
  }

  function buildPrisma(rawDelegate: ReturnType<typeof buildDelegate>) {
    const prisma = {
      kloelMemory: rawDelegate,
      $queryRaw: jest.fn().mockResolvedValue([{ avg_days: 3.5 }]),
    };
    return prisma as unknown as PrismaService;
  }

  it('routes delegate reads through the canonical surface when provided, never through raw prisma.kloelMemory', async () => {
    const rawDelegate = buildDelegate();
    const canonicalDelegate = buildDelegate();
    const prisma = buildPrisma(rawDelegate);

    const stats = await computeMemoryStats(
      prisma,
      canonicalDelegate as unknown as PrismaService['kloelMemory'],
    );

    // Canonical surface received EVERY delegate read.
    expect(canonicalDelegate.count).toHaveBeenCalledTimes(1);
    expect(canonicalDelegate.count).toHaveBeenCalledWith({ where: { workspaceId: { not: '' } } });
    expect(canonicalDelegate.groupBy).toHaveBeenCalledTimes(2);
    expect(canonicalDelegate.findFirst).toHaveBeenCalledTimes(1);

    // Raw prisma.kloelMemory delegate was BYPASSED entirely for reads.
    expect(rawDelegate.count).not.toHaveBeenCalled();
    expect(rawDelegate.groupBy).not.toHaveBeenCalled();
    expect(rawDelegate.findFirst).not.toHaveBeenCalled();

    // $queryRaw stays on raw prisma (delegate does not expose it) — unchanged.
    expect((prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw).toHaveBeenCalledTimes(1);

    // Behaviour is byte-identical: same shaped result.
    expect(stats.total).toBe(7);
    expect(stats.byCategory).toEqual({ general: 4 });
    expect(stats.byWorkspace).toEqual({ 'ws-1': 5 });
    expect(stats.averageAge).toBe(3.5);
    expect(stats.oldestEntry).toEqual(new Date('2024-01-01T00:00:00.000Z'));
  });

  it('falls back to prisma.kloelMemory (byte-identical) when no canonical delegate is passed', async () => {
    const rawDelegate = buildDelegate();
    const prisma = buildPrisma(rawDelegate);

    const stats = await computeMemoryStats(prisma);

    // Default param resolves to prisma.kloelMemory — legacy callers unchanged.
    expect(rawDelegate.count).toHaveBeenCalledWith({ where: { workspaceId: { not: '' } } });
    expect(rawDelegate.groupBy).toHaveBeenCalledTimes(2);
    expect(rawDelegate.findFirst).toHaveBeenCalledTimes(1);
    expect(stats.total).toBe(7);
    expect(stats.byWorkspace).toEqual({ 'ws-1': 5 });
  });

  it('returns the empty stats shape when the kloelMemory delegate is absent', async () => {
    const prisma = { $queryRaw: jest.fn() } as unknown as PrismaService;

    const stats = await computeMemoryStats(prisma);

    expect(stats).toEqual({
      total: 0,
      byCategory: {},
      byWorkspace: {},
      oldestEntry: null,
      averageAge: 0,
    });
    expect((prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw).not.toHaveBeenCalled();
  });
});
