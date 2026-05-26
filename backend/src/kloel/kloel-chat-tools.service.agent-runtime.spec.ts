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

    it('pauses governed agent jobs without deleting them', async () => {
      const result = await service.toolSetAgentJobEnabled(wsId, {
        jobId: 'daily',
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(agentScheduler.setJobEnabled).toHaveBeenCalledWith({
        workspaceId: wsId,
        jobId: 'daily',
        enabled: false,
      });
    });

    it('searches persistent agent sessions by workspace', async () => {
      const result = await service.toolSearchAgentSessions(wsId, { query: 'checkout', limit: 2 });

      expect(result.success).toBe(true);
      expect(agentSessions.searchSessions).toHaveBeenCalledWith(wsId, 'checkout', 2);
    });

    it('retrieves durable tool artifacts scoped to workspace', async () => {
      prisma.kloelMemory.findUnique.mockResolvedValue({
        key: 'tool_artifact:search_agent_memory:123:abcd',
        category: 'tool_artifact',
        type: null,
        content: '{"success":true,"data":["a"]}',
        updatedAt: new Date('2026-05-13T12:00:00.000Z'),
      });

      const result = await service.toolGetAgentArtifact(wsId, {
        artifactId: 'tool_artifact:search_agent_memory:123:abcd',
      });

      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({ success: true, data: ['a'] });
      expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_key: {
            workspaceId: wsId,
            key: 'tool_artifact:search_agent_memory:123:abcd',
          },
        },
      });
    });

    it('rejects artifact ids outside the tool artifact namespace', async () => {
      const result = await service.toolGetAgentArtifact(wsId, {
        artifactId: 'agent_turn:chat:abc',
      });

      expect(result).toEqual({ success: false, error: 'invalid_agent_artifact_id' });
      expect(prisma.kloelMemory.findUnique).not.toHaveBeenCalled();
    });

    it('does not expose missing or non-artifact memory rows as artifacts', async () => {
      prisma.kloelMemory.findUnique.mockResolvedValue({
        key: 'tool_artifact:search_agent_memory:123:abcd',
        category: 'agent_event',
        content: '{}',
        updatedAt: new Date(),
      });

      const result = await service.toolGetAgentArtifact(wsId, {
        artifactId: 'tool_artifact:search_agent_memory:123:abcd',
      });

      expect(result).toEqual({ success: false, error: 'agent_artifact_not_found' });
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

    it('records procedural skill outcomes for future skill selection', async () => {
      const result = await service.toolRecordAgentSkillOutcome(wsId, {
        skillId: 'checkout recovery',
        outcome: 'succeeded',
        reason: 'Recovered abandoned checkout',
        provenance: 'background_review',
        pinned: true,
      });

      expect(result.success).toBe(true);
      expect(agentSkills.recordSkillUsage).toHaveBeenCalledWith(wsId, {
        skillId: 'checkout_recovery',
        outcome: 'succeeded',
        reason: 'Recovered abandoned checkout',
        provenance: 'background_review',
        pinned: true,
        lifecycleState: undefined,
      });
    });

    it('records governed delegation observations into runtime events', async () => {
      const result = await service.toolRecordAgentDelegation(wsId, {
        sessionId: 'thread_1',
        task: 'Inspect Hermes delegation',
        result: 'Subagent found bounded child-session pattern.',
        childSessionId: 'child_1',
        metadata: { worker: 'D' },
      });

      expect(result.success).toBe(true);
      expect(agentSessions.recordRuntimeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          sessionId: 'thread_1',
          eventType: 'delegation',
          content: expect.stringContaining('Inspect Hermes delegation'),
          metadata: expect.objectContaining({
            worker: 'D',
            childSessionId: 'child_1',
            source: 'kloel_tool',
          }),
        }),
      );
    });
  });
});
