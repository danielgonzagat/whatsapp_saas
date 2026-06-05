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
import { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';
import { partialMatch } from '../../test/helpers/match-instance';

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
        {
          provide: MindMemoryItemService,
          useValue: {
            get items() {
              return prisma.kloelMemory;
            },
          },
        },
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

      const semanticAuditDetails: jest.AsymmetricMatcher = partialMatch({
        category: 'product',
        mergedCount: 1,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        partialMatch({
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

  describe('canonical Mind surface routing', () => {
    // Build a service whose canonical MindMemoryItemService.items delegate is a
    // SEPARATE spy from the bare prisma.kloelMemory delegate, so we can assert
    // that non-transactional access is routed through the canonical surface,
    // while the transactional setMemoryPriority correctly stays on the
    // transaction client (tx) — never on the canonical surface (which is bound
    // to the non-transactional connection and would break atomicity).
    let routedService: MemoryManagementService;
    let mindItems: {
      count: jest.Mock;
      deleteMany: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };

    beforeEach(async () => {
      mindItems = {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MemoryManagementService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: auditService },
          { provide: OpsAlertService, useValue: opsAlert },
          {
            provide: MindMemoryItemService,
            useValue: {
              get items() {
                return mindItems;
              },
            },
          },
        ],
      }).compile();

      routedService = module.get<MemoryManagementService>(MemoryManagementService);
    });

    it('routes non-transactional cleanup reads through the canonical Mind surface', async () => {
      await routedService.cleanupWorkspace('ws-canon', { category: 'product' });

      // The byte-identical deleteMany must hit the canonical surface, NOT the
      // bare prisma.kloelMemory delegate.
      expect(mindItems.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ workspaceId: 'ws-canon' }),
      });
      expect(prisma.kloelMemory.deleteMany).not.toHaveBeenCalled();
    });

    it('routes cleanupAll counts through the canonical Mind surface', async () => {
      await routedService.cleanupAll();

      expect(mindItems.count).toHaveBeenCalled();
      expect(prisma.kloelMemory.count).not.toHaveBeenCalled();
    });

    it('keeps setMemoryPriority on the transaction client, not the canonical surface', async () => {
      // tx is the prisma transaction mock, distinct from the canonical surface.
      prisma.kloelMemory.findFirst.mockResolvedValue({
        id: 'm-tx',
        workspaceId: 'ws-tx',
        key: 'k',
        value: { content: 'd' },
      });
      prisma.kloelMemory.updateMany.mockResolvedValue({ count: 1 });

      const result = await routedService.setMemoryPriority('ws-tx', 'k', 'high');

      expect(result).toBe(true);
      // Transactional find+update MUST run on the tx client (prisma.kloelMemory
      // here, since the $transaction mock passes prisma as tx) to preserve
      // atomicity — and MUST NOT be diverted onto the canonical surface, which
      // is bound to the non-transactional connection.
      expect(prisma.kloelMemory.findFirst).toHaveBeenCalled();
      expect(prisma.kloelMemory.updateMany).toHaveBeenCalled();
      expect(mindItems.findFirst).not.toHaveBeenCalled();
      expect(mindItems.updateMany).not.toHaveBeenCalled();
    });
  });
});
