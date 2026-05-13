import { Test, TestingModule } from '@nestjs/testing';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import {
  AgentRuntimeSchedulerService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
} from './agent-runtime';

jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
}));

type ProductRecord = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  active: boolean;
  status: string;
};

type FlowRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  _count: { executions: number };
};

type ChatToolsPrismaMock = {
  product: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  kloelMemory: { upsert: jest.Mock; findUnique: jest.Mock };
  flow: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  contact: { count: jest.Mock };
  message: { count: jest.Mock };
  checkoutOrder: { aggregate: jest.Mock };
  kloelWallet: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
};

describe('KloelChatToolsService', () => {
  let service: KloelChatToolsService;
  let prisma: ChatToolsPrismaMock;
  let smartPayment: Pick<SmartPaymentService, 'createSmartPayment'>;
  let agentScheduler: {
    upsertJob: jest.Mock;
    listJobs: jest.Mock;
  };
  let agentSessions: {
    search: jest.Mock;
    searchSessions: jest.Mock;
  };
  let agentSkills: {
    upsertSkill: jest.Mock;
  };

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      kloelMemory: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      flow: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      contact: { count: jest.fn().mockResolvedValue(0) },
      message: { count: jest.fn().mockResolvedValue(0) },
      checkoutOrder: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { totalInCents: 0 } }),
      },
      kloelWallet: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };
    smartPayment = {
      createSmartPayment: jest.fn().mockResolvedValue({ paymentUrl: 'https://pay.test' }),
    };
    agentScheduler = {
      upsertJob: jest.fn().mockResolvedValue({ ok: true, key: 'agent_job:daily' }),
      listJobs: jest.fn().mockResolvedValue([]),
    };
    agentSessions = {
      search: jest.fn().mockResolvedValue({ query: 'checkout', totalFound: 0, memories: [] }),
      searchSessions: jest
        .fn()
        .mockResolvedValue({ query: 'checkout', totalFound: 0, sessions: [] }),
    };
    agentSkills = {
      upsertSkill: jest.fn().mockResolvedValue({ ok: true, reasons: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelChatToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmartPaymentService, useValue: smartPayment },
        { provide: AgentRuntimeSchedulerService, useValue: agentScheduler },
        { provide: AgentRuntimeSessionStore, useValue: agentSessions },
        { provide: AgentRuntimeSkillRegistry, useValue: agentSkills },
      ],
    }).compile();

    service = module.get<KloelChatToolsService>(KloelChatToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toolSaveProduct', () => {
    it('creates product scoped to workspaceId', async () => {
      const product: ProductRecord = {
        id: 'p-1',
        name: 'Curso',
        price: 199.9,
        description: '',
        active: true,
        status: 'active',
      };
      prisma.product.create.mockResolvedValue(product);

      const result = await service.toolSaveProduct(wsId, {
        name: 'Curso',
        price: 199.9,
        description: 'Curso completo',
      });

      expect(result.success).toBe(true);
      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: wsId, name: 'Curso', price: 199.9 }),
        }),
      );
    });
  });

  describe('toolListProducts', () => {
    it('returns message when no products exist', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.toolListProducts(wsId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Nenhum produto');
    });

    it('lists products filtered by workspaceId', async () => {
      const products: ProductRecord[] = [
        {
          id: 'p-1',
          name: 'Produto A',
          price: 99,
          description: null,
          active: true,
          status: 'active',
        },
      ];
      prisma.product.findMany.mockResolvedValue(products);

      const result = await service.toolListProducts(wsId);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId, active: true } }),
      );
      expect(result.products).toHaveLength(1);
    });
  });

  describe('toolDeleteProduct', () => {
    it('soft-deletes product with audit log in transaction', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        name: 'Curso Antigo',
      });

      const result = await service.toolDeleteProduct(wsId, { productName: 'Curso' });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns error when product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      const result = await service.toolDeleteProduct(wsId, { productId: 'no-exist' });

      expect(result.success).toBe(false);
    });
  });

  describe('toolToggleAutopilot', () => {
    it('blocks activation when billing is suspended', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });

      const result = await service.toolToggleAutopilot(wsId, { enabled: true });

      expect(result.success).toBe(false);
    });

    it('enables autopilot via transaction when billing is ok', async () => {
      prisma.workspace.findUnique
        .mockResolvedValueOnce({ providerSettings: {} })
        .mockResolvedValueOnce({ providerSettings: {} });

      const result = await service.toolToggleAutopilot(wsId, { enabled: true });

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('toolSetBrandVoice', () => {
    it('upserts brandVoice in kloelMemory', async () => {
      const result = await service.toolSetBrandVoice(wsId, {
        tone: 'formal',
        personality: 'profissional',
      });

      expect(result.success).toBe(true);
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: wsId, key: 'brandVoice' } },
          create: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });
  });

  describe('agent runtime tools', () => {
    it('creates governed agent jobs through the runtime scheduler', async () => {
      const result = await service.toolCreateAgentJob(wsId, {
        title: 'Daily memory audit',
        prompt: 'Review operational memory and report stale facts.',
        everyMinutes: 1440,
        toolScope: ['search_agent_memory'],
      });

      expect(result.success).toBe(true);
      expect(agentScheduler.upsertJob).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          jobId: 'daily_memory_audit',
          schedule: { kind: 'interval', everyMinutes: 1440 },
          toolScope: ['search_agent_memory'],
        }),
      );
    });

    it('searches persistent agent memory by workspace', async () => {
      const result = await service.toolSearchAgentMemory(wsId, { query: 'checkout', limit: 3 });

      expect(result.success).toBe(true);
      expect(agentSessions.search).toHaveBeenCalledWith(wsId, 'checkout', 3);
    });

    it('searches persistent agent sessions by workspace', async () => {
      const result = await service.toolSearchAgentSessions(wsId, { query: 'checkout', limit: 2 });

      expect(result.success).toBe(true);
      expect(agentSessions.searchSessions).toHaveBeenCalledWith(wsId, 'checkout', 2);
    });

    it('upserts procedural agent skills with sanitized id and typed risk', async () => {
      const result = await service.toolUpsertAgentSkill(wsId, {
        id: 'checkout recovery',
        title: 'Checkout Recovery',
        summary: 'Recover abandoned checkouts with governed follow-up.',
        riskLevel: 'normal',
        allowedTools: ['list_products'],
      });

      expect(result.success).toBe(true);
      expect(agentSkills.upsertSkill).toHaveBeenCalledWith(
        wsId,
        expect.objectContaining({
          id: 'checkout_recovery',
          title: 'Checkout Recovery',
          riskLevel: 'normal',
          allowedTools: ['list_products'],
        }),
      );
    });
  });

  describe('toolSetSalesPolicy', () => {
    it('persists sales policy in workspace autopilot settings', async () => {
      prisma.workspace.findUnique.mockResolvedValueOnce({
        providerSettings: { autopilot: { enabled: true } },
      });

      const result = await service.toolSetSalesPolicy(
        wsId,
        {
          aggressiveness: 'aggressive',
          tone: 'direto',
          instructions: 'Se o lead abandonou checkout duas vezes, avance para oferta objetiva.',
          appliesTo: 'checkout_abandoned_twice',
        },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(prisma.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: wsId },
          data: {
            providerSettings: expect.objectContaining({
              autopilot: expect.objectContaining({
                enabled: true,
                salesPolicy: expect.objectContaining({
                  aggressiveness: 'aggressive',
                  tone: 'direto',
                  instructions:
                    'Se o lead abandonou checkout duas vezes, avance para oferta objetiva.',
                  appliesTo: 'checkout_abandoned_twice',
                  updatedByUserId: 'user-1',
                }),
              }),
            }),
          },
        }),
      );
    });
  });

  describe('toolRememberUserInfo', () => {
    it('upserts user profile in kloelMemory', async () => {
      const result = await service.toolRememberUserInfo(
        wsId,
        { key: 'pref_lang', value: 'pt-BR' },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(prisma.kloelMemory.upsert).toHaveBeenCalled();
    });

    it('returns error for empty key or value', async () => {
      const result = await service.toolRememberUserInfo(wsId, { key: '', value: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('toolCreateFlow', () => {
    it('creates flow with nodes and edges', async () => {
      const flow = {
        id: 'f-1',
        name: 'Boas Vindas',
        isActive: true,
        createdAt: new Date(),
        _count: { executions: 0 },
      };
      prisma.flow.create.mockResolvedValue(flow);

      const result = await service.toolCreateFlow(wsId, {
        name: 'Boas Vindas',
        trigger: 'welcome',
      });

      expect(result.success).toBe(true);
      expect(prisma.flow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: wsId, name: 'Boas Vindas' }),
        }),
      );
    });
  });

  describe('toolListFlows', () => {
    it('returns flows filtered by workspaceId', async () => {
      const flows: FlowRecord[] = [
        {
          id: 'f-1',
          name: 'Flow 1',
          isActive: true,
          createdAt: new Date(),
          _count: { executions: 5 },
        },
      ];
      prisma.flow.findMany.mockResolvedValue(flows);

      const result = await service.toolListFlows(wsId);

      expect(prisma.flow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId } }),
      );
      expect(result.flows).toHaveLength(1);
    });
  });

  describe('toolGetDashboardSummary', () => {
    it('returns stats for today period', async () => {
      prisma.contact.count.mockResolvedValue(5);
      prisma.message.count.mockResolvedValue(20);
      prisma.flow.count.mockResolvedValue(3);
      prisma.checkoutOrder.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: { totalInCents: 25900 },
      });
      prisma.kloelWallet.findUnique.mockResolvedValue({
        availableBalanceInCents: BigInt(9201),
        pendingBalanceInCents: BigInt(16700),
        blockedBalanceInCents: BigInt(0),
      });

      const result = await service.toolGetDashboardSummary(wsId, { period: 'today' });

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        newContacts: 5,
        messages: 20,
        activeFlows: 3,
        paidOrders: 2,
        revenueInCents: 25900,
        revenue: 259,
        wallet: {
          availableInCents: 9201,
          pendingInCents: 16700,
          blockedInCents: 0,
          totalInCents: 25901,
          available: 92.01,
          pending: 167,
          blocked: 0,
          total: 259.01,
        },
      });
      expect(prisma.checkoutOrder.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId, status: 'PAID' }),
        }),
      );
      expect(prisma.kloelWallet.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId } }),
      );
    });

    it('uses week filter for period=week', async () => {
      prisma.contact.count.mockResolvedValue(0);
      prisma.message.count.mockResolvedValue(0);
      prisma.flow.count.mockResolvedValue(0);
      prisma.checkoutOrder.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalInCents: null },
      });

      await service.toolGetDashboardSummary(wsId, { period: 'week' });

      expect(prisma.contact.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: wsId }) }),
      );
      expect(prisma.checkoutOrder.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: wsId,
            status: 'PAID',
            paidAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });
  });

  describe('toolCreatePaymentLink', () => {
    it('delegates to SmartPaymentService', async () => {
      smartPayment.createSmartPayment = jest.fn().mockResolvedValue({
        paymentUrl: 'https://pay.test/checkout',
      });

      const result = await service.toolCreatePaymentLink(wsId, {
        amount: 99.9,
        description: 'Produto Teste',
      });

      expect(result.success).toBe(true);
      expect(smartPayment.createSmartPayment).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: wsId, amount: 99.9 }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('toolSaveProduct uses correct workspaceId', async () => {
      await service.toolSaveProduct('ws-tenant', { name: 'X', price: 1 });
      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'ws-tenant' }) }),
      );
    });

    it('toolListProducts filters by correct workspaceId', async () => {
      await service.toolListProducts('ws-tenant');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant', active: true } }),
      );
    });
  });

  describe('error handling', () => {
    it('toolSaveProduct propagates Prisma error', async () => {
      prisma.product.create.mockRejectedValue(new Error('unique constraint'));
      await expect(service.toolSaveProduct(wsId, { name: 'X', price: 1 })).rejects.toThrow();
    });

    it('toolListProducts propagates Prisma error', async () => {
      prisma.product.findMany.mockRejectedValue(new Error('DB down'));
      await expect(service.toolListProducts(wsId)).rejects.toThrow('DB down');
    });
  });
});
