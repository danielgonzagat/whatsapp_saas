import { Test, TestingModule } from '@nestjs/testing';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelWorkspaceContextDataService } from './kloel-workspace-context-data.service';
import { KloelWorkspaceContextLinkedProductService } from './kloel-workspace-context-linked-product.service';

jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
  isLegacyProductName: jest.fn(() => false),
}));

type ContextPrismaMock = {
  product: { findMany: jest.Mock };
  persona: { findMany: jest.Mock; create: jest.Mock };
  integration: { findMany: jest.Mock; create: jest.Mock };
};

type DataServiceMock = {
  fetchAll: jest.Mock;
};

type LinkedProductServiceMock = {
  buildLinkedProductPromptContext: jest.Mock;
};

function makeFetchAllResult(overrides: Record<string, unknown> = {}) {
  return {
    workspace: {
      providerSettings: {},
      customDomain: 'myapp.com',
      branding: { primaryColor: '#FF0000', logoUrl: 'https://cdn.test/logo.png' },
      stripeCustomerId: 'cus_123',
      ...((overrides.workspace as Record<string, unknown>) || {}),
    },
    rawProducts: [],
    rawProductCount: 0,
    subscription: {
      status: 'active',
      plan: 'pro',
      currentPeriodEnd: new Date('2026-06-01'),
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
      ...((overrides.subscription as Record<string, unknown>) || {}),
    },
    invoices: [],
    externalPaymentLinks: [],
    integrations: [],
    affiliateRequests: [],
    affiliateLinks: [],
    affiliatePartners: [],
    customerSubscriptions: [],
    physicalOrders: [],
    payments: [],
    memories: [],
    userProfile: null,
    ...overrides,
  };
}

