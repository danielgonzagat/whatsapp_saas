import { Test, TestingModule } from '@nestjs/testing';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../products/product.service';
import { SmartPaymentService } from './smart-payment.service';
import {
  AgentRuntimeSchedulerService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
  AgentRuntimeEvidenceStoreService,
} from './agent-runtime';
import { MemoryService } from './memory.service';

jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
}));

type AsyncMock<Result, Args extends unknown[] = []> = jest.Mock<Promise<Result>, Args>;

type WorkspaceUpdateArgs = {
  where: { id: string };
  data: { providerSettings?: unknown };
};

type FlowCreateArgs = {
  data: { workspaceId?: string; name?: string };
};

type CountArgs = {
  where?: { workspaceId?: string };
};

type CheckoutAggregateArgs = {
  where?: {
    workspaceId?: string;
    status?: string;
    paidAt?: { gte?: Date };
  };
};

type CheckoutAggregateResult = {
  _count: { _all: number };
  _sum: { totalInCents: number | null };
};

type FlowRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  _count: { executions: number };
};

type ChatToolsPrismaMock = {
  product: {
    create: AsyncMock<unknown, [Record<string, unknown>?]>;
    findMany: AsyncMock<unknown[], [Record<string, unknown>?]>;
    findFirst: AsyncMock<Record<string, unknown> | null, [Record<string, unknown>?]>;
    updateMany: AsyncMock<{ count: number }, [Record<string, unknown>?]>;
  };
  workspace: {
    findUnique: AsyncMock<{ providerSettings?: unknown } | null, [Record<string, unknown>?]>;
    update: AsyncMock<unknown, [WorkspaceUpdateArgs]>;
  };
  campaign: { create: AsyncMock<Record<string, unknown>, [Record<string, unknown>?]> };
  kloelMemory: {
    upsert: AsyncMock<unknown, [Record<string, unknown>?]>;
    findUnique: AsyncMock<Record<string, unknown> | null, [Record<string, unknown>?]>;
  };
  flow: {
    create: AsyncMock<unknown, [FlowCreateArgs]>;
    findMany: AsyncMock<FlowRecord[], [Record<string, unknown>?]>;
    count: AsyncMock<number, [CountArgs?]>;
  };
  contact: { count: AsyncMock<number, [CountArgs?]> };
  message: { count: AsyncMock<number, [CountArgs?]> };
  checkoutOrder: { aggregate: AsyncMock<CheckoutAggregateResult, [CheckoutAggregateArgs]> };
  kloelWallet: { findUnique: AsyncMock<Record<string, unknown> | null, [Record<string, unknown>]> };
  auditLog: { create: AsyncMock<unknown, [Record<string, unknown>?]> };
  $transaction: jest.Mock<unknown, [unknown]>;
};

type TransactionCallback = (client: ChatToolsPrismaMock) => unknown;

function isTransactionCallback(arg: unknown): arg is TransactionCallback {
  return typeof arg === 'function';
}

function resolvedMock<Result, Args extends unknown[] = []>(
  result: Result,
): AsyncMock<Result, Args> {
  return jest.fn<Promise<Result>, Args>().mockResolvedValue(result);
}

function firstMockArg<Result, Arg>(mock: jest.Mock<Promise<Result>, [Arg]>): Arg {
  const firstCall = mock.mock.calls[0];
  if (!firstCall) {
    throw new Error('Expected mock to have been called.');
  }
  return firstCall[0];
}

