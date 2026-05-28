import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { IntentRouterService } from './intent-router/intent-router.service'; // ----------------------------------------------------------------
// StructuredLogger spy — intercepts log() calls without suppressing
// the real logger so the service continues to work normally.
// ----------------------------------------------------------------
const logCalls: Array<[string, Record<string, unknown>]> = [];

jest.mock('../logging/structured-logger', () => {
  const actual = jest.requireActual<typeof import('../logging/structured-logger')>(
    '../logging/structured-logger',
  );
  return {
    ...actual,
    StructuredLogger: class extends actual.StructuredLogger {
      static override from(context: string | { name?: string }) {
        const inst = new this(typeof context === 'string' ? context : (context.name ?? 'unknown'));
        return inst;
      }
      override log(a: string | Record<string, unknown>, b?: unknown): void {
        if (typeof a === 'string' && b && typeof b === 'object') {
          logCalls.push([a, b as Record<string, unknown>]);
        }
      }
    },
  };
});

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  })),
}));

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn(),
})); // ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function expectIntentLog(expected: {
  classification?: Record<string, unknown> | null;
  isChat: boolean;
  message_preview: string;
}): void {
  const intents = logCalls.filter(([msg]) => msg === 'kloel_onboarding_intent');
  expect(intents).toHaveLength(1);
  expect(intents[0]![1]).toMatchObject(expected);
}

function expectIntentSkippedLog(expectedReason: string): void {
  const skipped = logCalls.filter(([msg]) => msg === 'kloel_onboarding_intent_skipped');
  expect(skipped).toHaveLength(1);
  expect(skipped[0]![1]).toMatchObject({
    reason: expect.stringContaining(expectedReason) as unknown,
  });
}

function expectNoIntentLogs(): void {
  const intents = logCalls.filter(
    ([msg]) => msg === 'kloel_onboarding_intent' || msg === 'kloel_onboarding_intent_skipped',
  );
  expect(intents).toHaveLength(0);
}

const FALLBACK_REPLY =
  'Tive uma instabilidade momentânea pra processar agora. Pode repetir a mensagem em alguns segundos? Estou aqui pra continuar o onboarding.'; // ----------------------------------------------------------------
