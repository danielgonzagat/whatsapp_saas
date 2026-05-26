import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbiBuilderService } from './abi/abi-builder.service';

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

type OnboardingPrismaMock = {
  kloelMemory: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('ConversationalOnboardingService', () => {
  let service: ConversationalOnboardingService;
  let toolsService: {
    getOnboardingHistory: jest.Mock;
    executeToolCall: jest.Mock;
    saveOnboardingMessage: jest.Mock;
    clearOnboardingHistory: jest.Mock;
    toErrorMessage: jest.Mock;
  };
  let planLimits: { ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };
  let prisma: OnboardingPrismaMock;
  let chatCompletionWithRetryMock: jest.Mock;
  let abiBuilder: { build: jest.Mock };

  beforeEach(async () => {
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
            operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
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
          capabilities: {
            available: [],
            restricted: [],
          },
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
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          kloelMemory: prisma.kloelMemory,
        }),
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
        { provide: ConversationalOnboardingToolsService, useValue: toolsService },
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

  describe('start', () => {
    it('clears history and sends welcome message', async () => {
      const response = await service.start('ws-1');

      expect(toolsService.clearOnboardingHistory).toHaveBeenCalledWith('ws-1');
      expect(response).toContain('Bem-vindo');
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('chat', () => {
    it('sends user message and returns assistant response', async () => {
      const response = await service.chat('ws-1', 'Olá, quero configurar');

      expect(response).toContain('Bem-vindo');
      expect(toolsService.getOnboardingHistory).toHaveBeenCalledWith('ws-1');
      expect(toolsService.saveOnboardingMessage).toHaveBeenCalledWith(
        'ws-1',
        'user',
        'Olá, quero configurar',
      );
      expect(toolsService.saveOnboardingMessage).toHaveBeenCalledWith(
        'ws-1',
        'assistant',
        expect.stringMatching(/.+/),
      );
    });

    it('keeps legacy onboarding prompt as system message when ABI flag is off', async () => {
      await service.chat('ws-1', 'Olá');

      const completionInput = chatCompletionWithRetryMock.mock.calls[0]?.[1] as {
        messages: Array<{ role: string; content: string | null }>;
      };

      expect(completionInput.messages[0]).toEqual(
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('MODO: ONBOARDING CONVERSACIONAL'),
        }),
      );
      expect(abiBuilder.build).not.toHaveBeenCalled();
    });

    it('uses ABI state as non-system onboarding message when flag is on', async () => {
      process.env.KLOEL_ONBOARDING_USE_ABI = 'on';

      await service.chat('ws-1', 'Olá');

      const completionInput = chatCompletionWithRetryMock.mock.calls[0]?.[1] as {
        messages: Array<{ role: string; content: string | null }>;
      };
      const firstMessage = completionInput.messages[0];

      expect(firstMessage?.role).toBe('user');
      expect(firstMessage?.content).toContain('cognitiveStateAbi');
      expect(completionInput.messages).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ role: 'system' })]),
      );
      expect(abiBuilder.build).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'public',
          currentInput: expect.objectContaining({
            raw: 'Olá',
            channel: 'conversational_onboarding',
          }),
          perceptionSnapshot: expect.objectContaining({
            channel: 'conversational_onboarding',
            workspaceId: 'ws-1',
            activeStage: 'onboarding',
          }),
        }),
      );
    });

    it('handles tool calls from assistant response', async () => {
      chatCompletionWithRetryMock
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    function: { name: 'save_business_info', arguments: '{"businessName":"Loja"}' },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 300 },
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'Negócio salvo! Próximo passo...',
                tool_calls: null,
              },
            },
          ],
          usage: { total_tokens: 150 },
        });

      const response = await service.chat('ws-1', 'O nome é Loja');

      expect(toolsService.executeToolCall).toHaveBeenCalledWith('ws-1', 'save_business_info', {
        businessName: 'Loja',
      });
      expect(response).toBe('Negócio salvo! Próximo passo...');
    });

    it('handles SSE streaming when res is provided', async () => {
      const write = jest.fn();
      const end = jest.fn();
      const setHeader = jest.fn();
      const res = { setHeader, write, end } as import('express').Response;

      await service.chat('ws-1', 'Olá', res);

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(write).toHaveBeenCalled();
      expect(end).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns completed: false when onboarding not finished', async () => {
      const result = await service.getStatus('ws-1');

      expect(result).toEqual({
        completed: false,
        messagesCount: 0,
        hasStarted: false,
      });
    });

    it('returns completed: true when onboarding is done', async () => {
      prisma.kloelMemory.findUnique.mockResolvedValue({
        workspaceId_key: { workspaceId: 'ws-1', key: 'onboarding_completed' },
        value: true,
      });
      prisma.kloelMemory.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);

      const result = (await service.getStatus('ws-1'));

      expect(result.completed).toBe(true);
      expect(result.messagesCount).toBe(2);
      expect(result.hasStarted).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('getStatus scopes transaction to workspaceId', async () => {
      await service.getStatus('ws-isolated');

      expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_key: {
            workspaceId: 'ws-isolated',
            key: 'onboarding_completed',
          },
        },
      });
    });

    it('chat passes workspaceId to tools service', async () => {
      await service.chat('ws-tenant', 'Olá');

      expect(toolsService.getOnboardingHistory).toHaveBeenCalledWith('ws-tenant');
      expect(toolsService.saveOnboardingMessage).toHaveBeenCalledWith(
        'ws-tenant',
        expect.stringMatching('assistant|user'),
        expect.stringMatching(/.+/),
      );
    });
  });

  describe('upstream errors', () => {
    it('throws when OpenAI call fails', async () => {
      chatCompletionWithRetryMock.mockRejectedValueOnce(new Error('OpenAI rate limit'));

      await expect(service.chat('ws-1', 'Teste')).rejects.toThrow('OpenAI rate limit');
    });
  });
});
