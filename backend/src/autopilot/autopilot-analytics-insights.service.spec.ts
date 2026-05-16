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

  describe('getImpact', () => {
    it('computes reply rate and conversion rate from events and messages', async () => {
      const contactId = 'c-1';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId, createdAt: new Date('2026-05-10T10:00:00Z'), action: 'SEND_OFFER' },
        { contactId: 'c-2', createdAt: new Date('2026-05-10T11:00:00Z'), action: 'SEND_OFFER' },
        { contactId, createdAt: new Date('2026-05-11T10:00:00Z'), action: 'CONVERSION' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-1', phone: '5511999999999', name: 'João' },
        { id: 'c-2', phone: '5511888888888', name: null },
      ]);
      mockPrisma.message.findMany
        .mockResolvedValueOnce([{ contactId, createdAt: new Date('2026-05-11T11:00:00Z') }])
        .mockResolvedValueOnce([]);

      const result = await service.getImpact('ws-1');

      expect(result.workspaceId).toBe('ws-1');
      expect(result.windowDays).toBe(7);
      expect(result.actionsAnalyzed).toBe(3);
      expect(result.repliedContacts).toBe(1);
      expect(result.totalReplies).toBe(1);
      expect(result.conversions).toBeGreaterThanOrEqual(1);
      expect(result.replyRate).toBeCloseTo(1 / 3, 2);
      expect(result.samples).toHaveLength(1);
    });

    it('returns zero rates when no events found', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(0);
      expect(result.repliedContacts).toBe(0);
      expect(result.replyRate).toBe(0);
      expect(result.conversions).toBe(0);
      expect(result.conversionRate).toBe(0);
      expect(result.samples).toEqual([]);
    });

    it('filters out events with null contactId from contactActions map', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId: null, createdAt: new Date(), action: 'SYSTEM' },
        { contactId: 'c-1', createdAt: new Date(), action: 'SEND_OFFER' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-1', phone: '5511', name: 'Maria' }]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(2);
      expect(result.samples).toHaveLength(0);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c-1'] } }) }),
      );
    });

    it('does not treat queued or recommended events as impactable actions', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          contactId: 'c-queued',
          createdAt: new Date('2026-05-10T10:00:00Z'),
          action: 'ENQUEUED',
          status: 'queued',
        },
        {
          contactId: 'c-recommended',
          createdAt: new Date('2026-05-10T10:05:00Z'),
          action: 'NEXT_BEST_ACTION',
          status: 'recommended',
        },
        {
          contactId: 'c-executed',
          createdAt: new Date('2026-05-10T10:10:00Z'),
          action: 'SEND_OFFER',
          status: 'executed',
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-executed', phone: '5511', name: 'Lead' },
      ]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(1);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['c-executed'] } }),
        }),
      );
    });

    it('deduplicates contact actions by latest timestamp in contactActions map', async () => {
      const contactId = 'c-1';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId, createdAt: new Date('2026-05-11T10:00:00Z'), action: 'LATEST' },
        { contactId, createdAt: new Date('2026-05-10T08:00:00Z'), action: 'EARLIER' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-1', phone: '5511', name: 'X' }]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(2);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c-1'] } }) }),
      );
    });

    it('skips message queries when no contact ids found', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
      expect(result.actionsAnalyzed).toBe(0);
    });

    it('respects workspace isolation in all queries', async () => {
      const ws = 'ws-isolated';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      await service.getImpact(ws);

      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: ws }) }),
      );
    });

    it('includes keyword-based conversions from messages', async () => {
      const contactId = 'c-3';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId, createdAt: new Date('2026-05-10T10:00:00Z'), action: 'SEND_OFFER' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-3', phone: '5511', name: 'Lead' }]);
      mockPrisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ contactId }]);

      const result = await service.getImpact('ws-1');

      expect(result.conversions).toBe(1);
    });

    it('survives upstream error', async () => {
      mockPrisma.autopilotEvent.findMany.mockRejectedValue(new Error('DB crash'));

      await expect(service.getImpact('ws-1')).rejects.toThrow('DB crash');
    });
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

  describe('askInsights', () => {
    it('returns offline summary when no OPENAI_API_KEY configured', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { createdAt: new Date(), intent: 'BUYING', action: 'SEND_OFFER', status: 'executed' },
      ]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);

      const result = await service.askInsights('ws-1', 'How many deals?');

      expect(result.answer).toContain('Resumo:');
      expect(result.answer).toContain('Risk/Proof:');
      expect(result.answer).toContain('How many deals?');
      expect(result.detail).toBeDefined();
      expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            intent: 'AUTOPILOT_ASK',
            action: 'ANALYZE_INSIGHTS',
            status: 'executed',
            reason: 'ask_insights_offline',
          }),
        }),
      );
    });

    it('logs METADATA with workspaceId in the offline path', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);

      await service.askInsights('ws-audit', 'Q?');

      expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-audit',
            meta: expect.objectContaining({ questionPreview: 'Q?' }),
          }),
        }),
      );
    });

    it('calls OpenAI when API key is available', async () => {
      mockConfig.get.mockReturnValue('sk-mock-key');
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);

      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              content: 'Sua taxa de resposta foi de 50%',
              role: 'assistant',
              refusal: null,
            },
          },
        ],
        id: 'chatcmpl-mock',
        created: 1700000000,
        model: CANONICAL_MODEL_IDS.openAiTextMini,
        object: 'chat.completion',
        usage: {
          total_tokens: 100,
          completion_tokens: 50,
          prompt_tokens: 50,
        },
      });

      const result = await service.askInsights('ws-1', 'Qual a taxa de resposta?');

      expect(chatCompletionWithRetry).toHaveBeenCalled();
      expect(result.answer).toBe('Sua taxa de resposta foi de 50%');
      expect(mockPlanLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
      expect(mockPlanLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 100);
      expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'AUTOPILOT_ASK',
            reason: 'ask_insights_succeeded',
          }),
        }),
      );
    });

    it('logs error event when askInsights fails', async () => {
      mockConfig.get.mockReturnValue('sk-mock-key');
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);

      jest.mocked(chatCompletionWithRetry).mockRejectedValue(new Error('OpenAI quota exceeded'));

      await expect(service.askInsights('ws-1', 'test')).rejects.toThrow('OpenAI quota exceeded');

      expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'error',
            reason: 'ask_insights_failed',
          }),
        }),
      );
    });

    it('falls back to summary text when LLM returns empty content', async () => {
      mockConfig.get.mockReturnValue('sk-mock-key');
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);

      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: { content: '', role: 'assistant', refusal: null },
          },
        ],
        id: 'chatcmpl-mock',
        created: 1700000000,
        model: CANONICAL_MODEL_IDS.openAiTextMini,
        object: 'chat.completion',
        usage: {
          total_tokens: 50,
          completion_tokens: 25,
          prompt_tokens: 25,
        },
      });

      const result = await service.askInsights('ws-1', 'Q');

      expect(result.answer).toContain('Executed:');
    });

    it('survives autopilotEvent.create failure silently in offline path', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockRejectedValue(new Error('insert failed'));

      const result = await service.askInsights('ws-1', 'Q');

      expect(result.answer).toContain('Resumo:');
    });

    it('includes risk/proof/approval signals in offline response', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: { id: 0 },
      });
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);
      mockPrisma.accountProofSnapshot.findFirst.mockResolvedValue({
        eligibleActionCount: 20,
        blockedActionCount: 5,
        deferredActionCount: 2,
        waitingApprovalCount: 3,
        waitingInputCount: 1,
        noLegalActions: false,
      });
      mockPrisma.agentWorkItem.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
      mockPrisma.mindPolicy.aggregate.mockResolvedValue({
        _avg: { epsilon: 0.08 },
        _count: { id: 10 },
      });
      mockPrisma.mindPolicy.count.mockResolvedValue(0);

      const result = await service.askInsights('ws-1', 'Preciso agir agora?');

      expect(result.answer).toContain('Risk/Proof:');
      expect(result.answer).toContain('5 blocked');
      expect(result.answer).toContain('3 awaiting human approval');
      expect(result.answer).toContain('Decision confidence:');
      expect(result.answer).toContain('0.080');
      expect(result.answer).toContain('Preciso agir agora?');
    });

    it('communicates no-legal-action uncertainty in offline response', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.accountProofSnapshot.findFirst.mockResolvedValue({
        eligibleActionCount: 0,
        blockedActionCount: 4,
        deferredActionCount: 1,
        waitingApprovalCount: 2,
        waitingInputCount: 0,
        noLegalActions: true,
      });

      const result = await service.askInsights('ws-1', 'Posso automatizar?');

      expect(result.answer).toContain('no legal action currently available');
      expect(result.answer).toContain('Approval queue:');
      expect(result.answer).toContain('Decision confidence:');
      expect(result.answer).toContain('Posso automatizar?');
    });
  });
});