describe('KloelChatToolsService', () => {
  let service: KloelChatToolsService;
  let prisma: ChatToolsPrismaMock;
  let smartPayment: Pick<SmartPaymentService, 'createSmartPayment'>;
  let memoryService: Pick<MemoryService, 'saveMemory'>;
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
        create: resolvedMock<unknown, [Record<string, unknown>?]>({}),
        findMany: resolvedMock<unknown[], [Record<string, unknown>?]>([]),
        findFirst: resolvedMock<Record<string, unknown> | null, [Record<string, unknown>?]>(null),
        updateMany: resolvedMock<{ count: number }, [Record<string, unknown>?]>({ count: 1 }),
      },
      workspace: {
        findUnique: resolvedMock<{ providerSettings?: unknown } | null, [Record<string, unknown>?]>(
          {
            providerSettings: {},
          },
        ),
        update: resolvedMock<unknown, [WorkspaceUpdateArgs]>({}),
      },
      campaign: {
        create: resolvedMock<Record<string, unknown>, [Record<string, unknown>?]>({
          id: 'campaign-1',
          name: 'PDRN Launch',
          status: 'DRAFT',
        }),
      },
      kloelMemory: {
        upsert: resolvedMock<unknown, [Record<string, unknown>?]>({}),
        findUnique: resolvedMock<Record<string, unknown> | null, [Record<string, unknown>?]>(null),
      },
      flow: {
        create: resolvedMock<unknown, [FlowCreateArgs]>({}),
        findMany: resolvedMock<FlowRecord[], [Record<string, unknown>?]>([]),
        count: resolvedMock<number, [CountArgs?]>(0),
      },
      contact: { count: resolvedMock<number, [CountArgs?]>(0) },
      message: { count: resolvedMock<number, [CountArgs?]>(0) },
      checkoutOrder: {
        aggregate: resolvedMock<CheckoutAggregateResult, [CheckoutAggregateArgs]>({
          _count: { _all: 0 },
          _sum: { totalInCents: 0 },
        }),
      },
      kloelWallet: {
        findUnique: resolvedMock<Record<string, unknown> | null, [Record<string, unknown>]>(null),
      },
      auditLog: { create: resolvedMock<unknown, [Record<string, unknown>?]>({}) },
      $transaction: jest.fn<unknown, [unknown]>().mockImplementation((arg: unknown) => {
        if (isTransactionCallback(arg)) {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };
    smartPayment = {
      createSmartPayment: jest.fn().mockResolvedValue({ paymentUrl: 'https://pay.test' }),
    };
    memoryService = {
      saveMemory: jest.fn().mockResolvedValue({
        id: 'mem-1',
        workspaceId: wsId,
        key: 'user_profile:user-1',
        value: { pref_lang: 'pt-BR', updatedAt: '2026-05-27T00:00:00.000Z', userId: 'user-1' },
        category: 'user_preferences',
        content: 'pref_lang: pt-BR',
      }),
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
    const productService = {
      create: jest.fn().mockResolvedValue({
        success: true,
        product: { id: 'prod-1', name: 'Test', price: 99, active: true, format: 'DIGITAL' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelChatToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductService, useValue: productService },
        { provide: SmartPaymentService, useValue: smartPayment },
        { provide: MemoryService, useValue: memoryService },
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
      expect(prisma.workspace.update).toHaveBeenCalledTimes(1);
      const updateArgs = firstMockArg(prisma.workspace.update);
      expect(updateArgs.where).toEqual({ id: wsId });
      expect(updateArgs.data.providerSettings).toMatchObject({
        autopilot: {
          enabled: true,
          salesPolicy: {
            aggressiveness: 'aggressive',
            tone: 'direto',
            instructions: 'Se o lead abandonou checkout duas vezes, avance para oferta objetiva.',
            appliesTo: 'checkout_abandoned_twice',
            updatedByUserId: 'user-1',
          },
        },
      });
    });
  });

  describe('toolRememberUserInfo', () => {
    it('stores user profile through MemoryService without direct kloelMemory writes', async () => {
      const result = await service.toolRememberUserInfo(
        wsId,
        { key: 'pref_lang', value: 'pt-BR' },
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(memoryService.saveMemory).toHaveBeenCalledWith(
        wsId,
        'user_profile:user-1',
        expect.objectContaining({ pref_lang: 'pt-BR', userId: 'user-1' }),
        'user_preferences',
        'pref_lang: pt-BR',
      );
      expect(prisma.kloelMemory.findUnique).not.toHaveBeenCalled();
      expect(prisma.kloelMemory.upsert).not.toHaveBeenCalled();
    });

    it('returns error for empty key or value', async () => {
      const result = await service.toolRememberUserInfo(wsId, { key: '', value: '' });
      expect(result.success).toBe(false);
      expect(memoryService.saveMemory).not.toHaveBeenCalled();
    });
  });

  describe('broadcast and AI persona direct tool guards', () => {
    it('blocks create_broadcast until a campaign domain service is wired', async () => {
      const result = await service.toolCreateBroadcast(wsId, {
        name: 'PDRN Launch',
        message: 'Oferta hoje',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('campaign_service_required');
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it('blocks configure_ai_persona until an AI config domain service is wired', async () => {
      const result = await service.toolConfigureAiPersona(wsId, {
        name: 'Kloel',
        tone: 'formal',
        personality: 'professional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ai_config_service_required');
      expect(prisma.kloelMemory.upsert).not.toHaveBeenCalled();
    });
  });

  describe('placeholder configuration tools', () => {
    it('blocks fake success for unsupported product and checkout configuration actions', async () => {
      const cases: Array<{
        name: string;
        execute: () => Promise<{ success: boolean; error?: unknown; message?: unknown }>;
        error: string;
      }> = [
        {
          name: 'toolConfigurePixel',
          execute: () => service.toolConfigurePixel(wsId, { productName: 'PDRN' }),
          error: 'pixel_configuration_service_required',
        },
        {
          name: 'toolConfigureShipping',
          execute: () => service.toolConfigureShipping(wsId, { productName: 'PDRN' }),
          error: 'shipping_configuration_service_required',
        },
        {
          name: 'toolConfigureSocialProof',
          execute: () => service.toolConfigureSocialProof(wsId, { productName: 'PDRN' }),
          error: 'checkout_social_proof_service_required',
        },
        {
          name: 'toolConfigureOrderBump',
          execute: () => service.toolConfigureOrderBump(wsId, { productName: 'PDRN' }),
          error: 'checkout_order_bump_service_required',
        },
        {
          name: 'toolConfigureExitIntent',
          execute: () => service.toolConfigureExitIntent(wsId, { productName: 'PDRN' }),
          error: 'checkout_exit_intent_service_required',
        },
        {
          name: 'toolConfigureAfterPay',
          execute: () => service.toolConfigureAfterPay(wsId, { productName: 'PDRN' }),
          error: 'checkout_after_pay_service_required',
        },
      ];

      await Promise.all(
        cases.map(async ({ execute, error, name }) => {
          const result = await execute();
          expect(result.success).toBe(false);
          expect(result.error).toBe(error);
          expect(typeof result.message).toBe('string');
          expect(result.message).toContain(name);
        }),
      );
    });
  });

  describe('toolCreateFlow', () => {
    it('blocks create_flow until a flow domain service is wired', async () => {
      const result = await service.toolCreateFlow(wsId, {
        name: 'Boas Vindas',
        trigger: 'welcome',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('flow_service_required');
      expect(prisma.flow.create).not.toHaveBeenCalled();
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
      expect(prisma.checkoutOrder.aggregate).toHaveBeenCalledTimes(1);
      const aggregateArgs = firstMockArg(prisma.checkoutOrder.aggregate);
      expect(aggregateArgs.where).toMatchObject({ workspaceId: wsId, status: 'PAID' });
      expect(prisma.kloelWallet.findUnique).toHaveBeenCalledTimes(1);
      const walletArgs = firstMockArg(prisma.kloelWallet.findUnique);
      expect(walletArgs).toMatchObject({ where: { workspaceId: wsId } });
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

      expect(prisma.contact.count).toHaveBeenCalledTimes(1);
      const contactCountArgs = firstMockArg(prisma.contact.count);
      expect(contactCountArgs.where).toMatchObject({ workspaceId: wsId });
      const aggregateArgs = firstMockArg(prisma.checkoutOrder.aggregate);
      const paidAtFilter = aggregateArgs.where?.paidAt;
      expect(aggregateArgs.where).toMatchObject({
        workspaceId: wsId,
        status: 'PAID',
      });
      expect(paidAtFilter?.gte).toBeInstanceOf(Date);
    });
  });
});
