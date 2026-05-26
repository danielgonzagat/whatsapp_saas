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

jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
}));

export type ChatToolsPrismaMock = {
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

export type ProductServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  get: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
  delete: jest.Mock;
  setImage: jest.Mock;
  publish: jest.Mock;
  toggleAvailability: jest.Mock;
};

export type ChatToolsSetup = {
  service: KloelChatToolsService;
  prisma: ChatToolsPrismaMock;
  productService: ProductServiceMock;
  smartPayment: Pick<SmartPaymentService, 'createSmartPayment'>;
  agentScheduler: {
    upsertJob: jest.Mock;
    listJobs: jest.Mock;
    setJobEnabled: jest.Mock;
  };
  agentSessions: {
    search: jest.Mock;
    searchSessions: jest.Mock;
    recordRuntimeEvent: jest.Mock;
  };
  agentSkills: {
    upsertSkill: jest.Mock;
    recordSkillUsage: jest.Mock;
  };
  agentEvidence: {
    add: jest.Mock;
    query: jest.Mock;
    list: jest.Mock;
    verify: jest.Mock;
    summary: jest.Mock;
  };
  wsId: string;
};

export async function setupChatToolsService(): Promise<ChatToolsSetup> {
  const wsId = 'ws-1';

  const prisma: ChatToolsPrismaMock = {
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

  const smartPayment: Pick<SmartPaymentService, 'createSmartPayment'> = {
    createSmartPayment: jest.fn().mockResolvedValue({ paymentUrl: 'https://pay.test' }),
  };

  const agentScheduler = {
    upsertJob: jest.fn().mockResolvedValue({ ok: true, key: 'agent_job:daily' }),
    listJobs: jest.fn().mockResolvedValue([]),
    setJobEnabled: jest.fn().mockResolvedValue({
      ok: true,
      key: 'agent_job:daily',
      enabled: false,
    }),
  };

  const agentSessions = {
    search: jest.fn().mockResolvedValue({ query: 'checkout', totalFound: 0, memories: [] }),
    searchSessions: jest.fn().mockResolvedValue({
      query: 'checkout',
      totalFound: 0,
      sessions: [],
    }),
    recordRuntimeEvent: jest.fn().mockResolvedValue('agent_event:delegation'),
  };

  const agentSkills = {
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

  function mockProductServiceFactory() {
    return {
      create: jest.fn().mockResolvedValue({
        success: true,
        product: { id: 'prod-1', name: 'Test', price: 99, active: true, format: 'DIGITAL' },
      }),
      update: jest.fn().mockResolvedValue({ success: true, product: { id: 'prod-1' } }),
      get: jest.fn().mockResolvedValue({ success: true, product: { id: 'prod-1' } }),
      findById: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      list: jest.fn().mockResolvedValue({ success: true, products: [], count: 0 }),
      delete: jest.fn().mockResolvedValue({ success: true, message: 'Deleted' }),
      setImage: jest.fn().mockResolvedValue({ success: true }),
      publish: jest.fn().mockResolvedValue({ success: true }),
      toggleAvailability: jest.fn().mockResolvedValue({ success: true }),
    };
  }
  const mockProductService = mockProductServiceFactory();

  const agentEvidence = {
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
      { provide: ProductService, useValue: mockProductService },
      { provide: AgentRuntimeEvidenceStoreService, useValue: agentEvidence },
    ],
  }).compile();

  const service = module.get<KloelChatToolsService>(KloelChatToolsService);

  return {
    service,
    prisma,
    productService: mockProductService,
    smartPayment,
    agentScheduler,
    agentSessions,
    agentSkills,
    agentEvidence,
    wsId,
  };
}
