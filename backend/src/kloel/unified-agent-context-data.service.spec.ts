import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { PrismaService } from '../prisma/prisma.service';

type ContextDataPrismaMock = {
  workspace: { findUnique: jest.Mock };
  kloelMemory: { findFirst: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
  contact: { findFirst: jest.Mock };
  message: { findMany: jest.Mock };
  product: { findMany: jest.Mock };
};

describe('UnifiedAgentContextDataService', () => {
  let service: UnifiedAgentContextDataService;
  let prisma: ContextDataPrismaMock;

  const wsId = 'ws-1';
  const contactId = 'contact-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Test Workspace',
          providerSettings: {},
        }),
      },
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue({
          name: 'John',
          phone,
          sentiment: 'NEUTRAL',
          leadScore: 0,
          tags: [],
        }),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UnifiedAgentContextDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UnifiedAgentContextDataService>(UnifiedAgentContextDataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getWorkspaceContext', () => {
    it('returns workspace with brand voice', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue({
        value: { style: 'formal' },
      });

      const result = await service.getWorkspaceContext(wsId);

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: wsId } }),
      );
      expect(result.brandVoice).toBe('formal');
    });

    it('returns workspace without brand voice when not set', async () => {
      const result = await service.getWorkspaceContext(wsId);

      expect(result.brandVoice).toBeUndefined();
    });

    it('returns salesPolicy from autopilot settings', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        name: 'Test',
        providerSettings: {
          autopilot: {
            enabled: true,
            salesPolicy: { aggressiveness: 'aggressive', tone: 'direto' },
          },
        },
      });

      const result = await service.getWorkspaceContext(wsId);

      expect(result.salesPolicy).toEqual({ aggressiveness: 'aggressive', tone: 'direto' });
    });

    it('handles null providerSettings gracefully', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        name: 'Test',
        providerSettings: null,
      });

      const result = await service.getWorkspaceContext(wsId);

      expect(result.name).toBe('Test');
      expect(result.salesPolicy).toBeNull();
    });
  });

  describe('getContactContext', () => {
    it('returns contact by contactId', async () => {
      const result = await service.getContactContext(wsId, contactId, phone);

      expect(result.name).toBe('John');
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: contactId, workspaceId: wsId } }),
      );
    });

    it('falls back to phone lookup when contactId returns null', async () => {
      prisma.contact.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        name: 'Jane',
        phone,
        sentiment: 'POSITIVE',
        leadScore: 5,
        tags: [],
      });

      const result = await service.getContactContext(wsId, 'nonexistent', phone);

      expect(result.name).toBe('Jane');
    });

    it('returns default contact when not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await service.getContactContext(wsId, 'nonexistent', '999');

      expect(result.phone).toBe('999');
      expect(result.sentiment).toBe('NEUTRAL');
    });
  });

  describe('getConversationHistory', () => {
    it('returns formatted messages in chronological order (reverses desc from DB)', async () => {
      prisma.message.findMany.mockResolvedValue([
        { content: 'Olá! Como posso ajudar?', direction: 'OUTBOUND' },
        { content: 'Oi', direction: 'INBOUND' },
      ]);

      const result = await service.getConversationHistory(wsId, contactId, 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Oi' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Olá! Como posso ajudar?' });
    });

    it('returns empty array when no where clause possible', async () => {
      const result = await service.getConversationHistory(wsId, '', 10);

      expect(result).toEqual([]);
    });

    it('looks up by phone when no contactId', async () => {
      await service.getConversationHistory(wsId, '', 10, phone);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: wsId,
            contact: { phone },
          }),
        }),
      );
    });
  });

  describe('buildAndPersistCompressedContext', () => {
    it('builds compressed context summary', async () => {
      prisma.message.findMany.mockResolvedValue([
        { direction: 'INBOUND', content: 'Quanto custa?', createdAt: new Date() },
      ]);

      const summary = await service.buildAndPersistCompressedContext(wsId, contactId, phone, {
        name: 'John',
        phone,
        sentiment: 'INTERESTED',
        leadScore: 3,
      });

      expect(summary).toBeDefined();
      expect(summary).toContain('John');
      expect(summary).toContain(phone);
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId_key: {
              workspaceId: wsId,
              key: `compressed_context:${contactId}`,
            },
          },
        }),
      );
    });

    it('returns undefined when no where clause possible', async () => {
      const result = await service.buildAndPersistCompressedContext(wsId, '', '', {});

      expect(result).toBeUndefined();
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getProducts', () => {
    it('combines DB products and memory products', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: 'Produto DB',
          price: 99,
          description: null,
          status: 'active',
          active: true,
        },
      ]);
      prisma.kloelMemory.findMany.mockResolvedValue([
        {
          id: 'm-1',
          key: 'prod_1',
          value: { name: 'Produto Mem', price: 50 },
          type: 'product',
          category: 'products',
        },
      ]);

      const result = await service.getProducts(wsId);

      expect(result).toHaveLength(2);
    });

    it('deduplicates by name (case insensitive)', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: 'Produto DB',
          price: 99,
          description: null,
          status: 'active',
          active: true,
        },
      ]);
      prisma.kloelMemory.findMany.mockResolvedValue([
        {
          id: 'm-1',
          key: 'prod_1',
          value: { name: 'Produto DB', price: 99 },
          type: 'product',
          category: 'products',
        },
      ]);

      const result = await service.getProducts(wsId);

      expect(result).toHaveLength(1);
    });

    it('returns empty array when no products', async () => {
      const result = await service.getProducts(wsId);

      expect(result).toEqual([]);
    });
  });

  describe('workspace isolation', () => {
    it('getWorkspaceContext scopes to workspaceId', async () => {
      await service.getWorkspaceContext('ws-tenant');
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-tenant' } }),
      );
    });

    it('getContactContext scopes to workspaceId', async () => {
      await service.getContactContext('ws-tenant', contactId, phone);
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-tenant' }) }),
      );
    });

    it('getProducts scopes to workspaceId', async () => {
      await service.getProducts('ws-tenant');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-tenant' }) }),
      );
    });

    it('buildAndPersistCompressedContext scopes upsert to workspaceId', async () => {
      await service.buildAndPersistCompressedContext('ws-tenant', contactId, phone, { name: 'X' });
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: 'ws-tenant', key: expect.any(String) } },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('getWorkspaceContext propagates Prisma error', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('DB down'));
      await expect(service.getWorkspaceContext(wsId)).rejects.toThrow('DB down');
    });

    it('getContactContext propagates Prisma error', async () => {
      prisma.contact.findFirst.mockRejectedValue(new Error('DB down'));
      await expect(service.getContactContext(wsId, contactId, phone)).rejects.toThrow('DB down');
    });
  });
});
