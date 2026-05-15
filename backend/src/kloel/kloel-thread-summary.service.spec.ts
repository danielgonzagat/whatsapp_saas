import { Test, TestingModule } from '@nestjs/testing';
import OpenAI from 'openai';
import { KloelThreadSummaryService } from './kloel-thread-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { CANONICAL_MODEL_IDS, resolveBackendOpenAIModel } from '../lib/openai-models';
import { chatCompletionWithFallback } from './openai-wrapper';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn().mockReturnValue(actual.CANONICAL_MODEL_IDS.openAiTextMini),
  };
});

type UpdateManyArg = {
  where: { id: string; workspaceId: string };
  data: Record<string, unknown>;
};

type PrismaCallArg = Record<string, unknown>;

type SummaryPrismaMock = {
  chatThread: {
    findFirst: jest.Mock<Promise<PrismaCallArg | null>, [PrismaCallArg]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArg]>;
  };
  chatMessage: {
    count: jest.Mock<Promise<number>, [PrismaCallArg]>;
    findMany: jest.Mock<Promise<PrismaCallArg[]>, [PrismaCallArg]>;
  };
};

const mockOpenai: OpenAI = new OpenAI({ apiKey: 'test-key' });
const makeChatThreadFindFirstMock = () =>
  jest.fn<Promise<PrismaCallArg | null>, [PrismaCallArg]>().mockResolvedValue(null);
const makeChatThreadUpdateManyMock = () =>
  jest.fn<Promise<{ count: number }>, [UpdateManyArg]>().mockResolvedValue({ count: 1 });
const makeChatMessageCountMock = (count = 0) =>
  jest.fn<Promise<number>, [PrismaCallArg]>().mockResolvedValue(count);
const makeChatMessageFindManyMock = () =>
  jest.fn<Promise<PrismaCallArg[]>, [PrismaCallArg]>().mockResolvedValue([]);

