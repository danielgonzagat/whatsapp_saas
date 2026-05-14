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

  describe('getWorkspaceContext', () => {
    it('returns context string with account config', async () => {
      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('CONFIGURAÇÃO VERIFICADA DA CONTA E DA MARCA');
      expect(result).toContain('myapp.com');
      expect(result).toContain('#FF0000');
      expect(result).toContain('Logo configurada: sim');
    });

    it('returns context string with subscription info', async () => {
      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('STATUS DA CONTA E DA ASSINATURA');
    });

    it('returns catalog status when no products', async () => {
      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('nenhum produto real cadastrado');
    });

    it('includes product catalog when products exist', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          rawProducts: [
            {
              id: 'p-1',
              name: 'Curso Premium',
              price: 199.9,
              currency: 'BRL',
              description: 'Curso completo',
              active: true,
              status: 'active',
              plans: [],
              checkouts: [],
              coupons: [],
              campaigns: [],
              commissions: [],
              urls: [],
              reviews: [],
            },
          ],
          rawProductCount: 1,
        }),
      );

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('CATÁLOGO REAL DO WORKSPACE');
      expect(result).toContain('Curso Premium');
    });

    it('includes user profile when userProfile content exists', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          userProfile: { content: 'Usuário admin, acesso total' },
        }),
      );

      const result = await service.getWorkspaceContext(wsId, 'user-1');

      expect(result).toContain('PERFIL DO USUÁRIO ATUAL');
      expect(result).toContain('Usuário admin');
    });

    it('includes business data when description and segment are set', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          workspace: {
            providerSettings: {
              businessDescription: 'Venda de cursos online',
              businessSegment: 'Educação',
            },
            customDomain: null,
            branding: {},
            stripeCustomerId: null,
          },
        }),
      );

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('DADOS OPERACIONAIS VERIFICADOS DO NEGÓCIO');
      expect(result).toContain('Educação');
      expect(result).toContain('Venda de cursos online');
    });

    it('includes affiliate context when affiliate entries exist', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          affiliateRequests: [
            {
              affiliateProductId: 'aff-1',
              status: 'APPROVED',
              updatedAt: new Date(),
              affiliateProduct: {
                productId: 'producer-p-1',
                commissionPct: 15,
                category: 'Cursos',
              },
            },
          ],
          affiliateLinks: [],
        }),
      );

      prisma.product.findMany.mockResolvedValue([
        {
          id: 'producer-p-1',
          workspaceId: 'producer-ws',
          name: 'Curso do Produtor',
          description: 'Curso afiliado',
          price: 299,
          currency: 'BRL',
          category: 'Cursos',
        },
      ]);

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('PRODUTOS EM QUE O WORKSPACE SE AFILIOU');
    });

    it('includes memories with persona type', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          memories: [
            {
              id: 'mem-1',
              key: 'persona',
              value: { tone: 'formal' },
              category: 'persona',
              type: 'persona',
              content: 'Tom profissional e amigável',
              createdAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('PERSONA/TOM DE VOZ');
    });

    it('includes memories with script type', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          memories: [
            {
              id: 'mem-1',
              key: 'script',
              value: {},
              category: null,
              type: 'script',
              content: 'Boas vindas: Olá, como posso ajudar?',
              createdAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toContain('SCRIPT DE VENDA');
    });

    it('skips legacy product memories', async () => {
      dataService.fetchAll.mockResolvedValue(
        makeFetchAllResult({
          memories: [
            {
              id: 'mem-1',
              key: 'product',
              value: {},
              category: null,
              type: 'product',
              content: null,
              createdAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.getWorkspaceContext(wsId);

      expect(result).not.toContain('PERSONA');
    });

    it('returns empty string on error', async () => {
      dataService.fetchAll.mockRejectedValue(new Error('DB down'));

      const result = await service.getWorkspaceContext(wsId);

      expect(result).toBe('');
    });
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
