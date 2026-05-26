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
      }),
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
