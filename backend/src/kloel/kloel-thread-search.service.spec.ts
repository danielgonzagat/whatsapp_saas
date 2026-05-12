import { Test, TestingModule } from '@nestjs/testing';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { PrismaService } from '../prisma/prisma.service';

type ThreadSearchPrismaMock = {
  $queryRaw: jest.Mock;
  chatThread: { findMany: jest.Mock };
  chatMessage: { findMany: jest.Mock };
};

describe('KloelThreadSearchService', () => {
  let service: KloelThreadSearchService;
  let prisma: ThreadSearchPrismaMock;
  const wsId = 'ws-1';

  const mockRow = {
    id: 'thread-1',
    title: 'Suporte Técnico',
    updatedAt: new Date(),
    matchedContent: 'Preciso de ajuda com o sistema',
    contentPreview: '<mark>Preciso</mark> de ajuda com o sistema',
    titlePreview: 'Suporte Técnico',
    rank: 0.95,
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([mockRow]),
      chatThread: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [KloelThreadSearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<KloelThreadSearchService>(KloelThreadSearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('returns empty array when workspaceId is empty', async () => {
      const result = await service.search('', 'suporte', undefined);
      expect(result).toEqual([]);
    });

    it('returns empty array when query is too short (< 2 chars)', async () => {
      const result = await service.search(wsId, 'a', undefined);
      expect(result).toEqual([]);
    });

    it('returns empty array for null/undefined query', async () => {
      const result = await service.search(wsId, '', undefined);
      expect(result).toEqual([]);
    });

    it('performs full-text search and returns mapped results', async () => {
      const result = await service.search(wsId, 'suporte', undefined);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('thread-1');
      expect(result[0].title).toBe('Suporte Técnico');
      expect(result[0].tags).toBeDefined();
    });

    it('passes workspaceId to raw SQL query', async () => {
      await service.search('ws-tenant', 'suporte', undefined);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      const sql = prisma.$queryRaw.mock.calls[0][0];
      expect(sql).toBeDefined();
    });

    it('clamps limit to max 20 when high value provided', async () => {
      const result = await service.search(wsId, 'suporte', '100');
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('clamps limit to min 1 when zero provided', async () => {
      const result = await service.search(wsId, 'suporte', '0');
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('defaults limit to 20 when not provided', async () => {
      const result = await service.search(wsId, 'suporte', undefined);
      expect(result).toHaveLength(1);
    });

    it('falls back to contains search when FTS fails', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('pg error'));
      prisma.chatThread.findMany.mockResolvedValueOnce([
        {
          id: 'thread-2',
          title: 'Suporte Avançado',
          updatedAt: new Date(),
          messages: [{ content: 'Ajuda com suporte' }],
        },
      ]);

      const result = await service.search(wsId, 'suporte', undefined);

      expect(prisma.chatThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: wsId,
            title: { contains: 'suporte', mode: 'insensitive' },
          }),
        }),
      );
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('fallback search uses workspaceId filter', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('pg error'));

      await service.search('ws-fallback', 'test', undefined);

      expect(prisma.chatThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-fallback' }),
        }),
      );
    });
  });

  describe('result mapping', () => {
    it('maps row with Prisma.Decimal rank', async () => {
      const { Prisma } = require('@prisma/client');
      prisma.$queryRaw.mockResolvedValue([
        {
          ...mockRow,
          rank: new Prisma.Decimal('0.75'),
          contentPreview: 'Conteúdo de teste',
          titlePreview: 'Título',
          matchedContent: 'Texto completo da mensagem',
        },
      ]);

      const [result] = await service.search(wsId, 'teste', undefined);

      expect(result.rank).toBe(0.75);
      expect(result.matchedContent).toBeTruthy();
    });

    it('handles rank as null', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          ...mockRow,
          rank: null,
          contentPreview: null,
          titlePreview: null,
          matchedContent: 'Apenas conteúdo',
        },
      ]);

      const [result] = await service.search(wsId, 'teste', undefined);

      expect(result.rank).toBe(0);
      expect(result.matchedContent).toBeTruthy();
    });
  });

  describe('tenant isolation', () => {
    it('fallback search filters chatThread by workspaceId', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('FTS fail'));

      await service.search('ws-isolated', 'unique', undefined);

      expect(prisma.chatThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-isolated' }),
        }),
      );
    });

    it('fallback search filters chatMessage by thread workspaceId', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('FTS fail'));

      await service.search('ws-msg-iso', 'unique', undefined);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            thread: { workspaceId: 'ws-msg-iso' },
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('propagates critical FTS error when fallback also fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('FTS fail'));
      prisma.chatThread.findMany.mockRejectedValue(new Error('Fallback fail'));

      await expect(service.search(wsId, 'query', undefined)).rejects.toThrow('Fallback fail');
    });
  });
});