describe('KloelThreadSummaryService', () => {
  let service: KloelThreadSummaryService;
  let prisma: SummaryPrismaMock;
  let planLimits: { ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };
  let opsAlert: { alertOnCriticalError: jest.Mock };
  const chatCompletionWithFallbackMock = jest.mocked(chatCompletionWithFallback);
  const resolveBackendOpenAIModelMock = jest.mocked(resolveBackendOpenAIModel);
  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      chatThread: {
        findFirst: makeChatThreadFindFirstMock(),
        updateMany: makeChatThreadUpdateManyMock(),
      },
      chatMessage: {
        count: makeChatMessageCountMock(),
        findMany: makeChatMessageFindManyMock(),
      },
    };

    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };

    jest.clearAllMocks();
    resolveBackendOpenAIModelMock.mockReturnValue(CANONICAL_MODEL_IDS.openAiTextMini);
    chatCompletionWithFallbackMock.mockResolvedValue({
      choices: [{ message: { content: 'Título da conversa' } }],
      usage: { total_tokens: 64 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelThreadSummaryService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<KloelThreadSummaryService>(KloelThreadSummaryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeGeneratedThreadTitle', () => {
    it('removes surrounding quotes and trailing punctuation', () => {
      const result = service.sanitizeGeneratedThreadTitle('"Olá mundo!"');
      expect(result).toBe('Olá mundo');
    });

    it('returns "Nova conversa" for empty/null/whitespace', () => {
      expect(service.sanitizeGeneratedThreadTitle(null)).toBe('Nova conversa');
      expect(service.sanitizeGeneratedThreadTitle('')).toBe('Nova conversa');
      expect(service.sanitizeGeneratedThreadTitle('   ')).toBe('Nova conversa');
    });

    it('truncates to 60 characters', () => {
      const longTitle = 'A'.repeat(100);
      const result = service.sanitizeGeneratedThreadTitle(longTitle);
      expect(result.length).toBeLessThanOrEqual(60);
    });
  });

  describe('isDefaultThreadTitle', () => {
    it('returns true for null/empty/whitespace', () => {
      expect(service.isDefaultThreadTitle(null)).toBe(true);
      expect(service.isDefaultThreadTitle('')).toBe(true);
    });

    it('returns true for "Nova conversa"', () => {
      expect(service.isDefaultThreadTitle('Nova conversa')).toBe(true);
      expect(service.isDefaultThreadTitle('nova conversa')).toBe(true);
    });

    it('returns false for custom titles', () => {
      expect(service.isDefaultThreadTitle('Suporte Técnico')).toBe(false);
    });
  });

  describe('isSubstantiveMessage', () => {
    it('returns false for empty/whitespace', () => {
      expect(service.isSubstantiveMessage('')).toBe(false);
      expect(service.isSubstantiveMessage('   ')).toBe(false);
    });

    it('returns true for messages >= 40 characters', () => {
      expect(service.isSubstantiveMessage('A'.repeat(40))).toBe(true);
    });

    it('returns true for messages with newlines', () => {
      expect(service.isSubstantiveMessage('Olá\ncomo vai?')).toBe(true);
    });

    it('returns true for messages with 8+ words', () => {
      expect(service.isSubstantiveMessage('um dois tres quatro cinco seis sete oito')).toBe(true);
    });

    it('returns false for short non-substantive messages', () => {
      expect(service.isSubstantiveMessage('oi')).toBe(false);
    });
  });

  describe('generateConversationTitle', () => {
    it('returns fallback when no openai instance is provided', async () => {
      const title = await service.generateConversationTitle(
        'Minha mensagem longa o suficiente',
        wsId,
      );
      expect(title).toBe('Minha mensagem longa o suficiente');
    });

    it('returns fallback when no API keys are set', async () => {
      const openai = mockOpenai;
      jest.replaceProperty(process, 'env', {
        ...process.env,
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
      });
      const title = await service.generateConversationTitle(
        'Mensagem de teste sobre suporte técnico',
        wsId,
        openai,
      );
      expect(title).toBe('Mensagem de teste sobre suporte');
    });

    it('generates title via OpenAI when keys exist and openai provided', async () => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        OPENAI_API_KEY: 'sk-test',
        ANTHROPIC_API_KEY: '',
      });
      const openai = mockOpenai;

      const title = await service.generateConversationTitle(
        'Preciso de ajuda com a configuração do sistema',
        wsId,
        openai,
      );

      expect(chatCompletionWithFallbackMock).toHaveBeenCalled();
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(wsId);
      expect(title).toBe('Título da conversa');
    });

    it('tracks AI usage after title generation', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      const openai = mockOpenai;

      await service.generateConversationTitle('Mensagem de teste', wsId, openai);

      const [[, trackTokenCount]] = planLimits.trackAiUsage.mock.calls as [[string, number]];
      expect(typeof trackTokenCount).toBe('number');
    });

    it('returns fallback when OpenAI call fails', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      chatCompletionWithFallbackMock.mockRejectedValueOnce(new Error('API error'));
      const openai = mockOpenai;

      const title = await service.generateConversationTitle(
        'Mensagem com conteúdo suficiente para fallback',
        wsId,
        openai,
      );

      expect(title).toBeTruthy();
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
    });
  });

  describe('maybeGenerateThreadTitle', () => {
    it('returns current title when it is not default', async () => {
      const result = await service.maybeGenerateThreadTitle(
        'thread-1',
        'Suporte Técnico',
        'Mensagem qualquer',
        wsId,
        mockOpenai,
      );
      expect(result).toBe('Suporte Técnico');
    });

    it('returns current title when message is not substantive', async () => {
      const result = await service.maybeGenerateThreadTitle(
        'thread-1',
        'Nova conversa',
        'oi',
        wsId,
        mockOpenai,
      );
      expect(result).toBe('Nova conversa');
    });

    it('generates and persists title for default title + substantive message', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });

      const result = await service.maybeGenerateThreadTitle(
        'thread-1',
        'Nova conversa',
        'Preciso de ajuda com a configuração do sistema',
        wsId,
        mockOpenai,
      );

      expect(result).toBe('Título da conversa');
      const [[updateArg]] = prisma.chatThread.updateMany.mock.calls;
      expect(updateArg).toMatchObject({
        where: { id: 'thread-1', workspaceId: wsId },
        data: { title: 'Título da conversa' },
      });
    });
  });

  describe('maybeRefreshThreadSummary', () => {
    it('returns early when threadId is null', async () => {
      await service.maybeRefreshThreadSummary(null, wsId, mockOpenai);
      expect(prisma.chatThread.findFirst).not.toHaveBeenCalled();
    });

    it('returns early when workspaceId is undefined', async () => {
      await service.maybeRefreshThreadSummary('thread-1');
      expect(prisma.chatThread.findFirst).not.toHaveBeenCalled();
    });

    it('returns early when total messages <= recent limit', async () => {
      prisma.chatThread.findFirst.mockResolvedValueOnce({
        id: 'thread-1',
        summary: null,
        summaryUpdatedAt: null,
      });
      prisma.chatMessage.count = makeChatMessageCountMock(10);

      await service.maybeRefreshThreadSummary('thread-1', wsId, mockOpenai);

      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it('refreshes summary when messages exceed limit and no existing summary', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      prisma.chatThread.findFirst.mockResolvedValueOnce({
        id: 'thread-1',
        summary: null,
        summaryUpdatedAt: null,
      });
      prisma.chatMessage.count = makeChatMessageCountMock(30);
      prisma.chatMessage.findMany.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        })),
      );

      await service.maybeRefreshThreadSummary('thread-1', wsId, mockOpenai);

      expect(chatCompletionWithFallbackMock).toHaveBeenCalled();
      const [[refreshUpdateArg]] = prisma.chatThread.updateMany.mock.calls as [[UpdateManyArg]];
      expect(refreshUpdateArg.where).toEqual({ id: 'thread-1', workspaceId: wsId });
      expect(typeof refreshUpdateArg.data.summary).toBe('string');
      expect(refreshUpdateArg.data.summaryUpdatedAt).toBeInstanceOf(Date);
    });
  });

  describe('tenant isolation', () => {
    it('maybeGenerateThreadTitle updates thread with correct workspaceId', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });

      await service.maybeGenerateThreadTitle(
        'thread-1',
        'Nova conversa',
        'Mensagem substantiva suficiente para gerar título',
        'ws-isolated',
        mockOpenai,
      );

      expect(prisma.chatThread.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1', workspaceId: 'ws-isolated' },
        }),
      );
    });

    it('maybeRefreshThreadSummary filters by workspaceId', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      prisma.chatThread.findFirst.mockResolvedValueOnce({
        id: 'thread-1',
        summary: null,
        summaryUpdatedAt: null,
      });
      prisma.chatMessage.count = makeChatMessageCountMock(30);
      prisma.chatMessage.findMany.mockResolvedValueOnce([{ role: 'user', content: 'test' }]);

      await service.maybeRefreshThreadSummary('thread-1', 'ws-isolated', mockOpenai);

      expect(prisma.chatThread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1', workspaceId: 'ws-isolated' },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('generateConversationTitle falls back when OpenAI throws', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      chatCompletionWithFallbackMock.mockRejectedValue(new Error('Network error'));
      const openai = mockOpenai;

      const title = await service.generateConversationTitle(
        'Mensagem com conteúdo suficiente',
        wsId,
        openai,
      );

      expect(title).toBeTruthy();
      expect(title).not.toBe('Nova conversa');
    });
  });
});
