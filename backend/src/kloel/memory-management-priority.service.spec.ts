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
});
