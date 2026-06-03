import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbiBuilderService } from './abi/abi-builder.service';
const mockWarnCalls: Array<[string, Record<string, unknown>]> = [];

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
      override warn(a: string | Record<string, unknown>, b?: unknown): void {
        if (typeof a === 'string' && b && typeof b === 'object') {
          mockWarnCalls.push([a, b as Record<string, unknown>]);
        }
        if (typeof a === 'string') {
          (globalThis as { console?: { warn?: (msg: string) => void } }).console?.warn?.(a);
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
}));
interface DegradedLogPayload {
  tag: string;
  reason: string;
  errorMessage: string;
  errorName: string;
  hasResponseHeaders: boolean;
  willingWrite: boolean;
}

function parseDegradedLog(): DegradedLogPayload[] {
  return mockWarnCalls
    .filter(([, extra]) => extra?.tag === 'kloel_onboarding_degraded')
    .map(([, extra]) => extra as unknown as DegradedLogPayload);
}
const FALLBACK_REPLY =
  'Tive uma instabilidade momentânea pra processar agora. Pode repetir a mensagem em alguns segundos? Estou aqui pra continuar o onboarding.';

function expectDegradedLog(
  expectedReason: string,
  expectedErrorName: string,
  expectedErrorMessage: string,
): void {
  const logs = parseDegradedLog();
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    tag: 'kloel_onboarding_degraded',
    reason: expectedReason,
    errorName: expectedErrorName,
    errorMessage: expectedErrorMessage,
    hasResponseHeaders: false,
    willingWrite: false,
  });
}
describe('ConversationalOnboardingService degraded logging', () => {
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

  beforeEach(async () => {
    mockWarnCalls.length = 0;

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
          readinessTruth: {
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

    process.env.OPENAI_API_KEY = 'sk-test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationalOnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        {
          provide: ConversationalOnboardingToolsService,
          useValue: toolsService,
        },
        { provide: AbiBuilderService, useValue: abiBuilder },
      ],
    }).compile();

    service = module.get<ConversationalOnboardingService>(ConversationalOnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.KLOEL_ONBOARDING_USE_ABI;
  });
  describe('token_budget', () => {
    beforeEach(() => {
      planLimits.ensureTokenBudget.mockRejectedValue(new Error('Token budget exceeded'));
    });

    it('returns FALLBACK_REPLY unchanged', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe(FALLBACK_REPLY);
    });

    it('emits kloel_onboarding_degraded with reason=token_budget', async () => {
      await service.chat('ws-1', 'Olá');
      expectDegradedLog('token_budget', 'Error', 'Token budget exceeded');
    });
  });
  describe('llm_call', () => {
    beforeEach(() => {
      chatCompletionWithRetryMock.mockRejectedValue(new Error('OpenAI rate limit'));
    });

    it('returns FALLBACK_REPLY unchanged', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe(FALLBACK_REPLY);
    });

    it('emits kloel_onboarding_degraded with reason=llm_call', async () => {
      await service.chat('ws-1', 'Olá');
      expectDegradedLog('llm_call', 'Error', 'OpenAI rate limit');
    });
  });
  describe('tool_execution', () => {
    beforeEach(() => {
      chatCompletionWithRetryMock.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  function: {
                    name: 'save_business_info',
                    arguments: '{"businessName":"Loja"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 300 },
      });
      toolsService.executeToolCall.mockRejectedValue(new Error('Tool execution failed'));
    });

    it('returns FALLBACK_REPLY unchanged', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe(FALLBACK_REPLY);
    });

    it('emits kloel_onboarding_degraded with reason=tool_execution', async () => {
      await service.chat('ws-1', 'Olá');
      expectDegradedLog('tool_execution', 'Error', 'Tool execution failed');
    });
  });
  describe('persist', () => {
    beforeEach(() => {
      toolsService.saveOnboardingMessage.mockRejectedValue(new Error('DB write failed'));
    });

    it('returns FALLBACK_REPLY unchanged', async () => {
      const result = await service.chat('ws-1', 'Olá');
      expect(result).toBe(FALLBACK_REPLY);
    });

    it('emits kloel_onboarding_degraded with reason=persist', async () => {
      await service.chat('ws-1', 'Olá');
      expectDegradedLog('persist', 'Error', 'DB write failed');
    });
  });
  describe('sse_write', () => {
    beforeEach(() => {
      chatCompletionWithRetryMock.mockResolvedValue({
        choices: [{ message: { content: 'Bem-vindo!', tool_calls: null } }],
        usage: { total_tokens: 100 },
      });
    });

    it('emits kloel_onboarding_degraded with reason=sse_write when res.write throws', async () => {
      const res = {
        setHeader: jest.fn(),
        write: jest.fn().mockImplementation(() => {
          throw new Error('Socket closed');
        }),
        end: jest.fn(),
      } as unknown as import('express').Response;

      try {
        await service.chat('ws-1', 'Olá', res);
      } catch {
        // sse_write failure propagates even through fallback path when res provided
      }

      const logs = parseDegradedLog();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        tag: 'kloel_onboarding_degraded',
        reason: 'sse_write',
        errorName: 'Error',
        errorMessage: 'Socket closed',
        hasResponseHeaders: true,
        willingWrite: true,
      });
    });
  });
  describe('log shape', () => {
    beforeEach(() => {
      chatCompletionWithRetryMock.mockRejectedValue(new TypeError('Network timeout'));
    });

    it('includes errorName from constructor', async () => {
      await service.chat('ws-1', 'Olá');
      const logs = parseDegradedLog();
      expect(logs[0].errorName).toBe('TypeError');
      expect(logs[0].errorMessage).toBe('Network timeout');
    });

    it('has hasResponseHeaders=false when no res', async () => {
      await service.chat('ws-1', 'Olá');
      const logs = parseDegradedLog();
      expect(logs[0].hasResponseHeaders).toBe(false);
      expect(logs[0].willingWrite).toBe(false);
    });
  });
});
