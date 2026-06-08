import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';

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

jest.mock('./kloel-reply-engine.helpers', () => ({
  WHITESPACE_RE: /\s+/,
  RELAT_O__RIO_DOCUMENTO_RE: /relat[oó]rio|documento/i,
  CRIE_CADASTRAR_CADASTRE_RE: /crie|cadastrar|cadastre/i,
  PRODUTO_CAT_A__LOGO_AUT_RE: /produto|cat[aá]logo|automa/i,
  KLOEL_STREAM_ABORT_REASON_TIMEOUT: 'kloel_stream_timeout',
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED: 'client_disconnected',
  buildDynamicRuntimeContextHelper: jest.fn().mockResolvedValue('Dynamic context'),
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Resposta do assistente'),
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
    threadService: {
      resolveThread: jest.fn().mockResolvedValue({ id: 'thread-1', title: 'Test' }),
      getThreadConversationState: jest.fn().mockResolvedValue({
        recentMessages: [],
        totalMessages: 0,
      }),
    },
    wsContextService: {
      getWorkspaceContext: jest.fn().mockResolvedValue('Workspace context'),
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn((name: string | null | undefined) => {
          const n = String(name || '').trim();
          return n.split(' ')[0] || 'Usuário';
        }),
      },
    },
    unifiedAgent: {
      processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'Agent reply' }),
    },
  };
}

describe('KloelReplyEngineService decision-outcome wiring (PI-k8)', () => {
  let decisionOutcome: ReturnType<typeof makeDecisionOutcomeMock>;

  beforeEach(() => {
    decisionOutcome = makeDecisionOutcomeMock();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordDecision at start', () => {
    it('calls recordDecision with correct params when workspaceId is present', async () => {
      const deps = makeBaseDeps();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: DecisionOutcomeService, useValue: decisionOutcome },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá, como vai?',
        workspaceId: 'ws-1',
      });

      expect(decisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
      type RecordArg = {
        workspaceId: string;
        decisionType: string;
        chosenAction: string;
        baselineAction: string;
        expectedWindow: number;
        contextSnapshot: { surface: string; messageLength: number };
        outcomeKey: string;
      };
      const recCalls = decisionOutcome.recordDecision.mock.calls as Array<[RecordArg]>;
      const call = recCalls[0]?.[0];
      expect(call.workspaceId).toBe('ws-1');
      expect(call.decisionType).toBe('chat_reply');
      expect(call.chosenAction).toBe('engage');
      expect(call.baselineAction).toBe('silence');
      expect(call.expectedWindow).toBe(1);
      expect(call.contextSnapshot).toEqual({
        surface: 'dashboard',
        messageLength: 'Olá, como vai?'.length,
      });
      expect(typeof call.outcomeKey).toBe('string');
      expect(call.outcomeKey).toMatch(/^chat:ws-1:\d+:[a-f0-9]{6}$/);
    });

    it('does NOT call recordDecision when workspaceId is absent', async () => {
      const deps = makeBaseDeps();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: DecisionOutcomeService, useValue: decisionOutcome },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá',
      });

      expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
    });
  });

  describe('closeOutcome on success', () => {
    it('closes with chat.replied and wonVsBaseline=true after successful reply', async () => {
      const deps = makeBaseDeps();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: DecisionOutcomeService, useValue: decisionOutcome },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });

      expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      const _closeCalls = decisionOutcome.closeOutcome.mock.calls as Array<
        [{ outcomeName: string; wonVsBaseline: boolean; economicValue?: number | undefined }]
      >;
      const call = _closeCalls[0]?.[0];
      expect(call.outcomeName).toBe('chat.replied');
      expect(call.wonVsBaseline).toBe(true);
      expect(call.economicValue).toBeUndefined();
    });
  });

  describe('closeOutcome on error', () => {
    it('closes with chat.error and wonVsBaseline=false when buildAssistantReplyImpl throws', async () => {
      const deps = makeBaseDeps();
      const helpersMock = jest.requireMock<typeof import('./kloel-reply-engine.helpers')>(
        './kloel-reply-engine.helpers',
      );
      (helpersMock.buildAssistantReplyImpl as jest.Mock).mockRejectedValueOnce(
        new Error('LLM timeout'),
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: DecisionOutcomeService, useValue: decisionOutcome },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await expect(
        service.buildAssistantReply({
          message: 'Olá',
          workspaceId: 'ws-1',
        }),
      ).rejects.toThrow('LLM timeout');

      expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      const _closeCalls = decisionOutcome.closeOutcome.mock.calls as Array<
        [{ outcomeName: string; wonVsBaseline: boolean; economicValue?: number | undefined }]
      >;
      const call = _closeCalls[0]?.[0];
      expect(call.outcomeName).toBe('chat.error');
      expect(call.wonVsBaseline).toBe(false);
    });
  });

  describe('absence of DecisionOutcomeService is tolerated', () => {
    it('does not throw when DecisionOutcomeService is not provided', async () => {
      const deps = makeBaseDeps();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });

      expect(result).toBe('Resposta do assistente');
      // No error thrown — absence was tolerated
    });
  });
});
