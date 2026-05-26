import { Test, TestingModule } from '@nestjs/testing';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import { ProductService } from '../products/product.service';
import {
  AgentRuntimeSchedulerService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
  AgentRuntimeEvidenceStoreService,
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
  let productService: { create: jest.Mock };
  let agentScheduler: {
    upsertJob: jest.Mock;
    listJobs: jest.Mock;
    setJobEnabled: jest.Mock;
  };
  let agentSessions: {
    search: jest.Mock;
    searchSessions: jest.Mock;
    recordRuntimeEvent: jest.Mock;
  };
  let agentSkills: {
    upsertSkill: jest.Mock;
    recordSkillUsage: jest.Mock;
  };
  let agentEvidence: {
    add: jest.Mock;
    query: jest.Mock;
    list: jest.Mock;
    verify: jest.Mock;
    summary: jest.Mock;
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
    productService = {
      create: jest.fn().mockResolvedValue({ success: true, product: { id: 'prod-1' } }),
    };
    agentScheduler = {
      upsertJob: jest.fn().mockResolvedValue({ ok: true, key: 'agent_job:daily' }),
      listJobs: jest.fn().mockResolvedValue([]),
      setJobEnabled: jest
        .fn()
        .mockResolvedValue({ ok: true, key: 'agent_job:daily', enabled: false }),
    };
    agentSessions = {
      search: jest.fn().mockResolvedValue({ query: 'checkout', totalFound: 0, memories: [] }),
      searchSessions: jest
        .fn()
        .mockResolvedValue({ query: 'checkout', totalFound: 0, sessions: [] }),
      recordRuntimeEvent: jest.fn().mockResolvedValue('agent_event:delegation'),
    };
    agentSkills = {
      upsertSkill: jest.fn().mockResolvedValue({ ok: true, reasons: [] }),
      recordSkillUsage: jest.fn().mockResolvedValue({
        ok: true,
        stats: {
          skillId: 'checkout_recovery',
          successCount: 1,
          selectedCount: 0,
          failureCount: 0,
          patchCount: 0,
          viewCount: 0,
        },
      }),
    };
    agentEvidence = {
      add: jest.fn().mockResolvedValue({
        id: 'ev_1',
        type: 'validation',
        source: 'jest',
        contentSha256: 'hash',
      }),
      query: jest.fn().mockResolvedValue([{ id: 'ev_1' }]),
      list: jest.fn().mockResolvedValue([{ id: 'ev_1' }]),
      verify: jest.fn().mockResolvedValue([]),
      summary: jest.fn().mockResolvedValue({ total: 1, byType: { validation: 1 } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelChatToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductService, useValue: productService },
        { provide: SmartPaymentService, useValue: smartPayment },
        { provide: AgentRuntimeSchedulerService, useValue: agentScheduler },
        { provide: AgentRuntimeSessionStore, useValue: agentSessions },
        { provide: AgentRuntimeSkillRegistry, useValue: agentSkills },
        { provide: AgentRuntimeEvidenceStoreService, useValue: agentEvidence },
      ],
    }).compile();

    service = module.get<KloelChatToolsService>(KloelChatToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      const aggregateArgs = prisma.checkoutOrder.aggregate.mock.calls[0][0];
      expect(aggregateArgs.where).toEqual(
        expect.objectContaining({
          workspaceId: wsId,
          status: 'PAID',
          paidAt: expect.objectContaining({ gte: aggregateArgs.where.paidAt.gte }),
        }),
      );
      expect(aggregateArgs.where.paidAt.gte).toBeInstanceOf(Date);
    });
  });
});
