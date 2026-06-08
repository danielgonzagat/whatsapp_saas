import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';
import { AttentionService } from './mind/attention.service';
import { ValenceAggregatorService } from './mind/valence-aggregator.service';

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'mock-key',
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Resposta de teste' } }],
    usage: { total_tokens: 80 },
  }),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn().mockReturnValue(actual.CANONICAL_MODEL_IDS.openAiTextOmni),
  };
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
describe('KloelReplyEngineService mind-signal attention wiring (PI-k4)', () => {
  let prisma: { workspace: { findUnique: jest.Mock }; autopilotEvent: { findMany: jest.Mock } };
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let threadService: Pick<KloelThreadService, 'resolveThread' | 'getThreadConversationState'>;
  let wsContextService: {
    getWorkspaceContext: jest.Mock;
    contextFormatter: { sanitizeUserNameForAssistant: jest.Mock };
  };
  let unifiedAgent: Pick<UnifiedAgentService, 'processIncomingMessage'>;

  const makeAutopilotRow = (
    overrides: Partial<{ id: string; intent: string; action: string; createdAt: Date }> = {},
  ) => ({
    id: overrides.id ?? 'evt-001',
    intent: overrides.intent ?? 'commerce.lead.replied',
    action: overrides.action ?? '',
    createdAt: overrides.createdAt ?? new Date(),
  });

  beforeEach(() => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
      autopilotEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    threadService = {
      resolveThread: jest.fn().mockResolvedValue({ id: 'thread-1', title: 'Test' }),
      getThreadConversationState: jest.fn().mockResolvedValue({
        recentMessages: [],
        totalMessages: 0,
      }),
    };
    wsContextService = {
      getWorkspaceContext: jest.fn().mockResolvedValue('Workspace context'),
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn((name: string | null | undefined) => {
          const n = String(name || '').trim();
          return n.split(' ')[0] || 'Usuário';
        }),
      },
    };
    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'Agent reply' }),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('buildChatModelMessages mindSignals', () => {
    it('queries Prisma with correct shape and feeds AttentionService when services are injected', async () => {
      const rows = [
        makeAutopilotRow({
          id: 'evt-1',
          intent: 'commerce.lead.replied',
          createdAt: new Date('2026-05-28T11:55:00Z'),
        }),
        makeAutopilotRow({
          id: 'evt-2',
          intent: 'commerce.cart.abandoned',
          action: '',
          createdAt: new Date('2026-05-28T11:50:00Z'),
        }),
      ];
      prisma.autopilotEvent.findMany.mockResolvedValue(rows);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          AttentionService,
          ValenceAggregatorService,
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const messages = await service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        recentMessages: [],
        userMessage: 'Hello',
        workspaceId: 'ws-1',
      });

      // Verify Prisma was queried with the right shape
      expect(prisma.autopilotEvent.findMany).toHaveBeenCalledTimes(1);
      type FindManyArg = {
        where: { workspaceId: string; createdAt: { gte: Date } };
        orderBy: { createdAt: string };
        take: number;
        select: Record<string, boolean>;
      };
      const calls = prisma.autopilotEvent.findMany.mock.calls as Array<[FindManyArg]>;
      const findManyArg = calls[0]?.[0];
      expect(findManyArg.where.workspaceId).toBe('ws-1');
      expect(findManyArg.where.createdAt.gte).toBeInstanceOf(Date);
      expect(findManyArg.orderBy).toEqual({ createdAt: 'desc' });
      expect(findManyArg.take).toBe(50);
      expect(findManyArg.select).toEqual({ id: true, intent: true, action: true, createdAt: true });

      // Verify mindSignals contains real attention, not a status stub
      const lastContent = messages[messages.length - 1]?.content;
      const lastContentStr = typeof lastContent === 'string' ? lastContent : '{}';
      const userPayload = JSON.parse(lastContentStr) as Record<string, unknown>;
      const cs = userPayload['cognitiveState'] as Record<string, unknown>;
      const ms = cs['mindSignals'] as Record<string, unknown>;

      expect(ms['source']).toBe('autopilot_events');
      expect(ms['eventCount']).toBe(2);
      expect(ms['attention']).toBeDefined();
      const att = ms['attention'] as Record<string, unknown>;
      expect(att['candidates']).toBeInstanceOf(Array);
      // Attention should have no focal without entityRef
      expect(att['focal']).toBeUndefined();
    });

    it('falls back to empty events on Prisma timeout, logs kloel_event_source_timeout', async () => {
      prisma.autopilotEvent.findMany.mockRejectedValue(new Error('timeout'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          AttentionService,
          ValenceAggregatorService,
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const messages = await service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        recentMessages: [],
        userMessage: 'Hello',
        workspaceId: 'ws-1',
      });

      const lastContent = messages[messages.length - 1]?.content;
      const lastContentStr = typeof lastContent === 'string' ? lastContent : '{}';
      const userPayload = JSON.parse(lastContentStr) as Record<string, unknown>;
      const cs = userPayload['cognitiveState'] as Record<string, unknown>;
      const ms = cs['mindSignals'] as Record<string, unknown>;
      expect(ms['source']).toBe('autopilot_events');
      expect(ms['eventCount']).toBe(0);
      expect(ms['attention']).toBeDefined();
      const att = ms['attention'] as Record<string, unknown>;
      expect(att['candidates']).toEqual([]);
    });

    it('sets mindSignals to {status: "no_services"} when attention service is absent', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const messages = await service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        recentMessages: [],
        userMessage: 'Hello',
      });

      const lastContent = messages[messages.length - 1]?.content;
      const lastContentStr = typeof lastContent === 'string' ? lastContent : '{}';
      const userPayload = JSON.parse(lastContentStr) as Record<string, unknown>;
      const cs = userPayload['cognitiveState'] as Record<string, unknown>;
      expect(cs['mindSignals']).toEqual({ status: 'no_services', concepts: [] });
    });

    it('sets mindSignals to {status: "no_services"} when only attentionService is present (valenceAggregatorService missing)', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          AttentionService,
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const messages = await service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        recentMessages: [],
        userMessage: 'Hello',
        workspaceId: 'ws-1',
      });

      const lastContent = messages[messages.length - 1]?.content;
      const lastContentStr = typeof lastContent === 'string' ? lastContent : '{}';
      const userPayload = JSON.parse(lastContentStr) as Record<string, unknown>;
      const cs = userPayload['cognitiveState'] as Record<string, unknown>;
      expect(cs['mindSignals']).toEqual({ status: 'no_services', concepts: [] });
    });
  });
});
