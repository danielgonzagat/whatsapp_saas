import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AutopilotCycleExecutorService } from './autopilot-cycle-executor.service';
import type {
  AutopilotConversation,
  ConversationAnalysis,
} from './autopilot-cycle-executor.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';

type FlexMock = jest.Mock & {
  mockResolvedValue: (v: unknown) => FlexMock;
  mockResolvedValueOnce: (v: unknown) => FlexMock;
  mockRejectedValue: (err: unknown) => FlexMock;
};

jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn(),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn(() => 'gpt-4o-mock'),
}));

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
}));

// Resolved lazily after jest.mock hoisting; safe inside test bodies/beforeEach.
const mockFlowQueueAdd = jest.requireMock<{
  flowQueue: { add: jest.Mock<(...args: unknown[]) => Promise<unknown>> };
}>('../queue/queue').flowQueue.add;

jest.mock('../common/sales-templates', () => ({
  renderTemplate: jest.fn(() => 'MOCK_CALENDAR_RESPONSE'),
}));

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

describe('AutopilotCycleExecutorService', () => {
  let service: AutopilotCycleExecutorService;

  type MockedPrisma = {
    autopilotEvent: { create: FlexMock };
    product: { findMany: FlexMock };
  };

  const mockPrisma: MockedPrisma = {
    autopilotEvent: { create: jest.fn() as FlexMock },
    product: { findMany: jest.fn() as FlexMock },
  };

  const mockConfig = {
    get: jest.fn<() => unknown>(),
  };

  const mockPlanLimits = {
    ensureTokenBudget: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    trackAiUsage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureDailyMessageQuota: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureMessageRate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const mockOpsAlert = {
    alertOnCriticalError: jest.fn(),
  };

  function makeConv(overrides: Partial<AutopilotConversation> = {}): AutopilotConversation {
    return {
      id: 'conv-1',
      workspaceId: 'ws-1',
      contact: {
        id: 'c-1',
        phone: '5511999999999',
        name: 'João',
      },
      messages: [{ direction: 'INBOUND', content: 'Quero comprar', createdAt: new Date() }],
      ...overrides,
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotCycleExecutorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PlanLimitsService, useValue: mockPlanLimits },
        { provide: OpsAlertService, useValue: mockOpsAlert },
      ],
    }).compile();
    service = module.get<AutopilotCycleExecutorService>(AutopilotCycleExecutorService);
  });

  describe('analyzeContext', () => {
    it('returns neutral fallback when openai is not available', async () => {
      const result = await service.analyzeContext([
        { direction: 'INBOUND', content: 'Oi', createdAt: new Date() },
      ]);

      expect(result).toEqual({
        intent: 'unknown',
        sentiment: 'neutral',
        buyingSignal: false,
      });
    });

    it('parses valid JSON from OpenAI response', async () => {
      mockConfig.get.mockReturnValue('sk-test');

      const module = await Test.createTestingModule({
        providers: [
          AutopilotCycleExecutorService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfig },
          { provide: PlanLimitsService, useValue: mockPlanLimits },
          { provide: OpsAlertService, useValue: mockOpsAlert },
        ],
      }).compile();
      const svcWithKey = module.get<AutopilotCycleExecutorService>(AutopilotCycleExecutorService);

      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              content:
                '{"intent":"buying","sentiment":"positive","buyingSignal":true,"stage":"closing"}',
              role: 'assistant',
              refusal: null,
            },
          },
        ],
        id: 'chatcmpl-mock',
        created: 1700000000,
        model: 'gpt-4o-mini',
        object: 'chat.completion',
        usage: {
          total_tokens: 100,
          completion_tokens: 50,
          prompt_tokens: 50,
        },
      });

      const result = await svcWithKey.analyzeContext([
        { direction: 'INBOUND', content: 'Quero comprar agora', createdAt: new Date() },
      ]);

      expect(result.intent).toBe('buying');
      expect(result.sentiment).toBe('positive');
      expect(result.buyingSignal).toBe(true);
      expect(result.stage).toBe('closing');
    });

    it('falls back to defaults on invalid JSON from LLM', async () => {
      mockConfig.get.mockReturnValue('sk-test');

      const module = await Test.createTestingModule({
        providers: [
          AutopilotCycleExecutorService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfig },
          { provide: PlanLimitsService, useValue: mockPlanLimits },
          { provide: OpsAlertService, useValue: mockOpsAlert },
        ],
      }).compile();
      const svcWithKey2 = module.get<AutopilotCycleExecutorService>(AutopilotCycleExecutorService);

      jest.mocked(chatCompletionWithRetry).mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              content: 'not valid json',
              role: 'assistant',
              refusal: null,
            },
          },
        ],
        id: 'chatcmpl-mock',
        created: 1700000000,
        model: 'gpt-4o-mini',
        object: 'chat.completion',
        usage: {
          total_tokens: 10,
          completion_tokens: 5,
          prompt_tokens: 5,
        },
      });

      const result = await svcWithKey2.analyzeContext([
        { direction: 'INBOUND', content: '?', createdAt: new Date() },
      ]);

      expect(result.intent).toBe('unknown');
      expect(result.sentiment).toBe('neutral');
      expect(result.buyingSignal).toBe(false);
    });
  });

  describe('decideAction', () => {
    const conv = makeConv();

    it('returns auto_reply_night when isNight and no buying signal', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-13T03:00:00.000Z'));
      const analysis: ConversationAnalysis = { intent: 'greeting', buyingSignal: false };
      const result = await service.decideAction(analysis, conv, false);

      expect(result).toBe('auto_reply_night');
      jest.useRealTimers();
    });

    it('returns soft_close_night when isNight with buying signal', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-13T03:00:00.000Z'));
      const analysis: ConversationAnalysis = { intent: 'buying', buyingSignal: true };
      const result = await service.decideAction(analysis, conv, false);

      expect(result).toBe('soft_close_night');
      jest.useRealTimers();
    });

    it('returns send_offer when buying signal at optimal time', async () => {
      const analysis: ConversationAnalysis = { buyingSignal: true };
      const result = await service.decideAction(analysis, conv, true);

      expect(result).toBe('send_offer');
    });

    it('returns send_offer_soft when buying signal at non-optimal time', async () => {
      const analysis: ConversationAnalysis = { buyingSignal: true };
      const result = await service.decideAction(analysis, conv, false);

      expect(result).toBe('send_offer_soft');
    });

    it('maps question_price to send_price', async () => {
      const result = await service.decideAction({ intent: 'question_price' }, conv, true);
      expect(result).toBe('send_price');
    });

    it('maps scheduling to send_calendar', async () => {
      const result = await service.decideAction({ intent: 'scheduling' }, conv, true);
      expect(result).toBe('send_calendar');
    });

    it('maps complaint to handover_human', async () => {
      const result = await service.decideAction({ intent: 'complaint' }, conv, true);
      expect(result).toBe('handover_human');
    });

    it('maps objection to handle_objection', async () => {
      const result = await service.decideAction({ intent: 'objection' }, conv, true);
      expect(result).toBe('handle_objection');
    });

    it('returns qualify for new stage', async () => {
      const result = await service.decideAction({ stage: 'new' }, conv, true);
      expect(result).toBe('qualify');
    });

    it('returns try_upsell for closing with positive sentiment and no buyingSignal', async () => {
      const result = await service.decideAction(
        { stage: 'closing', sentiment: 'positive', buyingSignal: false },
        conv,
        true,
      );
      expect(result).toBe('try_upsell');
    });

    it('returns send_cta for closing with non-positive sentiment', async () => {
      const result = await service.decideAction(
        { stage: 'closing', sentiment: 'neutral' },
        conv,
        true,
      );
      expect(result).toBe('send_cta');
    });

    it('defaults to ai_chat when no rule matches', async () => {
      const result = await service.decideAction(
        { intent: 'greeting', stage: 'support', sentiment: 'neutral' },
        conv,
        true,
      );
      expect(result).toBe('ai_chat');
    });
  });

  describe('executeAction', () => {
    it('skips and logs compliance when compliance.allowed is false', async () => {
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);
      const conv = makeConv();
      const compliance = { allowed: false, reason: 'rate_limit' };

      await service.executeAction('SEND_OFFER', conv, compliance, { intent: 'buying' });

      expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            action: 'SEND_OFFER',
            status: 'skipped',
            reason: 'rate_limit',
          }),
        }),
      );
      expect(mockFlowQueueAdd).not.toHaveBeenCalled();
    });

    it('stops and returns null on handover_human — respects handoff signal', async () => {
      const conv = makeConv();
      const compliance = { allowed: true };

      await service.executeAction('handover_human', conv, compliance);

      expect(mockFlowQueueAdd).not.toHaveBeenCalled();
      expect(mockPrisma.autopilotEvent.create).not.toHaveBeenCalled();
    });

    it('returns hardcoded night autoresponse', async () => {
      mockPlanLimits.ensureDailyMessageQuota.mockResolvedValue(undefined);
      mockPlanLimits.ensureMessageRate.mockResolvedValue(undefined);
      mockFlowQueueAdd.mockResolvedValue(undefined);
      const conv = makeConv();
      const compliance = { allowed: true };

      await service.executeAction('auto_reply_night', conv, compliance);

      expect(mockFlowQueueAdd).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({
          workspaceId: 'ws-1',
          to: '5511999999999',
          message: expect.stringContaining('Agora estou offline'),
        }),
      );
    });

    it('sends calendar template with resolved link', async () => {
      mockPlanLimits.ensureDailyMessageQuota.mockResolvedValue(undefined);
      mockPlanLimits.ensureMessageRate.mockResolvedValue(undefined);
      mockFlowQueueAdd.mockResolvedValue(undefined);
      const conv = makeConv({
        workspace: { providerSettings: { calendarLink: 'https://cal.example.com' } },
      });
      const compliance = { allowed: true };

      await service.executeAction('send_calendar', conv, compliance);

      expect(mockFlowQueueAdd).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({
          message: 'MOCK_CALENDAR_RESPONSE',
        }),
      );
    });

    it('enqueues message via flowQueue when compliance passes and response exists', async () => {
      mockPlanLimits.ensureDailyMessageQuota.mockResolvedValue(undefined);
      mockPlanLimits.ensureMessageRate.mockResolvedValue(undefined);
      mockFlowQueueAdd.mockResolvedValue(undefined);
      const conv = makeConv();
      const compliance = { allowed: true };

      await service.executeAction('auto_reply_night', conv, compliance);

      const [, payload] = mockFlowQueueAdd.mock.calls[0];
      expect(payload).toEqual(
        expect.objectContaining({
          workspaceId: conv.workspaceId,
          to: conv.contact.phone,
          message: payload.message,
        }),
      );
      expect(typeof payload.message).toBe('string');
    });

    it('handles flowQueue.add failure gracefully', async () => {
      mockPlanLimits.ensureDailyMessageQuota.mockResolvedValue(undefined);
      mockPlanLimits.ensureMessageRate.mockResolvedValue(undefined);
      mockFlowQueueAdd.mockRejectedValue(new Error('redis down'));
      const conv = makeConv();
      const compliance = { allowed: true };

      await service.executeAction('auto_reply_night', conv, compliance);

      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalled();
    });

    it('survives autopilotEvent.create failure in compliance-skip path', async () => {
      mockPrisma.autopilotEvent.create.mockRejectedValue(new Error('insert fail'));
      const conv = makeConv();
      const compliance = { allowed: false, reason: 'test_reason' };

      await service.executeAction('SEND_OFFER', conv, compliance);

      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalled();
    });
  });

  describe('audit trail', () => {
    it('persists autopilotEvent with workspaceId on compliance skip', async () => {
      mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);
      const conv = makeConv({ workspaceId: 'ws-audit-1' });
      const compliance = { allowed: false, reason: 'workspace_paused' };

      await service.executeAction('SEND_OFFER', conv, compliance, { intent: 'buying' });

      expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-audit-1',
            contactId: conv.contact.id,
            intent: 'buying',
            action: 'SEND_OFFER',
            status: 'skipped',
            reason: 'workspace_paused',
          }),
        }),
      );
    });
  });

  describe('decideAction edge cases', () => {
    it('returns send_offer_soft for buying signal when isNight is false but not optimal', async () => {
      const conv = makeConv();
      const result = await service.decideAction({ buyingSignal: true }, conv, false);

      expect(result).toBe('send_offer_soft');
    });

    it('prefers night+noBuying auto_reply_night over buying path', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-13T03:00:00.000Z'));
      const conv = makeConv();
      const result = await service.decideAction({ buyingSignal: false }, conv, false);

      expect(result).toBe('auto_reply_night');
      jest.useRealTimers();
    });
  });

  describe('executeAction with LLM response', () => {
    it('generates AI chat response when openai is not configured', async () => {
      mockPlanLimits.ensureDailyMessageQuota.mockResolvedValue(undefined);
      mockPlanLimits.ensureMessageRate.mockResolvedValue(undefined);
      mockFlowQueueAdd.mockResolvedValue(undefined);
      const conv = makeConv();
      const compliance = { allowed: true };

      await service.executeAction('ai_chat', conv, compliance);

      expect(mockFlowQueueAdd).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({
          message: 'Olá, como posso ajudar?',
        }),
      );
    });

    it('returns null for unknown action with empty response', async () => {
      const conv = makeConv();
      const compliance = { allowed: true };

      await service.executeAction('unknown_action_xyz', conv, compliance);

      expect(mockFlowQueueAdd).not.toHaveBeenCalled();
    });
  });
});
