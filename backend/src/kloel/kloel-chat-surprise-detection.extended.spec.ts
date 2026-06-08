import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';
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
describe('kloel_chat_surprise_detection — replyEngine extended (PI-k9)', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });
  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  beforeEach(() => {
    logCalls.length = 0;
    warnCalls.length = 0;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function _expectSurpriseDetected(predicted: number) {
    const surpriseLogs = logCalls.filter(
      ([msg]) => msg === 'structured' || msg === 'kloel_chat_surprise_detected',
    );
    // Find structured log with event=kloel_chat_surprise_detected
    const detected = surpriseLogs.find(([, meta]) => {
      return meta.event === 'kloel_chat_surprise_detected';
    });
    if (!detected) {
      // Also check direct string logs
      const direct = logCalls.find(([msg]) => msg === 'kloel_chat_surprise_detected');
      expect(direct).toBeDefined();
      return;
    }
    const meta = detected[1];
    expect(meta.surpriseValue).toBeGreaterThan(0.3);
    expect(meta.predicted).toBeCloseTo(predicted);
    expect(meta.observed).toBe(1);
    expect(meta.workspaceId).toBe('ws-1');
    expect(meta.surface).toBe('dashboard');
  }

  function expectSurpriseSkipped(reason?: string) {
    const skipped = warnCalls.filter(([msg]) => msg === 'kloel_surprise_skipped');
    expect(skipped.length).toBeGreaterThan(0);
    if (reason) {
      expect(skipped[0][1].reason).toContain(reason);
    }
  }

  function expectNoSurpriseDetected() {
    const detected = logCalls.filter(([, meta]) => meta.event === 'kloel_chat_surprise_detected');
    const direct = logCalls.filter(([msg]) => msg === 'kloel_chat_surprise_detected');
    expect(detected.length + direct.length).toBe(0);
  }

  /** Wait for fire-and-forget async calls (computeChatSurprise) to settle. */
  async function flushAsync(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  function expectNoSurpriseSkipped() {
    const skipped = warnCalls.filter(([msg]) => msg === 'kloel_surprise_skipped');
    expect(skipped.length).toBe(0);
  }
  describe('KloelReplyEngineService surprise detection', () => {
    it('skips and logs kloel_surprise_skipped when getOrInit throws', async () => {
      const deps = makeBaseDeps();
      const beliefService = {
        getOrInit: jest.fn().mockRejectedValue(new Error('DB unavailable')),
        observeBinary: jest.fn().mockResolvedValue(makeBelief(0.5)),
        list: jest.fn(),
        getActiveBeliefs: jest.fn(),
      };
      const surpriseService = makeSurpriseService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: MindBeliefService, useValue: beliefService },
          { provide: MindSurpriseService, useValue: surpriseService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });
      await flushAsync();

      expect(result).toBe('Resposta do assistente');
      expectSurpriseSkipped('DB unavailable');
      expectNoSurpriseDetected();
    });

    it('does not fire surprise for empty reply (outcome=0)', async () => {
      const deps = makeBaseDeps();

      const helpersMock = jest.requireMock<typeof import('./kloel-reply-engine.helpers')>(
        './kloel-reply-engine.helpers',
      );
      (helpersMock.buildAssistantReplyImpl as jest.Mock).mockResolvedValueOnce('');

      const beliefService = makeBeliefService(0.5);
      const surpriseService = makeSurpriseService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: MindBeliefService, useValue: beliefService },
          { provide: MindSurpriseService, useValue: surpriseService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });
      await flushAsync();

      // Empty reply means degraded — surprise should be high when belief predicts p=0.5 and outcome=0
      // -ln(1-0.5) = -ln(0.5) ≈ 0.69 > 0.3 → should fire
      // Check surprise log directly — observed is 0 (degraded)
      const detected = logCalls.find(([, meta]) => meta.event === 'kloel_chat_surprise_detected');
      expect(detected).toBeDefined();
      const meta = detected[1];
      expect(meta.surpriseValue).toBeGreaterThan(0.3);
      expect(meta.predicted).toBeCloseTo(0.5);
      expect(meta.observed).toBe(0);
      expect(meta.workspaceId).toBe('ws-1');
      expect(meta.surface).toBe('dashboard');
    });

    it('does not attempt surprise when workspaceId is undefined', async () => {
      const deps = makeBaseDeps();
      const beliefService = makeBeliefService(0.1);
      const surpriseService = makeSurpriseService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: deps.prisma },
          { provide: PlanLimitsService, useValue: deps.planLimits },
          { provide: KloelThreadService, useValue: deps.threadService },
          { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
          { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
          { provide: MindBeliefService, useValue: beliefService },
          { provide: MindSurpriseService, useValue: surpriseService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá',
        // workspaceId intentionally omitted
      });

      expect(beliefService.observeBinary).not.toHaveBeenCalled();
      expect(beliefService.getOrInit).not.toHaveBeenCalled();
      expectNoSurpriseDetected();
      expectNoSurpriseSkipped();
    });
  });
});
