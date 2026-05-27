import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindBeliefService } from '../inference/mind-belief.service';
import { MindPolicyService } from '../policy/mind-policy.service';
import { MindVerbalizerService } from '../../mind-verbalizer.service';
import { MindReportService } from './mind-report.service';
import { MindBanditService } from '../policy/mind-bandit.service';
import { MindObservabilityService } from './mind-observability.service';

type WorkspaceWhereArgs = {
  where: {
    workspaceId: string;
    occurredAt?: { gte: Date };
  };
};

type SurpriseQueryArgs = WorkspaceWhereArgs & {
  orderBy: { surprise: string };
  take: number;
};

function firstMockArg<T>(mock: jest.Mock, callIndex = 0): T {
  const call = mock.mock.calls[callIndex] as readonly unknown[] | undefined;
  return call?.[0] as T;
}

describe('MindObservabilityService', () => {
  let service: MindObservabilityService;
  let prisma: {
    mindWorkspaceState: { findUnique: jest.Mock };
    mindBelief: { findMany: jest.Mock };
    mindPrediction: { findMany: jest.Mock; count: jest.Mock };
    mindConceptDetection: { findMany: jest.Mock };
    mindOutboxEvent: { count: jest.Mock };
    mindPolicy: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      mindWorkspaceState: { findUnique: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) },
      mindBelief: { findMany: jest.fn().mockResolvedValue([]) },
      mindPrediction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      mindConceptDetection: { findMany: jest.fn().mockResolvedValue([]) },
      mindOutboxEvent: { count: jest.fn().mockResolvedValue(0) },
      mindPolicy: { count: jest.fn().mockResolvedValue(0) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindObservabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: MindBeliefService, useValue: {} },
        { provide: MindPolicyService, useValue: { harness: jest.fn() } },
        { provide: MindVerbalizerService, useValue: {} },
        { provide: MindReportService, useValue: {} },
        { provide: MindBanditService, useValue: {} },
      ],
    }).compile();
    service = module.get(MindObservabilityService);
  });

  describe('state', () => {
    it('returns workspace-scoped runtime + strongest + uncertain beliefs', async () => {
      prisma.mindBelief.findMany
        .mockResolvedValueOnce([{ id: 's1' }])
        .mockResolvedValueOnce([{ id: 'u1' }]);
      const result = await service.state('ws-1');
      expect(result).toEqual({
        workspaceId: 'ws-1',
        runtime: { workspaceId: 'ws-1' },
        strongest: [{ id: 's1' }],
        uncertain: [{ id: 'u1' }],
      });
      expect(firstMockArg<WorkspaceWhereArgs>(prisma.mindBelief.findMany).where.workspaceId).toBe(
        'ws-1',
      );
      expect(
        firstMockArg<WorkspaceWhereArgs>(prisma.mindBelief.findMany, 1).where.workspaceId,
      ).toBe('ws-1');
    });
  });

  describe('surprise', () => {
    it('returns workspace-scoped resolved predictions sorted by surprise desc', async () => {
      await service.surprise('ws-tenant-A', 10);
      const arg = firstMockArg<SurpriseQueryArgs>(prisma.mindPrediction.findMany);
      expect(arg.where).toEqual({
        workspaceId: 'ws-tenant-A',
        resolvedAt: { not: null },
        surprise: { not: null },
      });
      expect(arg.orderBy).toEqual({ surprise: 'desc' });
      expect(arg.take).toBe(10);
    });

    it('defaults take to 50', async () => {
      await service.surprise('ws-1');
      expect(firstMockArg<SurpriseQueryArgs>(prisma.mindPrediction.findMany).take).toBe(50);
    });
  });

  describe('concepts', () => {
    it('aggregates concept counts and includes recent examples', async () => {
      prisma.mindConceptDetection.findMany.mockResolvedValue([
        { concept: 'price_objection' },
        { concept: 'price_objection' },
        { concept: 'hot_lead' },
      ]);
      const result = await service.concepts('ws-1', 6);
      expect(result.hours).toBe(6);
      expect(result.concepts).toContainEqual({ concept: 'price_objection', count: 2 });
      expect(result.concepts).toContainEqual({ concept: 'hot_lead', count: 1 });
      expect(result.examples.length).toBeLessThanOrEqual(50);
    });

    it('uses gte filter with workspace isolation', async () => {
      await service.concepts('ws-tenant-A', 12);
      const arg = firstMockArg<WorkspaceWhereArgs>(prisma.mindConceptDetection.findMany);
      expect(arg.where.workspaceId).toBe('ws-tenant-A');
      expect(arg.where.occurredAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('health', () => {
    it('returns runtime + pendingOutbox + openPredictions + openDecisions counts', async () => {
      prisma.mindOutboxEvent.count.mockResolvedValue(5);
      prisma.mindPrediction.count.mockResolvedValue(3);
      prisma.mindPolicy.count.mockResolvedValue(2);
      const result = await service.health('ws-1');
      expect(result.pendingOutbox).toBe(5);
      expect(result.openPredictions).toBe(3);
      expect(result.openDecisions).toBe(2);
      expect(result.workspaceId).toBe('ws-1');
    });

    it('enforces workspaceId filter on every count', async () => {
      await service.health('ws-tenant-A');
      expect(firstMockArg<WorkspaceWhereArgs>(prisma.mindOutboxEvent.count).where.workspaceId).toBe(
        'ws-tenant-A',
      );
      expect(firstMockArg<WorkspaceWhereArgs>(prisma.mindPrediction.count).where.workspaceId).toBe(
        'ws-tenant-A',
      );
      expect(firstMockArg<WorkspaceWhereArgs>(prisma.mindPolicy.count).where.workspaceId).toBe(
        'ws-tenant-A',
      );
    });
  });
});
