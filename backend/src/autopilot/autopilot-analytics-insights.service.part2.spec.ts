import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AutopilotAnalyticsInsightsService } from './autopilot-analytics-insights.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { CANONICAL_MODEL_IDS } from '../lib/openai-models';

type FlexMock = jest.Mock & {
  mockResolvedValue: (v: unknown) => FlexMock;
  mockResolvedValueOnce: (v: unknown) => FlexMock;
  mockRejectedValue: (err: unknown) => FlexMock;
};

jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn(),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>(
    '../lib/openai-models',
  );
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn(() => actual.CANONICAL_MODEL_IDS.openAiTextMock),
  };
});

jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    __mockOpenaiCreate: mockCreate,
  };
});

describe('AutopilotAnalyticsInsightsService', () => {
  let service: AutopilotAnalyticsInsightsService;

  type MockedPrisma = {
    autopilotEvent: {
      findMany: FlexMock;
      create: FlexMock;
      count: FlexMock;
      groupBy: FlexMock;
    };
    contact: { findMany: FlexMock };
    message: { findMany: FlexMock };
    deal: { aggregate: FlexMock };
    accountProofSnapshot: { findFirst: FlexMock };
    agentWorkItem: { count: FlexMock };
    mindPolicy: { aggregate: FlexMock; count: FlexMock };
  };

  const mockPrisma: MockedPrisma = {
    autopilotEvent: {
      findMany: jest.fn() as FlexMock,
      create: jest.fn() as FlexMock,
      count: jest.fn() as FlexMock,
      groupBy: jest.fn() as FlexMock,
    },
    contact: { findMany: jest.fn() as FlexMock },
    message: { findMany: jest.fn() as FlexMock },
    deal: { aggregate: jest.fn() as FlexMock },
    accountProofSnapshot: { findFirst: jest.fn().mockResolvedValue(null) as FlexMock },
    agentWorkItem: { count: jest.fn().mockResolvedValue(0) as FlexMock },
    mindPolicy: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { epsilon: null }, _count: { id: 0 } }) as FlexMock,
      count: jest.fn().mockResolvedValue(0) as FlexMock,
    },
  };

  const mockConfig = {
    get: jest.fn<() => unknown>(),
  };

  const mockPlanLimits = {
    ensureTokenBudget: jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    trackAiUsage: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
    mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);
    mockPrisma.autopilotEvent.count.mockResolvedValue(0);
    mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });
    mockPrisma.accountProofSnapshot.findFirst.mockResolvedValue(null);
    mockPrisma.agentWorkItem.count.mockResolvedValue(0);
    mockPrisma.mindPolicy.aggregate.mockResolvedValue({
      _avg: { epsilon: null },
      _count: { id: 0 },
    });
    mockPrisma.mindPolicy.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotAnalyticsInsightsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PlanLimitsService, useValue: mockPlanLimits },
      ],
    }).compile();
    service = module.get<AutopilotAnalyticsInsightsService>(AutopilotAnalyticsInsightsService);
  });

  describe('getInsights', () => {
    it('aggregates event stats with deal data + proof/risk/approval signals', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { createdAt: new Date(), intent: 'BUYING', action: 'SEND_OFFER', status: 'executed' },
        { createdAt: new Date(), intent: 'PRICE', action: 'SEND_PRICE', status: 'executed' },
        { createdAt: new Date(), intent: 'BUYING', action: 'SEND_OFFER', status: 'error' },
      ]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 500 },
        _count: { id: 3 },
      });

      const result = await service.getInsights('ws-1');

      expect(result.executed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.intents.BUYING).toBe(2);
      expect(result.intents.PRICE).toBe(1);
      expect(result.dealsWon).toBe(3);
      expect(result.revenueWon).toBe(500);
      expect(result.proofStatus).toBeNull();
      expect(result.approvalQueue).toEqual({
        pendingApprovalCount: 0,
        pendingInputCount: 0,
      });
      expect(result.decisionConfidence).toEqual({
        avgEpsilon: null,
        fallbackActiveCount: 0,
        totalPolicies: 0,
      });
    });

    it('handles UNKNOWN intent when intent is null', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { createdAt: new Date(), intent: null, action: 'SEND_OFFER', status: 'executed' },
      ]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });

      const result = await service.getInsights('ws-1');

      expect(result.intents.UNKNOWN).toBe(1);
    });

    it('handles UNKNOWN action when action is null', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { createdAt: new Date(), intent: 'X', action: null, status: 'executed' },
      ]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });

      const result = await service.getInsights('ws-1');

      expect(result.actions.UNKNOWN).toBe(1);
    });

    it('filters deals by workspaceId via contact relation', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });

      await service.getInsights('ws-isolated');

      expect(mockPrisma.deal.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contact: { workspaceId: 'ws-isolated' },
          }),
        }),
      );
    });

    it('includes proof/risk/approval data when worker has populated them', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });
      mockPrisma.accountProofSnapshot.findFirst.mockResolvedValue({
        eligibleActionCount: 45,
        blockedActionCount: 12,
        deferredActionCount: 3,
        waitingApprovalCount: 2,
        waitingInputCount: 1,
        noLegalActions: true,
      });
      mockPrisma.agentWorkItem.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
      mockPrisma.mindPolicy.aggregate.mockResolvedValue({
        _avg: { epsilon: 0.15 },
        _count: { id: 8 },
      });
      mockPrisma.mindPolicy.count.mockResolvedValue(2);

      const result = await service.getInsights('ws-1');

      expect(result.proofStatus).toEqual({
        eligibleCount: 45,
        blockedCount: 12,
        deferredCount: 3,
        waitingApprovalCount: 2,
        waitingInputCount: 1,
        noLegalActions: true,
      });
      expect(result.approvalQueue).toEqual({
        pendingApprovalCount: 3,
        pendingInputCount: 1,
      });
      expect(result.decisionConfidence).toEqual({
        avgEpsilon: 0.15,
        fallbackActiveCount: 2,
        totalPolicies: 8,
      });
      expect(mockPrisma.agentWorkItem.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            requiresApproval: true,
            OR: [
              { approvalState: { in: ['PENDING', 'OPEN', 'REQUIRED'] } },
              { approvalState: null },
            ],
          }),
        }),
      );
    });

    it('does not count queued or recommended events as executed decisions', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { createdAt: new Date(), intent: 'RUN', action: 'ENQUEUED', status: 'queued' },
        { createdAt: new Date(), intent: 'NBA', action: 'RECOMMEND', status: 'recommended' },
        { createdAt: new Date(), intent: 'BUYING', action: 'SEND_OFFER', status: 'executed' },
        { createdAt: new Date(), intent: 'BUYING', action: 'SEND_OFFER', status: 'error' },
      ]);

      const result = await service.getInsights('ws-1');

      expect(result.executed).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.actions.ENQUEUED).toBe(1);
      expect(result.actions.RECOMMEND).toBe(1);
    });

    it('survives proof/agent/mind table failures gracefully', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });
      mockPrisma.accountProofSnapshot.findFirst.mockRejectedValue(new Error('Table missing'));
      mockPrisma.agentWorkItem.count.mockRejectedValue(new Error('Table missing'));
      mockPrisma.mindPolicy.aggregate.mockRejectedValue(new Error('Table missing'));
      mockPrisma.mindPolicy.count.mockRejectedValue(new Error('Table missing'));

      const result = await service.getInsights('ws-1');

      expect(result.proofStatus).toBeNull();
      expect(result.approvalQueue).toEqual({
        pendingApprovalCount: 0,
        pendingInputCount: 0,
      });
      expect(result.decisionConfidence).toEqual({
        avgEpsilon: null,
        fallbackActiveCount: 0,
        totalPolicies: 0,
      });
    });
  });
