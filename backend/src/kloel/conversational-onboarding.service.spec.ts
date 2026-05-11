import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { PrismaService } from '../prisma/prisma.service';

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
      ],
    }).compile();

    service = module.get<ConversationalOnboardingService>(ConversationalOnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
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
        expect.any(String),
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
      const res = { setHeader, write, end } as unknown as import('express').Response;

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

      const result = (await service.getStatus('ws-1')) as {
        completed: boolean;
        messagesCount: number;
        hasStarted: boolean;
      };

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
        expect.any(String),
        expect.any(String),
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