describe('KloelWorkspaceContextService', () => {
  let service: KloelWorkspaceContextService;
  let prisma: ContextPrismaMock;
  let dataService: DataServiceMock;
  let linkedProductService: LinkedProductServiceMock;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      persona: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'persona-1', name: 'Test', role: 'SALES' }),
      },
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'int-1', type: 'webhook', name: 'Test' }),
      },
    };

    dataService = {
      fetchAll: jest.fn().mockResolvedValue(makeFetchAllResult()),
    };

    linkedProductService = {
      buildLinkedProductPromptContext: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelWorkspaceContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: KloelWorkspaceContextDataService, useValue: dataService },
        {
          provide: KloelWorkspaceContextLinkedProductService,
          useValue: linkedProductService,
        },
      ],
    }).compile();

    service = module.get<KloelWorkspaceContextService>(KloelWorkspaceContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listPersonas', () => {
    it('returns personas scoped to workspaceId', async () => {
      prisma.persona.findMany.mockResolvedValue([
        { id: 'p-1', name: 'Vendedor', role: 'SALES', workspaceId: wsId, createdAt: new Date() },
      ]);

      const result = await service.listPersonas(wsId);

      expect(result).toHaveLength(1);
      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId } }),
      );
    });

    it('returns empty array when no personas', async () => {
      const result = await service.listPersonas(wsId);

      expect(result).toHaveLength(0);
    });
  });

  describe('createPersona', () => {
    it('creates persona scoped to workspaceId', async () => {
      const result = await service.createPersona(wsId, {
        name: 'Suporte',
        role: 'SUPPORT',
        basePrompt: 'Ajudar clientes',
      });

      expect(result.id).toBe('persona-1');
      expect(prisma.persona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            name: 'Suporte',
            role: 'SUPPORT',
          }),
        }),
      );
    });

    it('defaults role to SALES when not provided', async () => {
      await service.createPersona(wsId, { name: 'Default' });

      expect(prisma.persona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'SALES' }),
        }),
      );
    });

    it('uses systemPrompt as basePrompt fallback', async () => {
      await service.createPersona(wsId, { name: 'Fallback', systemPrompt: 'System prompt text' });

      expect(prisma.persona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ basePrompt: 'System prompt text' }),
        }),
      );
    });
  });

  describe('listIntegrations', () => {
    it('returns integrations scoped to workspaceId', async () => {
      prisma.integration.findMany.mockResolvedValue([
        {
          id: 'int-1',
          type: 'webhook',
          name: 'Slack',
          credentials: {},
          isActive: true,
          workspaceId: wsId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listIntegrations(wsId);

      expect(result).toHaveLength(1);
      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId } }),
      );
    });
  });

  describe('createIntegration', () => {
    it('creates integration scoped to workspaceId', async () => {
      const credentials = { url: 'https://hooks.slack.com' };
      const result = await service.createIntegration(wsId, {
        type: 'webhook',
        name: 'Slack',
        credentials,
      });

      expect(result.id).toBe('int-1');
      expect(prisma.integration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { workspaceId: wsId, type: 'webhook', name: 'Slack', credentials },
        }),
      );
    });
  });

  describe('buildLinkedProductPromptContext', () => {
    it('delegates to linkedProductService', async () => {
      linkedProductService.buildLinkedProductPromptContext.mockResolvedValue(
        'PRODUTO VINCULADO AO PROMPT:\n- Origem: catálogo próprio',
      );

      const result = await service.buildLinkedProductPromptContext(wsId, {
        source: 'owned',
        productId: 'p-1',
      });

      expect(result).toContain('PRODUTO VINCULADO AO PROMPT');
      const linkedArgs = linkedProductService.buildLinkedProductPromptContext.mock.calls[0];
      expect(linkedArgs[0]).toBe(wsId);
      expect(linkedArgs[1]).toBeDefined();
      expect(linkedArgs[2]).toEqual({ source: 'owned', productId: 'p-1' });
    });

    it('returns null when linkedProductService returns null', async () => {
      const result = await service.buildLinkedProductPromptContext(wsId, null);

      expect(result).toBeNull();
    });
  });

  describe('hasLegacyProductMarker', () => {
    it('returns false for null', () => {
      expect(service.hasLegacyProductMarker(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(service.hasLegacyProductMarker(undefined)).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('getWorkspaceContext passes workspaceId to dataService', async () => {
      await service.getWorkspaceContext('ws-tenant');

      const fetchArgs = dataService.fetchAll.mock.calls[0];
      expect(fetchArgs[0]).toBe('ws-tenant');
      expect(fetchArgs[1]).toBeDefined();
      expect(fetchArgs[2]).toBeUndefined();
    });

    it('listPersonas filters by workspaceId', async () => {
      await service.listPersonas('ws-tenant');

      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant' } }),
      );
    });

    it('createPersona uses correct workspaceId', async () => {
      await service.createPersona('ws-tenant', { name: 'Test' });

      expect(prisma.persona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('listIntegrations filters by workspaceId', async () => {
      await service.listIntegrations('ws-tenant');

      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant' } }),
      );
    });

    it('buildLinkedProductPromptContext passes workspaceId to linked service', async () => {
      await service.buildLinkedProductPromptContext('ws-tenant', {
        source: 'owned',
        productId: 'p-1',
      });

      const linkedArgs = linkedProductService.buildLinkedProductPromptContext.mock.calls[0];
      expect(linkedArgs[0]).toBe('ws-tenant');
      expect(linkedArgs[1]).toBeDefined();
      expect(linkedArgs[2]).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('getWorkspaceContext returns empty string on failure', async () => {
      dataService.fetchAll.mockRejectedValue(new Error('DB down'));

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toBe('');
      expect(typeof result).toBe('string');
    });

    it('createPersona propagates Prisma error', async () => {
      prisma.persona.create.mockRejectedValue(new Error('constraint violation'));

      await expect(service.createPersona(wsId, { name: 'Test' })).rejects.toThrow(
        'constraint violation',
      );
    });

    it('listPersonas propagates Prisma error', async () => {
      prisma.persona.findMany.mockRejectedValue(new Error('DB down'));

      await expect(service.listPersonas(wsId)).rejects.toThrow('DB down');
    });
  });
});
