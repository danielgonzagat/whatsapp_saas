import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';

const mockWarnCalls: Array<[string, Record<string, unknown>]> = [];

jest.mock('../logging/structured-logger', () => {
  const actual = jest.requireActual<typeof import('../logging/structured-logger')>(
    '../logging/structured-logger',
  );
  return {
    ...actual,
    StructuredLogger: class extends actual.StructuredLogger {
      static override from(context: string | { name?: string }) {
        const inst = new this(typeof context === 'string' ? context : (context.name ?? 'unknown'));
        return inst;
      }
      override warn(a: string | Record<string, unknown>, b?: unknown): void {
        if (typeof a === 'string' && b && typeof b === 'object') {
          mockWarnCalls.push([a, b as Record<string, unknown>]);
        }
        if (typeof a === 'string') {
          console.warn(a);
        }
      }
    },
  };
});
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('stripe', () => {
  const MockStripe = jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn(), retrieve: jest.fn() },
    paymentMethods: { list: jest.fn(), attach: jest.fn() },
  }));
  (MockStripe as unknown as Record<string, unknown>).API_VERSION = '2025-01-27.acacia';
  return { default: MockStripe };
});

jest.mock('./kloel-reply-engine.helpers', () => ({
  WHITESPACE_RE: /\s+/,
  RELAT_O__RIO_DOCUMENTO_RE: /relat[oó]rio|documento/i,
  CRIE_CADASTRAR_CADASTRE_RE: /crie|cadastrar|cadastre/i,
  PRODUTO_CAT_A__LOGO_AUT_RE: /produto|cat[aá]logo|automa/i,
  KLOEL_STREAM_ABORT_REASON_TIMEOUT: 'kloel_stream_timeout',
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED: 'client_disconnected',
  buildDynamicRuntimeContextHelper: jest.fn().mockResolvedValue('Dynamic context'),
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Assistant reply'),
}));
describe('KloelReplyEngineService ABI snapshot cache (PI-k5)', () => {
  let service: KloelReplyEngineService;

  const validAbi = {
    status: 'ok' as const,
    abi: {
      abiVersion: '1.1.0',
      lineage: {
        canonicalName: 'Kloel' as const,
        genesisEventId: 'g1',
        lineageStatus: 'intact' as const,
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: [],
      },
      identityProjection: {
        audience: 'public' as const,
        currentMaturity: 'developing' as const,
        truthMode: 'observed' as const,
      },
      perception: { currentSnapshot: { channel: 'web' }, recentSalientEvents: [] },
      beliefs: [],
      predictions: { active: [], recentSurprises: [] },
      attention: { candidates: [] },
      memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
      capabilities: { available: [], restricted: [] },
      valence: {
        recentTrace: [],
        aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 },
      },
      pulseTruth: {
        noOverclaimStatus: 'PASS' as const,
        capabilityHealthScore: 0,
        gates: [],
        certificationVerdict: {
          verdict: 'INSUFFICIENT_EVIDENCE' as const,
          score: 0,
          measuredAt: new Date().toISOString(),
        },
        overclaimRisk: 0,
      },
      currentInput: {
        raw: 'h',
        channel: 'web',
        arrivalTimestamp: new Date().toISOString(),
      },
    },
  };

  const callParams = {
    systemPrompt: 'S',
    dynamicContext: 'D',
    recentMessages: [],
    userMessage: 'Hello',
    workspaceId: 'ws-1',
  };

  function makeKloelMemoryRow(content: string, updatedAt: Date) {
    return {
      id: 'mem-1',
      workspaceId: 'ws-1',
      key: 'abi_snapshot_cache',
      category: 'abi_snapshot',
      content,
      value: {},
      updatedAt,
    };
  }

  function extractCognitiveState(
    messages: Array<{ role: string; content: unknown }>,
  ): Record<string, unknown> {
    const last = messages[messages.length - 1];
    const str = typeof last?.content === 'string' ? last.content : '{}';
    const payload = JSON.parse(str) as Record<string, unknown>;
    return payload['cognitiveState'] as Record<string, unknown>;
  }
  describe('fresh cache hit', () => {
    const cachedContent = JSON.stringify({
      abiVersion: '1.1.0',
      fromCache: true,
      mindSignals: { status: 'cached' },
    });
    const recentDate = new Date(Date.now() - 30_000); // 30 seconds ago

    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn() };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(makeKloelMemoryRow(cachedContent, recentDate)),
        upsert: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('uses cached cognitiveState and skips ABI builder rebuild', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      // Cached content should be used directly
      expect(cs['fromCache']).toBe(true);
      expect(cs['abiVersion']).toBe('1.1.0');
      // ABI builder must NOT have been called
      expect(abiBuilder.build).not.toHaveBeenCalled();
      // No persistence write on cache hit
      expect(kloelMemory.upsert).not.toHaveBeenCalled();
    });

    it('queries by workspaceId + key', async () => {
      await service.buildChatModelMessages(callParams);
      expect(kloelMemory.findUnique).toHaveBeenCalledWith({
        where: { workspaceId_key: { workspaceId: 'ws-1', key: 'abi_snapshot_cache' } },
      });
    });
  });
  describe('stale cache miss', () => {
    const staleContent = JSON.stringify({ abiVersion: '0.9.0', stale: true });
    const staleDate = new Date(Date.now() - 90_000); // 90 seconds ago — beyond 60s TTL

    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(makeKloelMemoryRow(staleContent, staleDate)),
        upsert: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('rebuilds cognitiveState and replaces stale cache via upsert', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      // ABI builder must have been called (rebuild)
      expect(abiBuilder.build).toHaveBeenCalled();
      // Should NOT use stale cached content
      expect(cs['stale']).toBeUndefined();
      // Should contain the fresh ABI result
      expect(cs['abiVersion']).toBe('1.1.0');
      // Must persist (upsert) the new snapshot
      expect(kloelMemory.upsert).toHaveBeenCalledTimes(1);
      const upsertCalls = kloelMemory.upsert.mock.calls as Array<
        [
          {
            where: { workspaceId_key: { key: string; workspaceId: string } };
            update: { category: string };
            create: { category: string; workspaceId: string };
          },
        ]
      >;
      const upsertArgs = upsertCalls[0]![0];
      expect(upsertArgs.where.workspaceId_key.key).toBe('abi_snapshot_cache');
      expect(upsertArgs.update.category).toBe('abi_snapshot');
      expect(upsertArgs.create.category).toBe('abi_snapshot');
    });
  });
  describe('not found', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('rebuilds cognitiveState and inserts new cache entry via upsert', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      expect(kloelMemory.upsert).toHaveBeenCalledTimes(1);
      const upsertCalls = kloelMemory.upsert.mock.calls as Array<
        [
          {
            where: { workspaceId_key: { key: string; workspaceId: string } };
            update: { category: string };
            create: { category: string; workspaceId: string };
          },
        ]
      >;
      const upsertArgs = upsertCalls[0]![0];
      expect(upsertArgs.where.workspaceId_key.key).toBe('abi_snapshot_cache');
      expect(upsertArgs.create.workspaceId).toBe('ws-1');
    });
  });
  describe('db-error on read', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockRejectedValue(new Error('connection refused')),
        upsert: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('falls back to rebuild and logs kloel_abi_snapshot_cache_skipped', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      // Rebuild still happens (fallback)
      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      // Log emitted
      const cacheSkips = mockWarnCalls.filter(
        ([msg]) => msg === 'kloel_abi_snapshot_cache_skipped',
      );
      expect(cacheSkips).toHaveLength(1);
      expect(cacheSkips[0][1]).toMatchObject({ reason: 'connection refused' });
    });
  });
  describe('db-error on write', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockRejectedValue(new Error('disk full')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('logs kloel_abi_snapshot_cache_skipped and continues gracefully', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      // Rebuild succeeded
      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      // Persistence errored but log was emitted
      const cacheSkips = mockWarnCalls.filter(
        ([msg]) => msg === 'kloel_abi_snapshot_cache_skipped',
      );
      expect(cacheSkips).toHaveLength(1);
      expect(cacheSkips[0][1]).toMatchObject({ reason: 'disk full' });
    });
  });
  describe('oversized snapshot', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      // Build an ABI with a very large property to exceed 16KB
      const largeArray = new Array(2000).fill(
        'padding-data-to-exceed-sixteen-kilobytes-xxxxxxxxxxxxxxxxxxxxx',
      );
      const largeAbi = {
        ...validAbi,
        abi: { ...validAbi.abi, largeField: largeArray },
      };
      abiBuilder = { build: jest.fn().mockResolvedValue(largeAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('skips persistence and logs kloel_abi_snapshot_oversized', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      // ABI was built successfully
      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['largeField']).toBeDefined();

      // Persistence must NOT be called (oversized)
      expect(kloelMemory.upsert).not.toHaveBeenCalled();

      // Log must be emitted
      const oversizedLogs = mockWarnCalls.filter(([msg]) => msg === 'kloel_abi_snapshot_oversized');
      expect(oversizedLogs).toHaveLength(1);
      expect(oversizedLogs[0][1]).toMatchObject({ workspaceId: 'ws-1' });
      expect(typeof oversizedLogs[0][1].size).toBe('number');
      expect(oversizedLogs[0][1].size as number).toBeGreaterThan(16384);
    });
  });
  describe('no workspaceId', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          {
            provide: PrismaService,
            useValue: {
              kloelMemory,
              workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
            },
          },
          {
            provide: PlanLimitsService,
            useValue: {
              ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
              trackAiUsage: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: KloelThreadService,
            useValue: {
              resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
              getThreadConversationState: jest
                .fn()
                .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
            },
          },
          {
            provide: KloelWorkspaceContextService,
            useValue: {
              getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
              contextFormatter: {
                sanitizeUserNameForAssistant: jest.fn(
                  (n: string | null) => String(n || '').split(' ')[0] || 'U',
                ),
              },
            },
          },
          {
            provide: UnifiedAgentService,
            useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
          },
          { provide: AbiBuilderService, useValue: abiBuilder },
        ],
      }).compile();
      service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
    });

    it('skips cache entirely when workspaceId is not provided', async () => {
      const messages = await service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        recentMessages: [],
        userMessage: 'Hello',
        // no workspaceId
      });
      const cs = extractCognitiveState(messages);

      // ABI builder still runs (no cache)
      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      // No cache query or persistence
      expect(kloelMemory.findUnique).not.toHaveBeenCalled();
      expect(kloelMemory.upsert).not.toHaveBeenCalled();
    });
  });
});
