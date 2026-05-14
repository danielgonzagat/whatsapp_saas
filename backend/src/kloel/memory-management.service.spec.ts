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
});
