import { Test, TestingModule } from '@nestjs/testing';
import { KloelThreadSummaryService } from './kloel-thread-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('gpt-4o-mini'),
}));

type SummaryPrismaMock = {
  chatThread: { findFirst: jest.Mock; updateMany: jest.Mock };
  chatMessage: { count: jest.Mock; findMany: jest.Mock };
};

describe('KloelThreadSummaryService', () => {
  let service: KloelThreadSummaryService;
  let prisma: SummaryPrismaMock;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;
  const { chatCompletionWithFallback } = require('./openai-wrapper');
  const { resolveBackendOpenAIModel } = require('../lib/openai-models');
  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        count: undefined as unknown as jest.Mock,
        findMany: jest.fn().mockResolvedValue([]),
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
    resolveBackendOpenAIModel.mockReturnValue('gpt-4o-mini');
    chatCompletionWithFallback.mockResolvedValue({
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
      const openai = {} as any;
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
      const openai = {} as any;

      const title = await service.generateConversationTitle(
        'Preciso de ajuda com a configuração do sistema',
        wsId,
        openai,
      );

      expect(chatCompletionWithFallback).toHaveBeenCalled();
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(wsId);
      expect(title).toBe('Título da conversa');
    });

    it('tracks AI usage after title generation', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      const openai = {} as any;

      await service.generateConversationTitle('Mensagem de teste', wsId, openai);

      expect(planLimits.trackAiUsage).toHaveBeenCalledWith(wsId, expect.any(Number));
    });

    it('returns fallback when OpenAI call fails', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      chatCompletionWithFallback.mockRejectedValueOnce(new Error('API error'));
      const openai = {} as any;

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
        {} as any,
      );
      expect(result).toBe('Suporte Técnico');
    });

    it('returns current title when message is not substantive', async () => {
      const result = await service.maybeGenerateThreadTitle(
        'thread-1',
        'Nova conversa',
        'oi',
        wsId,
        {} as any,
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
        {} as any,
      );

      expect(result).toBe('Título da conversa');
      expect(prisma.chatThread.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1', workspaceId: wsId },
          data: expect.objectContaining({ title: 'Título da conversa' }),
        }),
      );
    });
  });

  describe('maybeRefreshThreadSummary', () => {
    it('returns early when threadId is null', async () => {
      await service.maybeRefreshThreadSummary(null, wsId, {} as any);
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
      prisma.chatMessage.count = jest.fn().mockResolvedValue(10);

      await service.maybeRefreshThreadSummary('thread-1', wsId, {} as any);

      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it('refreshes summary when messages exceed limit and no existing summary', async () => {
      jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: 'sk-test' });
      prisma.chatThread.findFirst.mockResolvedValueOnce({
        id: 'thread-1',
        summary: null,
        summaryUpdatedAt: null,
      });
      prisma.chatMessage.count = jest.fn().mockResolvedValue(30);
      prisma.chatMessage.findMany.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        })),
      );

      await service.maybeRefreshThreadSummary('thread-1', wsId, {} as any);

      expect(chatCompletionWithFallback).toHaveBeenCalled();
      expect(prisma.chatThread.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1', workspaceId: wsId },
          data: expect.objectContaining({
            summary: expect.any(String),
            summaryUpdatedAt: expect.any(Date),
          }),
        }),
      );
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
        {} as any,
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
      prisma.chatMessage.count = jest.fn().mockResolvedValue(30);
      prisma.chatMessage.findMany.mockResolvedValueOnce([{ role: 'user', content: 'test' }]);

      await service.maybeRefreshThreadSummary('thread-1', 'ws-isolated', {} as any);

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
      chatCompletionWithFallback.mockRejectedValue(new Error('Network error'));
      const openai = {} as any;

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
