import { Test, TestingModule } from '@nestjs/testing';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
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

  it('records durable agent evidence with integrity metadata', async () => {
    const result = await service.toolRecordAgentEvidence(wsId, {
      source: 'jest',
      content: 'agent runtime validation passed',
      type: 'validation',
      verification: 'single_source',
    });

    expect(result.success).toBe(true);
    expect(agentEvidence.add).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: wsId,
        source: 'jest',
        content: 'agent runtime validation passed',
        type: 'validation',
        verification: 'single_source',
      }),
    );
  });

  it('searches and lists durable agent evidence by workspace', async () => {
    const search = await service.toolSearchAgentEvidence(wsId, { query: 'validation' });
    const list = await service.toolListAgentEvidence(wsId, { type: 'validation' });

    expect(search.success).toBe(true);
    expect(list.success).toBe(true);
    expect(agentEvidence.query).toHaveBeenCalledWith({
      workspaceId: wsId,
      keyword: 'validation',
      limit: undefined,
    });
    expect(agentEvidence.list).toHaveBeenCalledWith({
      workspaceId: wsId,
      type: 'validation',
      limit: undefined,
    });
  });

  it('verifies durable agent evidence integrity', async () => {
    const result = await service.toolVerifyAgentEvidence(wsId);

    expect(result.success).toBe(true);
    expect(agentEvidence.verify).toHaveBeenCalledWith(wsId);
    expect(agentEvidence.summary).toHaveBeenCalledWith(wsId);
  });
});