describe('ConversationalOnboardingService intent-router log telemetry', () => {
  let service: ConversationalOnboardingService;
  let toolsService: {
    getOnboardingHistory: jest.Mock;
    executeToolCall: jest.Mock;
    saveOnboardingMessage: jest.Mock;
    clearOnboardingHistory: jest.Mock;
    toErrorMessage: jest.Mock;
  };
  let planLimits: { ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };
  let prisma: {
    kloelMemory: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let chatCompletionWithRetryMock: jest.Mock;
  let abiBuilder: { build: jest.Mock };
  let intentRouter: {
    classify: jest.Mock;
  };

  async function buildModule(routerOverride?: { classify: jest.Mock }): Promise<void> {
    logCalls.length = 0;

    toolsService = {
      getOnboardingHistory: jest.fn().mockResolvedValue([]),
      executeToolCall: jest.fn().mockResolvedValue({ success: true }),
      saveOnboardingMessage: jest.fn().mockResolvedValue(undefined),
      clearOnboardingHistory: jest.fn().mockResolvedValue(undefined),
      toErrorMessage: jest.fn().mockReturnValue('test error'),
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    abiBuilder = {
      build: jest.fn().mockResolvedValue({
        status: 'ok',
        abi: {
          abiVersion: '1.0.0',
          lineage: {
            canonicalName: 'Kloel',
            genesisEventId: 'genesis-1',
            lineageStatus: 'intact',
            operationalAge: {
              sinceGenesisDays: 1,
              sinceFirstWorkspaceDays: 0,
            },
            capabilities: ['onboarding.save_business_info'],
          },
          identityProjection: {
            audience: 'public',
            currentMaturity: 'developing',
            truthMode: 'observed',
          },
          perception: {
            currentSnapshot: {
              channel: 'conversational_onboarding',
              workspaceId: 'ws-1',
              activeStage: 'onboarding',
            },
            recentSalientEvents: [],
          },
          beliefs: [],
          predictions: { active: [], recentSurprises: [] },
          attention: { candidates: [] },
          memory: {
            workingMemory: [],
            episodicRefs: [],
            consolidatedRefs: [],
          },
          capabilities: { available: [], restricted: [] },
          valence: {
            recentTrace: [],
            aggregatedMood: {
              positive: 0,
              negative: 0,
              neutral: 1,
              ambiguous: 0,
              windowHours: 24,
            },
          },
          pulseTruth: {
            noOverclaimStatus: 'PASS',
            capabilityHealthScore: 0,
            gates: [],
            certificationVerdict: {
              verdict: 'INSUFFICIENT_EVIDENCE',
              score: 0,
              measuredAt: '2026-05-14T00:00:00.000Z',
            },
            overclaimRisk: 0,
          },
          currentInput: {
            raw: 'Olá',
            channel: 'conversational_onboarding',
            arrivalTimestamp: '2026-05-14T00:00:00.000Z',
          },
        },
      }),
    };
    prisma = {
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn({ kloelMemory: prisma.kloelMemory }),
        ),
    };

    const { chatCompletionWithRetry } = await import('./openai-wrapper');
    chatCompletionWithRetryMock = chatCompletionWithRetry as jest.Mock;
    chatCompletionWithRetryMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Bem-vindo ao KLOEL! Vamos configurar sua conta.',
            tool_calls: null,
          },
        },
      ],
      usage: { total_tokens: 200 },
    });

    intentRouter = routerOverride ?? {
      classify: jest.fn().mockReturnValue({
        classification: null,
        isChat: true,
      }),
    };

    process.env.OPENAI_API_KEY = 'sk-test-key';

    const providers: Array<unknown> = [
      ConversationalOnboardingService,
      { provide: PrismaService, useValue: prisma },
      { provide: PlanLimitsService, useValue: planLimits },
      {
        provide: ConversationalOnboardingToolsService,
        useValue: toolsService,
      },
      { provide: AbiBuilderService, useValue: abiBuilder },
    ];

    if (routerOverride !== undefined) {
      providers.push({ provide: IntentRouterService, useValue: intentRouter });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: providers as Parameters<typeof Test.createTestingModule>[0]['providers'],
    }).compile();

    service = module.get<ConversationalOnboardingService>(ConversationalOnboardingService);
  }

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.KLOEL_ONBOARDING_USE_ABI;
  }); // --------------------------------------------------------------
  describe('when IntentRouter is provided and classifies as chat', () => {
    beforeEach(async () => {
      await buildModule({
        classify: jest.fn().mockReturnValue({
          classification: null,
          isChat: true,
        }),
      });
    });

    it('emits kloel_onboarding_intent with isChat=true', async () => {
      await service.chat('ws-1', 'Olá, quero configurar');

      expectIntentLog({
        classification: null,
        isChat: true,
        message_preview: 'Olá, quero configurar',
      });
    });

    it('truncates message_preview to 80 characters', async () => {
      const longMessage = 'A'.repeat(200);
      await service.chat('ws-1', longMessage);

      const intents = logCalls.filter(([msg]) => msg === 'kloel_onboarding_intent');
      expect(intents[0]?.[1]?.message_preview).toHaveLength(80);
    });

    it('returns the normal assistant response unchanged', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe('Bem-vindo ao KLOEL! Vamos configurar sua conta.');
    });
  }); // --------------------------------------------------------------
  describe('when IntentRouter is provided and classifies an intent', () => {
    beforeEach(async () => {
      await buildModule({
        classify: jest.fn().mockReturnValue({
          classification: {
            intent: 'crm.search_contact',
            capabilityId: 'crm.search_contact',
            entities: { name: 'Maria' },
            confidence: 0.9,
            missingInputs: [],
            requiresConfirmation: false,
          },
          isChat: false,
        }),
      });
    });

    it('emits kloel_onboarding_intent with classification shape', async () => {
      await service.chat('ws-1', 'Buscar Maria');

      expectIntentLog({
        classification: {
          intent: 'crm.search_contact',
          capabilityId: 'crm.search_contact',
          entities: { name: 'Maria' },
          confidence: 0.9,
        },
        isChat: false,
        message_preview: 'Buscar Maria',
      });
    });

    it('does NOT branch behavior — returns normal assistant response', async () => {
      const result = await service.chat('ws-1', 'Buscar Maria');
      expect(result).toBe('Bem-vindo ao KLOEL! Vamos configurar sua conta.');
    });
  }); // --------------------------------------------------------------
  describe('when IntentRouter is absent (@Optional not provided)', () => {
    beforeEach(async () => {
      // Do NOT pass IntentRouterService at all — simulate @Optional
      await buildModule(undefined);
    });

    it('does not fail and returns normal response', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe('Bem-vindo ao KLOEL! Vamos configurar sua conta.');
    });

    it('emits NO intent logs when router is absent', async () => {
      await service.chat('ws-1', 'Olá');
      expectNoIntentLogs();
    });

    it('still handles degraded flow (token_budget) normally', async () => {
      planLimits.ensureTokenBudget.mockRejectedValue(new Error('Token budget exceeded'));
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe(FALLBACK_REPLY);
    });
  }); // --------------------------------------------------------------
  describe('when IntentRouter.classify throws', () => {
    beforeEach(async () => {
      await buildModule({
        classify: jest.fn().mockImplementation(() => {
          throw new Error('Pattern explosion');
        }),
      });
    });

    it('emits kloel_onboarding_intent_skipped with reason', async () => {
      await service.chat('ws-1', 'Olá');
      expectIntentSkippedLog('Pattern explosion');
    });

    it('still returns normal assistant response', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe('Bem-vindo ao KLOEL! Vamos configurar sua conta.');
    });
  });
});
