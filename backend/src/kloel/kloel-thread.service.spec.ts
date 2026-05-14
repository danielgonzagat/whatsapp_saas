import { Test, TestingModule } from '@nestjs/testing';
import { KloelThreadService } from './kloel-thread.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelThreadSummaryService } from './kloel-thread-summary.service';

type ThreadPrismaMock = {
  chatThread: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  chatMessage: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

describe('KloelThreadService', () => {
  let service: KloelThreadService;
  let prisma: ThreadPrismaMock;
  let summaryService: Pick<
    KloelThreadSummaryService,
    'maybeGenerateThreadTitle' | 'maybeRefreshThreadSummary'
  >;
  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'thread-1',
          title: 'Nova conversa',
          summary: null,
          summaryUpdatedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    summaryService = {
      maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Título'),
      maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelThreadService,
        { provide: PrismaService, useValue: prisma },
        { provide: KloelThreadSummaryService, useValue: summaryService },
      ],
    }).compile();

    service = module.get<KloelThreadService>(KloelThreadService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveThread', () => {
    it('returns null when workspaceId is empty', async () => {
      const result = await service.resolveThread('');
      expect(result).toBeNull();
    });

    it('returns existing thread when conversationId provided and found', async () => {
      prisma.chatThread.findFirst.mockResolvedValueOnce({
        id: 'existing-thread',
        title: 'Conversa existente',
        summary: 'Resumo',
        summaryUpdatedAt: new Date(),
      });

      const result = await service.resolveThread(wsId, 'existing-thread');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'existing-thread',
          title: 'Conversa existente',
        }),
      );
      expect(prisma.chatThread.findFirst).toHaveBeenCalledWith({
        where: { id: 'existing-thread', workspaceId: wsId },
        select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
      });
    });

    it('creates new thread when conversationId not found', async () => {
      prisma.chatThread.findFirst.mockResolvedValueOnce(null);

      const result = await service.resolveThread(wsId, 'nonexistent');

      expect(prisma.chatThread.create).toHaveBeenCalledWith({
        data: { workspaceId: wsId, title: 'Nova conversa' },
        select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
      });
      expect(result).toEqual(expect.objectContaining({ id: 'thread-1' }));
    });

    it('creates new thread when no conversationId provided', async () => {
      const result = await service.resolveThread(wsId);

      expect(prisma.chatThread.create).toHaveBeenCalledWith({
        data: { workspaceId: wsId, title: 'Nova conversa' },
        select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
      });
      expect(result).toEqual(expect.objectContaining({ id: 'thread-1' }));
    });

    it('creates thread with correct workspaceId', async () => {
      await service.resolveThread('ws-tenant');
      expect(prisma.chatThread.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { workspaceId: 'ws-tenant', title: 'Nova conversa' },
        }),
      );
    });
  });

  describe('getThreadConversationHistory', () => {
    it('returns empty array when threadId is empty', async () => {
      const result = await service.getThreadConversationHistory('');
      expect(result).toEqual([]);
    });

    it('returns messages in chronological order (reversed from DB)', async () => {
      prisma.chatMessage.findMany.mockResolvedValueOnce([
        { role: 'assistant', content: 'Resposta' },
        { role: 'user', content: 'Pergunta' },
      ]);

      const result = await service.getThreadConversationHistory('thread-1', wsId);

      expect(result).toEqual([
        { role: 'user', content: 'Pergunta' },
        { role: 'assistant', content: 'Resposta' },
      ]);
    });

    it('filters by workspaceId when provided', async () => {
      await service.getThreadConversationHistory('thread-1', 'ws-tenant');

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { threadId: 'thread-1', thread: { workspaceId: 'ws-tenant' } },
        }),
      );
    });

    it('does not filter by workspaceId when not provided', async () => {
      await service.getThreadConversationHistory('thread-1');

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { threadId: 'thread-1' },
        }),
      );
    });
  });

  describe('getThreadConversationState', () => {
    it('returns empty state when threadId is null', async () => {
      const result = await service.getThreadConversationState(null);
      expect(result).toEqual({ recentMessages: [], totalMessages: 0 });
    });

    it('returns empty state when workspaceId is null', async () => {
      const result = await service.getThreadConversationState('thread-1', null);
      expect(result).toEqual({ recentMessages: [], totalMessages: 0 });
    });

    it('returns summary and recent messages when thread exists', async () => {
      prisma.chatThread.findFirst.mockResolvedValueOnce({
        summary: 'Resumo de teste',
        summaryUpdatedAt: new Date(),
      });
      prisma.chatMessage.count = jest.fn().mockResolvedValue(5);
      prisma.chatMessage.findMany.mockResolvedValueOnce([{ role: 'user', content: 'Olá' }]);

      const result = await service.getThreadConversationState('thread-1', wsId);

      expect(result.summary).toBe('Resumo de teste');
      expect(result.totalMessages).toBe(5);
      expect(result.recentMessages).toHaveLength(1);
    });
  });

  describe('persistUserThreadMessage', () => {
    it('returns null when threadId is empty', async () => {
      const result = await service.persistUserThreadMessage('', wsId, 'Hello');
      expect(result).toBeNull();
    });

    it('creates message and touches thread', async () => {
      const result = await service.persistUserThreadMessage(
        'thread-1',
        wsId,
        'Mensagem do usuário',
      );

      const createDataMatcher: Record<string, unknown> = expect.objectContaining({
        role: 'user',
        content: 'Mensagem do usuário',
        workspaceId: wsId,
      });
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: createDataMatcher,
        }),
      );
      expect(prisma.chatThread.updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-1', workspaceId: wsId },
        data: expect.objectContaining({}),
      });
      const touchCall = prisma.chatThread.updateMany.mock.calls[0][0] as {
        data: { updatedAt: Date };
      };
      expect(touchCall.data.updatedAt).toBeInstanceOf(Date);
      expect(result).toEqual({ id: 'msg-1' });
    });

    it('includes metadata when provided', async () => {
      const metadata = { clientRequestId: 'req-1' };

      await service.persistUserThreadMessage('thread-1', wsId, 'Hello', metadata);

      const metadataDataMatcher: Record<string, unknown> = expect.objectContaining({ metadata });
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: metadataDataMatcher,
        }),
      );
    });
  });

  describe('persistAssistantThreadMessage', () => {
    it('returns null when threadId is empty', async () => {
      const result = await service.persistAssistantThreadMessage('', wsId, 'Response');
      expect(result).toBeNull();
    });

    it('creates assistant message with correct role', async () => {
      await service.persistAssistantThreadMessage('thread-1', wsId, 'Resposta do assistente');

      const assistantDataMatcher: Record<string, unknown> = expect.objectContaining({
        role: 'assistant',
        content: 'Resposta do assistente',
      });
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: assistantDataMatcher,
        }),
      );
    });
  });

  describe('buildStoredResponseVersions', () => {
    it('returns empty array for null/undefined metadata', () => {
      const result = service.buildStoredResponseVersions(null);
      expect(result).toEqual([]);
    });

    it('returns empty array for non-object metadata', () => {
      const result = service.buildStoredResponseVersions('string');
      expect(result).toEqual([]);
    });

    it('returns fallback version when no versions in metadata', () => {
      const result = service.buildStoredResponseVersions({}, 'Fallback content', 'fb-1');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Fallback content');
      expect(result[0].id).toBe('fb-1');
    });

    it('returns empty when no versions and no fallback content', () => {
      const result = service.buildStoredResponseVersions({});
      expect(result).toEqual([]);
    });

    it('parses responseVersions from metadata', () => {
      const metadata = {
        responseVersions: [
          { id: 'v1', content: 'Version 1', createdAt: '2024-01-01', source: 'initial' },
        ],
      };
      const result = service.buildStoredResponseVersions(metadata);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Version 1');
    });

    it('filters out invalid version entries', () => {
      const metadata = {
        responseVersions: [
          { not: 'valid' },
          { id: 'v1', content: 'Ok', createdAt: '2024-01-01', source: 'initial' },
        ],
      };
      const result = service.buildStoredResponseVersions(metadata);
      expect(result).toHaveLength(1);
    });
  });

  describe('buildProcessingTraceSummary', () => {
    it('returns undefined for empty entries', () => {
      const result = service.buildProcessingTraceSummary([]);
      expect(result).toBeUndefined();
    });

    it('returns single label when one entry', () => {
      const entries = [
        {
          id: '1',
          kind: 'status' as const,
          phase: 'thinking' as const,
          label: 'Pensando',
          createdAt: '',
        },
      ];
      const result = service.buildProcessingTraceSummary(entries);
      expect(result).toContain('Pensando');
    });

    it('returns compound label for multiple entries', () => {
      const entries = [
        {
          id: '1',
          kind: 'status' as const,
          phase: 'thinking' as const,
          label: 'Pensando',
          createdAt: '',
        },
        {
          id: '2',
          kind: 'tool_call' as const,
          phase: 'tool_calling' as const,
          label: 'Buscando',
          createdAt: '',
        },
        {
          id: '3',
          kind: 'tool_result' as const,
          phase: 'tool_result' as const,
          label: 'Respondendo',
          createdAt: '',
        },
      ];
      const result = service.buildProcessingTraceSummary(entries);
      expect(result).toContain('Pensando');
      expect(result).toContain('buscando');
      expect(result).toContain('respondendo');
    });
  });

  describe('delegation to summary service', () => {
    it('maybeGenerateThreadTitle delegates to KloelThreadSummaryService', async () => {
      summaryService.maybeGenerateThreadTitle = jest.fn().mockResolvedValue('Generated Title');

      const result = await service.maybeGenerateThreadTitle(
        'thread-1',
        'Nova conversa',
        'First message',
        wsId,
      );

      expect(summaryService.maybeGenerateThreadTitle).toHaveBeenCalledWith(
        'thread-1',
        'Nova conversa',
        'First message',
        wsId,
        undefined,
      );
      expect(result).toBe('Generated Title');
    });

    it('maybeRefreshThreadSummary delegates to KloelThreadSummaryService', async () => {
      await service.maybeRefreshThreadSummary('thread-1', wsId);

      expect(summaryService.maybeRefreshThreadSummary).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        undefined,
      );
    });
  });

  describe('tenant isolation', () => {
    it('resolveThread creates thread with correct workspaceId', async () => {
      await service.resolveThread('ws-tenant');
      const resolveDataMatcher: Record<string, unknown> = expect.objectContaining({
        workspaceId: 'ws-tenant',
      });
      expect(prisma.chatThread.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: resolveDataMatcher,
        }),
      );
    });

    it('persistUserThreadMessage uses correct workspaceId', async () => {
      await service.persistUserThreadMessage('thread-1', 'ws-tenant', 'msg');
      const persistDataMatcher: Record<string, unknown> = expect.objectContaining({
        workspaceId: 'ws-tenant',
      });
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: persistDataMatcher,
        }),
      );
    });

    it('touchThread filters by workspaceId', async () => {
      await service.touchThread('thread-1', 'ws-tenant');
      expect(prisma.chatThread.updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-1', workspaceId: 'ws-tenant' },
        data: expect.objectContaining({}),
      });
      const touchCall = prisma.chatThread.updateMany.mock.calls[0][0] as {
        data: { updatedAt: Date };
      };
      expect(touchCall.data.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('persistUserThreadMessage propagates Prisma error', async () => {
      prisma.chatMessage.create.mockRejectedValue(new Error('DB error'));
      await expect(service.persistUserThreadMessage('thread-1', wsId, 'msg')).rejects.toThrow(
        'DB error',
      );
    });

    it('resolveThread propagates create error', async () => {
      prisma.chatThread.create.mockRejectedValue(new Error('Create failed'));
      await expect(service.resolveThread(wsId)).rejects.toThrow('Create failed');
    });
  });
});
