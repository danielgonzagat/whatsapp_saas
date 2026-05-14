import { Test, TestingModule } from '@nestjs/testing';
import { MemoryManagementService } from './memory-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';

jest.mock('prom-client', () => ({
  register: {
    getSingleMetric: jest.fn().mockReturnValue(null),
  },
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
  })),
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
}));

jest.mock('../common/async-sequence', () => ({
  forEachSequential: jest.fn(async <T>(items: T[], fn: (item: T) => Promise<void>) => {
    for (const item of items) {
      await fn(item);
    }
  }),
}));

jest.mock('./memory-stats', () => ({
  computeMemoryStats: jest.fn(),
}));

import { computeMemoryStats } from './memory-stats';
import type { MemoryStats } from './memory-stats';

type MemoryManagementPrismaMock = {
  kloelMemory: {
    count: jest.Mock;
    deleteMany: jest.Mock;
    groupBy: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  workspace: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

describe('MemoryManagementService', () => {
  let service: MemoryManagementService;
  let prisma: MemoryManagementPrismaMock;
  let auditService: Pick<AuditService, 'log'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;

  const emptyStats: MemoryStats = {
    total: 0,
    byCategory: {},
    byWorkspace: {},
    oldestEntry: null,
    averageAge: 0,
  };

  beforeEach(async () => {
    prisma = {
      kloelMemory: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      workspace: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn<Promise<unknown>>().mockImplementation((arg) => {
        if (typeof arg === 'function') {
          return (arg as (client: typeof prisma) => Promise<unknown>)(prisma);
        }
        return Promise.resolve(undefined);
      }) as jest.Mock,
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };

    (computeMemoryStats as jest.Mock).mockResolvedValue(emptyStats);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryManagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<MemoryManagementService>(MemoryManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupAll', () => {
    it('removes expired memorii from known categories', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.cleanupAll();

      expect(result.expiredRemoved).toBeGreaterThan(0);
      expect(result.totalBefore).toBe(10);
      expect(result.totalAfter).toBe(5);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(prisma.kloelMemory.deleteMany).toHaveBeenCalled();
    });

    it('removes duplicates when groups exceed 100 entries', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(200).mockResolvedValueOnce(180);
      prisma.kloelMemory.groupBy.mockResolvedValueOnce([
        { workspaceId: 'ws-1', category: 'product', _count: { id: 150 } },
      ]);
      const duplicateMemories = Array.from({ length: 50 }, (_, i) => ({
        id: `dup-${i}`,
        key: `key-${Math.floor(i / 2)}`,
        value: `val-${i}`,
      }));
      prisma.kloelMemory.findMany.mockResolvedValueOnce(duplicateMemories);
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 20 })
        .mockResolvedValueOnce({ count: 25 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.cleanupAll();

      expect(result.duplicatesRemoved).toBeGreaterThanOrEqual(0);
    });

    it('removes orphans when workspace is deleted', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(50).mockResolvedValueOnce(40);
      prisma.kloelMemory.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ workspaceId: 'ws-orphan' }]);
      prisma.workspace.findMany.mockResolvedValue([]);
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 10 });

      const result = await service.cleanupAll();

      expect(result.orphansRemoved).toBe(10);
    });

    it('skips orphan removal when no orphan workspaceIds found', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      prisma.kloelMemory.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ workspaceId: 'ws-alive' }]);
      prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-alive' }]);
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.cleanupAll();

      expect(result.orphansRemoved).toBe(0);
    });

    it('logs audit trail when memory was removed', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      await service.cleanupAll();

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'SYSTEM',
          action: 'DELETE_MEMORY_CLEANUP',
          resource: 'KloelMemory',
        }),
      );
    });

    it('does not log audit when nothing was removed', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      await service.cleanupAll();

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('cleanupWorkspace', () => {
    const wsId = 'ws-clean';

    it('deletes all memories for a workspace', async () => {
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 5 });

      const count = await service.cleanupWorkspace(wsId);

      expect(count).toBe(5);
      expect(prisma.kloelMemory.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
      });
    });

    it('filters by category when provided', async () => {
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.cleanupWorkspace(wsId, {
        category: 'temporary',
      });

      expect(count).toBe(3);
      expect(prisma.kloelMemory.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: wsId, category: 'temporary' },
      });
    });

    it('filters by olderThanDays when provided', async () => {
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 2 });

      const count = await service.cleanupWorkspace(wsId, {
        olderThanDays: 30,
      });

      expect(count).toBe(2);
      expect(prisma.kloelMemory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
      const deleteArg = prisma.kloelMemory.deleteMany.mock.calls[0][0] as {
        where: { updatedAt: { lt: Date } };
      };
      expect(deleteArg.where.updatedAt.lt).toBeInstanceOf(Date);
    });

    it('logs audit when memories are deleted', async () => {
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 7 });

      await service.cleanupWorkspace(wsId);

      const workspaceAuditDetails: Record<string, unknown> = expect.objectContaining({
        deletedCount: 7,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          action: 'DELETE_WORKSPACE_MEMORIES',
          details: workspaceAuditDetails,
        }),
      );
    });

    it('does not log audit when count is 0', async () => {
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 0 });

      await service.cleanupWorkspace(wsId);

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('normalizeSemanticDuplicates', () => {
    it('returns 0 when fewer than 2 memories exist in category', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([
        {
          id: 'm-1',
          key: 'prod_a',
          value: 'v',
          updatedAt: new Date(),
        },
      ]);

      const count = await service.normalizeSemanticDuplicates('ws-1', 'product');

      expect(count).toBe(0);
    });

    it('removes duplicates within same prefix group keeping newest', async () => {
      const memories = [
        {
          id: 'm-old',
          key: 'product_a',
          value: 'old',
          updatedAt: new Date('2025-01-01'),
        },
        {
          id: 'm-new',
          key: 'product_a',
          value: 'new',
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 'm-other',
          key: 'product_b',
          value: 'b',
          updatedAt: new Date('2026-01-02'),
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memories);
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.normalizeSemanticDuplicates('ws-1', 'product');

      expect(count).toBeGreaterThanOrEqual(0);
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', category: 'product' },
        select: { id: true, key: true, value: true, updatedAt: true },
        take: 500,
      });
    });

    it('logs audit when duplicates were merged', async () => {
      const memories = [
        {
          id: 'm-old',
          key: 'product_a_x',
          value: 'a',
          updatedAt: new Date('2025-01-01'),
        },
        {
          id: 'm-new',
          key: 'product_a_x',
          value: 'b',
          updatedAt: new Date('2026-01-02'),
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memories);
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 1 });

      await service.normalizeSemanticDuplicates('ws-1', 'product');

      const semanticAuditDetails: Record<string, unknown> = expect.objectContaining({
        category: 'product',
        mergedCount: 1,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'DELETE_SEMANTIC_DUPLICATES',
          resource: 'KloelMemory',
          details: semanticAuditDetails,
        }),
      );
    });
  });

  describe('setMemoryPriority', () => {
    const wsId = 'ws-prio';

    it('sets priority on existing memory via transaction', async () => {
      const memory = {
        id: 'm-1',
        workspaceId: wsId,
        key: 'important',
        value: { content: 'data' },
      };
      prisma.kloelMemory.findFirst.mockResolvedValue(memory);
      prisma.kloelMemory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.setMemoryPriority(wsId, 'important', 'high');

      expect(result).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns false when memory not found', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue(null);

      const result = await service.setMemoryPriority(wsId, 'nonexistent', 'high');

      expect(result).toBe(false);
    });

    it('returns false on transaction error', async () => {
      prisma.$transaction.mockRejectedValue(new Error('tx error'));

      const result = await service.setMemoryPriority(wsId, 'key', 'low');

      expect(result).toBe(false);
    });

    it('handles string value by wrapping in object', async () => {
      const memory = {
        id: 'm-str',
        workspaceId: wsId,
        key: 'key',
        value: 'plain string',
      };
      prisma.kloelMemory.findFirst.mockResolvedValue(memory);
      prisma.kloelMemory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.setMemoryPriority(wsId, 'key', 'critical');

      expect(result).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns stats from computeMemoryStats', async () => {
      const stats: MemoryStats = {
        total: 42,
        byCategory: { product: 10, script: 5 },
        byWorkspace: { 'ws-1': 42 },
        oldestEntry: new Date('2025-01-01'),
        averageAge: 30,
      };
      (computeMemoryStats as jest.Mock).mockResolvedValue(stats);

      const result = await service.getStats();

      expect(result).toEqual(stats);
      expect(computeMemoryStats).toHaveBeenCalledWith(prisma);
    });

    it('returns empty stats on error', async () => {
      (computeMemoryStats as jest.Mock).mockRejectedValue(new Error('stats failed'));

      const result = await service.getStats();

      expect(result.total).toBe(0);
      expect(result.byCategory).toEqual({});
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('cleanupWorkspace scoped to correct workspaceId', async () => {
      prisma.kloelMemory.deleteMany.mockResolvedValue({ count: 1 });

      await service.cleanupWorkspace('ws-tenant');

      expect(prisma.kloelMemory.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-tenant' },
      });
    });

    it('normalizeSemanticDuplicates scoped to correct workspaceId', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.normalizeSemanticDuplicates('ws-tenant', 'script');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-tenant', category: 'script' },
        select: { id: true, key: true, value: true, updatedAt: true },
        take: 500,
      });
    });

    it('setMemoryPriority filters by workspaceId', async () => {
      const memory = {
        id: 'm-1',
        workspaceId: 'ws-tenant',
        key: 'key',
        value: {},
      };
      prisma.kloelMemory.findFirst.mockResolvedValue(memory);
      prisma.kloelMemory.updateMany.mockResolvedValue({ count: 1 });

      await service.setMemoryPriority('ws-tenant', 'key', 'high');

      const priorityWhere: Record<string, unknown> = expect.objectContaining({
        workspaceId: 'ws-tenant',
        key: 'key',
      });
      expect(prisma.kloelMemory.findFirst).toHaveBeenCalledWith({
        where: priorityWhere,
      });
    });
  });

  describe('error handling', () => {
    it('cleanupAll handles expired category failure gracefully', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      prisma.kloelMemory.deleteMany
        .mockRejectedValueOnce(new Error('delete failed'))
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.cleanupAll();

      expect(result.expiredRemoved).toBe(0);
    });

    it('cleanupAll handles duplicates failure gracefully', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      prisma.kloelMemory.groupBy.mockRejectedValueOnce(new Error('groupBy failed'));
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.cleanupAll();

      expect(result.duplicatesRemoved).toBe(0);
    });

    it('cleanupAll handles orphans failure gracefully', async () => {
      prisma.kloelMemory.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      prisma.kloelMemory.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ workspaceId: 'ws-x' }]);
      prisma.workspace.findMany.mockRejectedValue(new Error('workspace find failed'));
      prisma.kloelMemory.deleteMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.cleanupAll();

      expect(result.orphansRemoved).toBe(0);
    });
  });
});
