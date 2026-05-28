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
describe('KloelReplyEngineService mind-signal wiring (PI-k3)', () => {
  let prisma: { workspace: { findUnique: jest.Mock } };
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let threadService: Pick<KloelThreadService, 'resolveThread' | 'getThreadConversationState'>;
  let wsContextService: {
    getWorkspaceContext: jest.Mock;
    contextFormatter: { sanitizeUserNameForAssistant: jest.Mock };
  };
  let unifiedAgent: Pick<UnifiedAgentService, 'processIncomingMessage'>;

  beforeEach(() => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
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
    it('populates mindSignals with {status: "no_event_source"} when services are injected', async () => {
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
      expect(cs['mindSignals']).toEqual({ status: 'no_event_source' });
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
      expect(cs['mindSignals']).toEqual({ status: 'no_services' });
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
      expect(cs['mindSignals']).toEqual({ status: 'no_services' });
    });
  });
});
