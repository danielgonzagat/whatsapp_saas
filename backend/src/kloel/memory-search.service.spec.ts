import { Test, TestingModule } from '@nestjs/testing';
import { MemorySearchService } from './memory-search.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type MemorySearchPrismaMock = {
  kloelMemory: {
    findMany: jest.Mock;
  };
};

describe('MemorySearchService', () => {
  let service: MemorySearchService;
  let prisma: MemorySearchPrismaMock;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemorySearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<MemorySearchService>(MemorySearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchMemory', () => {
    it('returns empty result when no memories match query', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      const result = await service.searchMemory(wsId, 'unmatched');

      expect(result.memories).toHaveLength(0);
      expect(result.totalFound).toBe(0);
      expect(result.searchTime).toBeGreaterThanOrEqual(0);
    });

    it('finds memories by content match (case insensitive)', async () => {
      const memoryRows = [
        {
          id: 'm-1',
          workspaceId: wsId,
          key: 'product_1',
          value: { name: 'Curso' },
          category: 'product',
          type: null,
          content: 'Curso de vendas',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memoryRows);

      const result = await service.searchMemory(wsId, 'vendas');

      expect(result.memories).toHaveLength(1);
      expect(result.totalFound).toBe(1);
      expect(result.memories[0].key).toBe('product_1');
      expect(result.memories[0].content).toBe('Curso de vendas');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: wsId,
            OR: [
              { content: { contains: 'vendas', mode: 'insensitive' } },
              { key: { contains: 'vendas', mode: 'insensitive' } },
            ],
          }),
          take: 5,
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });

    it('finds memories by key match', async () => {
      const memoryRows = [
        {
          id: 'm-2',
          workspaceId: wsId,
          key: 'objection_price',
          value: 'too expensive response',
          category: 'objection',
          type: null,
          content: 'Response to price objection',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memoryRows);

      const result = await service.searchMemory(wsId, 'price');

      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].key).toBe('objection_price');
    });

    it('filters by category when provided', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.searchMemory(wsId, 'query', 5, 'product');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'product',
          }),
        }),
      );
    });

    it('respects limit parameter', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.searchMemory(wsId, 'query', 10);

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('handles null content in returned rows', async () => {
      const memoryRows = [
        {
          id: 'm-3',
          workspaceId: wsId,
          key: 'key_null',
          value: 'v',
          category: 'general',
          type: null,
          content: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memoryRows);

      const result = await service.searchMemory(wsId, 'key_null');

      expect(result.memories[0].content).toBe('');
    });

    it('returns empty result on prisma error instead of throwing', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(
        new Error('connection timeout'),
      );

      const result = await service.searchMemory(wsId, 'query');

      expect(result.memories).toHaveLength(0);
      expect(result.totalFound).toBe(0);
    });

    it('alerts ops on prisma error', async () => {
      const error = new Error('connection timeout');
      prisma.kloelMemory.findMany.mockRejectedValue(error);

      await service.searchMemory(wsId, 'query');

      expect(opsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        error,
        'MemorySearchService.now',
      );
    });
  });

  describe('getSalesContext', () => {
    it('returns context from product, script, and objection searches', async () => {
      const productRow = {
        id: 'mp-1',
        workspaceId: wsId,
        key: 'product_1',
        value: { name: 'Curso' },
        category: 'product',
        type: null,
        content: 'Curso completo de vendas',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const scriptRow = {
        id: 'ms-1',
        workspaceId: wsId,
        key: 'script_1',
        value: { steps: [] },
        category: 'script',
        type: null,
        content: 'Script de abordagem',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const objectionRow = {
        id: 'mo-1',
        workspaceId: wsId,
        key: 'objection_price',
        value: { answer: '' },
        category: 'objection',
        type: null,
        content: 'Resposta para objeção de preço',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.kloelMemory.findMany
        .mockResolvedValueOnce([productRow])
        .mockResolvedValueOnce([scriptRow])
        .mockResolvedValueOnce([objectionRow]);

      const result = await service.getSalesContext(wsId, 'comprar curso');

      expect(result).toContain('PRODUTOS RELEVANTES');
      expect(result).toContain('Curso completo de vendas');
      expect(result).toContain('SCRIPTS DE VENDA');
      expect(result).toContain('Script de abordagem');
      expect(result).toContain('RESPOSTAS A OBJEÇÕES');
      expect(result).toContain('Resposta para objeção de preço');
    });

    it('omits product section when no products found', async () => {
      prisma.kloelMemory.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSalesContext(wsId, 'anything');

      expect(result).toBe('');
    });

    it('uses stringified value when content is empty', async () => {
      const row = {
        id: 'm-1',
        workspaceId: wsId,
        key: 'product_x',
        value: { name: 'Item' },
        category: 'product',
        type: null,
        content: '',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.kloelMemory.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSalesContext(wsId, 'item');

      expect(result).toContain('PRODUTOS RELEVANTES');
      expect(result).toContain('{"name":"Item"}');
    });

    it('returns empty string on error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(
        new Error('search failed'),
      );

      const result = await service.getSalesContext(wsId, 'test');

      expect(result).toBe('');
    });
  });

  describe('tenant isolation', () => {
    it('searchMemory scoped to correct workspaceId', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.searchMemory('ws-tenant', 'q');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('getSalesContext delegates workspaceId to searchMemory', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.getSalesContext('ws-tenant', 'msg');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-tenant',
            category: 'product',
          }),
        }),
      );
    });

    it('separate workspace searches are isolated', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.searchMemory('ws-alpha', 'q');
      await service.searchMemory('ws-beta', 'q');

      expect(prisma.kloelMemory.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-alpha' }),
        }),
      );
      expect(prisma.kloelMemory.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-beta' }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('searchMemory returns empty result on prisma error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(new Error('timeout'));

      const result = await service.searchMemory(wsId, 'q');

      expect(result.memories).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
    });

    it('getSalesContext returns empty string on search error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(new Error('down'));

      const result = await service.getSalesContext(wsId, 'q');

      expect(result).toBe('');
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
    });
  });
});
