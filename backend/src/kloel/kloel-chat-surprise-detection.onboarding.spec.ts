import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
const logCalls: Array<[string, Record<string, unknown>]> = [];
const warnCalls: Array<[string, Record<string, unknown>]> = [];

jest.mock('../logging/structured-logger', () => {
  const actual = jest.requireActual<typeof import('../logging/structured-logger')>(
    '../logging/structured-logger',
  );
  return {
    ...actual,
    StructuredLogger: {
      from: () => ({
        log: (a: string | Record<string, unknown>, b?: Record<string, unknown>) => {
          if (typeof a === 'object' && a !== null) {
            logCalls.push(['structured', a]);
          } else if (typeof a === 'string') {
            logCalls.push([a, b ?? {}]);
          }
        },
        warn: (a: string | Record<string, unknown>, b?: Record<string, unknown>) => {
          const msg = typeof a === 'string' ? a : ((a.event as string | undefined) ?? 'warn');
          const meta = typeof a === 'string' ? (b ?? {}) : a;
          warnCalls.push([msg, meta]);
        },
        error: jest.fn(),
        debug: jest.fn(),
      }),
    },
  };
});

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

jest.mock('./conversational-onboarding.prompt', () => ({
  CONVERSATIONAL_ONBOARDING_PROMPT: 'mock onboarding prompt',
}));
function _makeBaseDeps() {
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

function makeBelief(mean: number) {
  return {
    id: 'belief-1',
    workspaceId: 'ws-1',
    subject: 'ws-1',
    predicate: 'replied_to_user',
    context: { surface: 'dashboard', degraded: false },
    mean,
    variance: 0.04,
    samples: 5,
    alpha: mean * 10,
    beta: (1 - mean) * 10,
    updatedAt: new Date(),
  };
}

function makeBeliefService(mean: number, delayMs = 0) {
  const getOrInit =
    delayMs > 0
      ? jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(makeBelief(mean)), delayMs)),
          )
      : jest.fn().mockResolvedValue(makeBelief(mean));
  return {
    getOrInit,
    observeBinary: jest.fn().mockResolvedValue(makeBelief(mean)),
    list: jest.fn(),
    getActiveBeliefs: jest.fn(),
  };
}

function makeSurpriseService() {
  // Use the real computeSurprise for deterministic behavior
  const prisma = {
    mindPrediction: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const beliefs = { observeBinary: jest.fn() } as never;
  const predictor = { findOpen: jest.fn(), resolve: jest.fn() } as never;
  return new MindSurpriseService(prisma as never, beliefs, predictor);
}
describe('kloel_chat_surprise_detection — onboarding (PI-k9)', () => {
  describe('ConversationalOnboardingService surprise detection', () => {
    it('fires surprise log after onboarding reply when belief is low', async () => {
      const beliefService = makeBeliefService(0.2);
      const surpriseService = makeSurpriseService();

      const toolsService = {
        getOnboardingHistory: jest.fn().mockResolvedValue([]),
        executeToolCall: jest.fn().mockResolvedValue({ success: true }),
        saveOnboardingMessage: jest.fn().mockResolvedValue(undefined),
        clearOnboardingHistory: jest.fn().mockResolvedValue(undefined),
        toErrorMessage: jest.fn().mockReturnValue('test error'),
      };
      const planLimits = {
        ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
      };
      const prisma = {
        kloelMemory: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            kloelMemory: {
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
            },
          }),
        ),
      };

      process.env.OPENAI_API_KEY = 'sk-test-key';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ConversationalOnboardingService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: ConversationalOnboardingToolsService, useValue: toolsService },
          { provide: MindBeliefService, useValue: beliefService },
          { provide: MindSurpriseService, useValue: surpriseService },
        ],
      }).compile();

      const service = module.get<ConversationalOnboardingService>(ConversationalOnboardingService);

      const result = await service.chat('ws-1', 'Olá');

      expect(result).toContain('Bem-vindo');
      expect(beliefService.observeBinary).toHaveBeenCalled();
      expect(beliefService.getOrInit).toHaveBeenCalled();

      delete process.env.OPENAI_API_KEY;
    });
  });
});
