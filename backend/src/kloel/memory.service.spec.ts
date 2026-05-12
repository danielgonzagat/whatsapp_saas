import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';
import { MemoryCrudService } from './memory-crud.service';
import { MemorySearchService } from './memory-search.service';
import type { MemoryItem, SearchResult } from './memory.types';

type MemoryCrudMock = Pick<
  MemoryCrudService,
  'saveMemory' | 'listMemories' | 'getMemoryStats' | 'deleteMemory'
>;

type MemorySearchMock = Pick<MemorySearchService, 'searchMemory' | 'getSalesContext'>;

describe('MemoryService', () => {
  let service: MemoryService;
  let memoryCrud: MemoryCrudMock;
  let memorySearch: MemorySearchMock;

  const wsId = 'ws-1';

  const sampleMemoryItem: MemoryItem = {
    id: 'm-1',
    workspaceId: wsId,
    key: 'product_1',
    value: { name: 'Curso' },
    category: 'product',
    content: 'Curso description',
  };

  const sampleSearchResult: SearchResult = {
    memories: [sampleMemoryItem],
    totalFound: 1,
    searchTime: 5,
  };

  beforeEach(async () => {
    memoryCrud = {
      saveMemory: jest.fn().mockResolvedValue(sampleMemoryItem),
      listMemories: jest.fn().mockResolvedValue({
        memories: [],
        total: 0,
      }),
      getMemoryStats: jest.fn().mockResolvedValue({
        totalMemories: 0,
        byCategory: {},
        lastUpdated: null,
      }),
      deleteMemory: jest.fn().mockResolvedValue(true),
    };

    memorySearch = {
      searchMemory: jest.fn().mockResolvedValue(sampleSearchResult),
      getSalesContext: jest.fn().mockResolvedValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: MemoryCrudService, useValue: memoryCrud },
        { provide: MemorySearchService, useValue: memorySearch },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveMemory', () => {
    it('delegates to memoryCrud.saveMemory', async () => {
      const result = await service.saveMemory(
        wsId,
        'key1',
        { data: true },
        'general',
        'content text',
      );

      expect(result).toEqual(sampleMemoryItem);
      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        wsId,
        'key1',
        { data: true },
        'general',
        'content text',
      );
    });

    it('uses default category when not provided', async () => {
      await service.saveMemory(wsId, 'key2', 'value');

      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        wsId,
        'key2',
        'value',
        'general',
        undefined,
      );
    });

    it('workspace isolation via crud delegation', async () => {
      await service.saveMemory('ws-tenant', 'k', 'v');

      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        'ws-tenant',
        'k',
        'v',
        'general',
        undefined,
      );
    });
  });

  describe('searchMemory', () => {
    it('delegates to memorySearch.searchMemory', async () => {
      const result = await service.searchMemory(wsId, 'query', 10, 'product');

      expect(result).toEqual(sampleSearchResult);
      expect(memorySearch.searchMemory).toHaveBeenCalledWith(wsId, 'query', 10, 'product');
    });

    it('uses default limit and no category when not provided', async () => {
      await service.searchMemory(wsId, 'q');

      expect(memorySearch.searchMemory).toHaveBeenCalledWith(wsId, 'q', 5, undefined);
    });

    it('returns empty result from search service', async () => {
      const emptyResult: SearchResult = {
        memories: [],
        totalFound: 0,
        searchTime: 3,
      };
      (memorySearch.searchMemory as jest.Mock).mockResolvedValue(emptyResult);

      const result = await service.searchMemory(wsId, 'nonexistent');

      expect(result.memories).toHaveLength(0);
      expect(result.totalFound).toBe(0);
    });
  });

  describe('getSalesContext', () => {
    it('delegates to memorySearch.getSalesContext', async () => {
      (memorySearch.getSalesContext as jest.Mock).mockResolvedValue(
        '=== PRODUTOS RELEVANTES ===\nProduct info',
      );

      const result = await service.getSalesContext(wsId, 'comprar');

      expect(result).toBe('=== PRODUTOS RELEVANTES ===\nProduct info');
      expect(memorySearch.getSalesContext).toHaveBeenCalledWith(wsId, 'comprar');
    });

    it('returns empty string when no context found', async () => {
      (memorySearch.getSalesContext as jest.Mock).mockResolvedValue('');

      const result = await service.getSalesContext(wsId, 'irrelevant');

      expect(result).toBe('');
    });
  });

  describe('saveProduct', () => {
    it('saves product with formatted content and product_ prefix', async () => {
      const productItem: MemoryItem = {
        id: 'mp-1',
        workspaceId: wsId,
        key: 'product_prod-123',
        value: {
          name: 'Curso Avançado',
          description: 'Desc',
          price: 199.9,
          benefits: ['A', 'B'],
        },
        category: 'product',
        content: `PRODUTO: Curso Avançado
PREÇO: R$ 199.9
DESCRIÇÃO: Desc
BENEFÍCIOS: A, B`,
      };
      (memoryCrud.saveMemory as jest.Mock).mockResolvedValue(productItem);

      const result = await service.saveProduct('ws-1', 'prod-123', {
        name: 'Curso Avançado',
        description: 'Desc',
        price: 199.9,
        benefits: ['A', 'B'],
      });

      expect(result.key).toBe('product_prod-123');
      expect(result.category).toBe('product');
      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        'ws-1',
        'product_prod-123',
        { name: 'Curso Avançado', description: 'Desc', price: 199.9, benefits: ['A', 'B'] },
        'product',
        expect.stringContaining('Curso Avançado'),
      );
    });

    it('saves product without benefits section when benefits not provided', async () => {
      const productItem: MemoryItem = {
        id: 'mp-2',
        workspaceId: wsId,
        key: 'product_prod-2',
        value: { name: 'Basic', description: 'D', price: 10 },
        category: 'product',
        content: 'PRODUTO: Basic\nPREÇO: R$ 10\nDESCRIÇÃO: D',
      };
      (memoryCrud.saveMemory as jest.Mock).mockResolvedValue(productItem);

      const result = await service.saveProduct('ws-1', 'prod-2', {
        name: 'Basic',
        description: 'D',
        price: 10,
      });

      expect(result.content).not.toContain('BENEFÍCIOS');
    });

    it('formats price with two decimal places', async () => {
      (memoryCrud.saveMemory as jest.Mock).mockResolvedValue({
        ...sampleMemoryItem,
        key: 'product_p',
        category: 'product',
      });

      await service.saveProduct('ws-1', 'p', {
        name: 'X',
        description: 'D',
        price: 199.12345,
      });

      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        'ws-1',
        'product_p',
        expect.anything(),
        'product',
        expect.stringContaining('199.12'),
      );
    });
  });

  describe('listMemories', () => {
    it('delegates to memoryCrud.listMemories', async () => {
      (memoryCrud.listMemories as jest.Mock).mockResolvedValue({
        memories: [sampleMemoryItem],
        total: 1,
      });

      const result = await service.listMemories(wsId, 'product', 2, 10);

      expect(result.total).toBe(1);
      expect(memoryCrud.listMemories).toHaveBeenCalledWith(wsId, 'product', 2, 10);
    });

    it('returns empty list when no memories', async () => {
      (memoryCrud.listMemories as jest.Mock).mockResolvedValue({
        memories: [],
        total: 0,
      });

      const result = await service.listMemories(wsId);

      expect(result.memories).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getMemoryStats', () => {
    it('delegates to memoryCrud.getMemoryStats', async () => {
      const stats = { totalMemories: 5, byCategory: { product: 5 }, lastUpdated: new Date() };
      (memoryCrud.getMemoryStats as jest.Mock).mockResolvedValue(stats);

      const result = await service.getMemoryStats(wsId);

      expect(result).toEqual(stats);
      expect(memoryCrud.getMemoryStats).toHaveBeenCalledWith(wsId);
    });
  });

  describe('deleteMemory', () => {
    it('delegates to memoryCrud.deleteMemory and returns true', async () => {
      (memoryCrud.deleteMemory as jest.Mock).mockResolvedValue(true);

      const result = await service.deleteMemory(wsId, 'old-key');

      expect(result).toBe(true);
      expect(memoryCrud.deleteMemory).toHaveBeenCalledWith(wsId, 'old-key');
    });

    it('returns false when crud returns false', async () => {
      (memoryCrud.deleteMemory as jest.Mock).mockResolvedValue(false);

      const result = await service.deleteMemory(wsId, 'missing');

      expect(result).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('saveMemory delegates with correct workspaceId', async () => {
      await service.saveMemory('ws-tenant', 'k', 'v');

      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        'ws-tenant',
        'k',
        'v',
        'general',
        undefined,
      );
    });

    it('searchMemory delegates with correct workspaceId', async () => {
      await service.searchMemory('ws-tenant', 'q');

      expect(memorySearch.searchMemory).toHaveBeenCalledWith('ws-tenant', 'q', 5, undefined);
    });

    it('saveProduct delegates with correct workspaceId', async () => {
      await service.saveProduct('ws-tenant', 'p1', {
        name: 'Prod',
        description: 'D',
        price: 10,
      });

      expect(memoryCrud.saveMemory).toHaveBeenCalledWith(
        'ws-tenant',
        expect.any(String),
        expect.any(Object),
        'product',
        expect.any(String),
      );
    });

    it('listMemories delegates with correct workspaceId', async () => {
      await service.listMemories('ws-tenant');

      expect(memoryCrud.listMemories).toHaveBeenCalledWith('ws-tenant', undefined, 1, 20);
    });

    it('getMemoryStats delegates with correct workspaceId', async () => {
      await service.getMemoryStats('ws-tenant');

      expect(memoryCrud.getMemoryStats).toHaveBeenCalledWith('ws-tenant');
    });

    it('deleteMemory delegates with correct workspaceId', async () => {
      await service.deleteMemory('ws-tenant', 'k');

      expect(memoryCrud.deleteMemory).toHaveBeenCalledWith('ws-tenant', 'k');
    });

    it('separate workspace operations are isolated', async () => {
      await service.saveMemory('ws-alpha', 'k1', 'v1');
      await service.saveMemory('ws-beta', 'k2', 'v2');

      expect(memoryCrud.saveMemory).toHaveBeenNthCalledWith(
        1,
        'ws-alpha',
        'k1',
        'v1',
        'general',
        undefined,
      );
      expect(memoryCrud.saveMemory).toHaveBeenNthCalledWith(
        2,
        'ws-beta',
        'k2',
        'v2',
        'general',
        undefined,
      );
    });
  });

  describe('error handling', () => {
    it('saveMemory propagates crud error', async () => {
      (memoryCrud.saveMemory as jest.Mock).mockRejectedValue(new Error('crud failure'));

      await expect(service.saveMemory(wsId, 'k', 'v')).rejects.toThrow('crud failure');
    });

    it('searchMemory propagates search error', async () => {
      (memorySearch.searchMemory as jest.Mock).mockRejectedValue(new Error('search failure'));

      await expect(service.searchMemory(wsId, 'q')).rejects.toThrow('search failure');
    });

    it('deleteMemory propagates crud deletion error', async () => {
      (memoryCrud.deleteMemory as jest.Mock).mockRejectedValue(new Error('delete failed'));

      await expect(service.deleteMemory(wsId, 'k')).rejects.toThrow('delete failed');
    });

    it('listMemories propagates crud error', async () => {
      (memoryCrud.listMemories as jest.Mock).mockRejectedValue(new Error('list failed'));

      await expect(service.listMemories(wsId)).rejects.toThrow('list failed');
    });
  });
});
