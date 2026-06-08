import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'mock-key',
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Resposta de teste' } }],
    usage: { total_tokens: 80 },
  }),
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Bem-vindo ao onboarding!' } }],
    model: 'gpt-4o',
    usage: { total_tokens: 100 },
  }),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn().mockReturnValue(actual.CANONICAL_MODEL_IDS.openAiTextOmni),
  };
});

jest.mock('./conversational-onboarding.prompt', () => ({
  CONVERSATIONAL_ONBOARDING_PROMPT: 'mock onboarding prompt',
}));

function makeDecisionOutcomeMock() {
  return {
    recordDecision: jest.fn().mockResolvedValue(undefined),
    closeOutcome: jest.fn().mockResolvedValue(undefined),
    findOpenByWorkspace: jest.fn().mockResolvedValue([]),
    findClosedByDecisionType: jest.fn().mockResolvedValue([]),
    findAllClosedSince: jest.fn().mockResolvedValue([]),
    findAllClosedSinceForWorkspace: jest.fn().mockResolvedValue([]),
    recordEvent: jest.fn().mockResolvedValue(undefined),
    sweepExpired: jest.fn().mockResolvedValue(0),
  };
}

function makeBaseDeps() {
  return {
    prisma: {
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
      kloelMemory: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    },
    planLimits: {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('ConversationalOnboardingService decision-outcome wiring (PI-k8)', () => {
  let onboardingDecisionOutcome: ReturnType<typeof makeDecisionOutcomeMock>;
  let toolsService: {
    getOnboardingHistory: jest.Mock;
    executeToolCall: jest.Mock;
    saveOnboardingMessage: jest.Mock;
    clearOnboardingHistory: jest.Mock;
  };

  beforeEach(() => {
    onboardingDecisionOutcome = makeDecisionOutcomeMock();
    toolsService = {
      getOnboardingHistory: jest.fn().mockResolvedValue([]),
      executeToolCall: jest.fn().mockResolvedValue({ success: true }),
      saveOnboardingMessage: jest.fn().mockResolvedValue(undefined),
      clearOnboardingHistory: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function buildService(
    decisionOutcomeOverride?: Record<string, jest.Mock>,
  ): Promise<ConversationalOnboardingService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationalOnboardingService,
        { provide: PrismaService, useValue: makeBaseDeps().prisma },
        { provide: PlanLimitsService, useValue: makeBaseDeps().planLimits },
        { provide: ConversationalOnboardingToolsService, useValue: toolsService },
        ...(decisionOutcomeOverride !== undefined
          ? [{ provide: DecisionOutcomeService, useValue: decisionOutcomeOverride }]
          : []),
      ],
    }).compile();
    return module.get<ConversationalOnboardingService>(ConversationalOnboardingService);
  }

  describe('recordDecision at start', () => {
    it('calls recordDecision with correct params', async () => {
      const service = await buildService(onboardingDecisionOutcome);

      await service.chat('ws-1', 'Olá, quero configurar');

      expect(onboardingDecisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
      type _ROnb = {
        workspaceId: string;
        decisionType: string;
        chosenAction: string;
        baselineAction: string;
        expectedWindow: number;
        contextSnapshot: { surface: string; messageLength: number };
        outcomeKey: string;
      };
      const _rcalls = onboardingDecisionOutcome.recordDecision.mock.calls as Array<[_ROnb]>;
      const call = _rcalls[0]?.[0];
      expect(call.workspaceId).toBe('ws-1');
      expect(call.decisionType).toBe('chat_reply');
      expect(call.chosenAction).toBe('engage');
      expect(call.baselineAction).toBe('silence');
      expect(call.expectedWindow).toBe(1);
      expect(call.contextSnapshot).toEqual({
        surface: 'onboarding',
        messageLength: 'Olá, quero configurar'.length,
      });
      expect(typeof call.outcomeKey).toBe('string');
      expect(call.outcomeKey).toMatch(/^chat:ws-1:\d+:[a-f0-9]{6}$/);
    });
  });

  describe('closeOutcome on success', () => {
    it('closes with chat.replied and wonVsBaseline=true', async () => {
      const service = await buildService(onboardingDecisionOutcome);

      await service.chat('ws-1', 'Olá');

      expect(onboardingDecisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      type _COnb = { outcomeName: string; wonVsBaseline: boolean; economicValue?: number };
      const _ccalls = onboardingDecisionOutcome.closeOutcome.mock.calls as Array<[_COnb]>;
      const call = _ccalls[0]?.[0];
      expect(call.outcomeName).toBe('chat.replied');
      expect(call.wonVsBaseline).toBe(true);
      expect(call.economicValue).toBeUndefined();
    });
  });

  describe('closeOutcome on error', () => {
    it('closes with chat.error and wonVsBaseline=false when LLM fails', async () => {
      const openaiMock = jest.requireMock<typeof import('./openai-wrapper')>('./openai-wrapper');
      (openaiMock.chatCompletionWithRetry as jest.Mock).mockRejectedValueOnce(
        new Error('Rate limit'),
      );

      const service = await buildService(onboardingDecisionOutcome);

      const result = await service.chat('ws-1', 'Olá');

      expect(typeof result).toBe('string');
      expect(result).toContain('instabilidade');
      expect(onboardingDecisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      type _COnb = { outcomeName: string; wonVsBaseline: boolean; economicValue?: number };
      const _ccalls = onboardingDecisionOutcome.closeOutcome.mock.calls as Array<[_COnb]>;
      const call = _ccalls[0]?.[0];
      expect(call.outcomeName).toBe('chat.error');
      expect(call.wonVsBaseline).toBe(false);
    });
  });

  describe('closeOutcome on degraded (empty_choice)', () => {
    it('closes with chat.degraded.empty_choice when LLM returns no choices', async () => {
      const openaiMock = jest.requireMock<typeof import('./openai-wrapper')>('./openai-wrapper');
      (openaiMock.chatCompletionWithRetry as jest.Mock).mockResolvedValueOnce({
        choices: [],
        model: 'gpt-4o',
        usage: { total_tokens: 10 },
      });

      const service = await buildService(onboardingDecisionOutcome);

      const result = await service.chat('ws-1', 'Olá');

      expect(result).toBe('');
      expect(onboardingDecisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      type _COnb = { outcomeName: string; wonVsBaseline: boolean; economicValue?: number };
      const _ccalls = onboardingDecisionOutcome.closeOutcome.mock.calls as Array<[_COnb]>;
      const call = _ccalls[0]?.[0];
      expect(call.outcomeName).toBe('chat.degraded.empty_choice');
      expect(call.wonVsBaseline).toBe(false);
    });
  });

  describe('absence of DecisionOutcomeService is tolerated', () => {
    it('does not throw when DecisionOutcomeService is not provided', async () => {
      const service = await buildService();

      const result = await service.chat('ws-1', 'Olá');

      expect(typeof result).toBe('string');
      expect(result).not.toBe('');
      // No error thrown — absence was tolerated
    });
  });

  describe('recordDecision is fire-and-forget (catch + warn)', () => {
    it('does not block reply when recordDecision throws', async () => {
      const failingDo = {
        ...makeDecisionOutcomeMock(),
        recordDecision: jest.fn().mockRejectedValue(new Error('DB down')),
      };

      const service = await buildService(failingDo);

      const result = await service.chat('ws-1', 'Olá');

      expect(typeof result).toBe('string');
      expect(result).not.toBe('');
      expect(failingDo.recordDecision).toHaveBeenCalledTimes(1);
      // closeOutcome was still called (errors in record don't prevent close)
      expect(failingDo.closeOutcome).toHaveBeenCalledTimes(1);
    });
  });

  describe('closeOutcome is fire-and-forget (catch + warn)', () => {
    it('does not block reply when closeOutcome throws', async () => {
      const failingDo = {
        ...makeDecisionOutcomeMock(),
        closeOutcome: jest.fn().mockRejectedValue(new Error('DB down')),
      };

      const service = await buildService(failingDo);

      const result = await service.chat('ws-1', 'Olá');

      expect(typeof result).toBe('string');
      expect(result).not.toBe('');
      expect(failingDo.closeOutcome).toHaveBeenCalledTimes(1);
    });
  });
});
