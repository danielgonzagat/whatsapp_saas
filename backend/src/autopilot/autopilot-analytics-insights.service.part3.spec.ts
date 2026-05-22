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
