import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';
import { MarketingSkillService } from './marketing-skills/marketing-skill.service';

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

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('gpt-4o'),
}));

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

describe('KloelReplyEngineService', () => {
  let service: KloelReplyEngineService;
  let prisma: { workspace: { findUnique: jest.Mock } };
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let threadService: Pick<KloelThreadService, 'resolveThread' | 'getThreadConversationState'>;
  let wsContextService: {
    getWorkspaceContext: jest.Mock;
    contextFormatter: { sanitizeUserNameForAssistant: jest.Mock };
  };
  let unifiedAgent: Pick<UnifiedAgentService, 'processIncomingMessage'>;
  let marketingSkill: Pick<MarketingSkillService, 'buildPacket'>;

  beforeEach(async () => {
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
      getWorkspaceContext: jest.fn().mockResolvedValue('Workspace context content'),
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
    marketingSkill = {
      buildPacket: jest.fn().mockResolvedValue({ promptAddendum: 'Marketing context' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: MarketingSkillService, useValue: marketingSkill },
      ],
    }).compile();

    service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildDashboardPrompt', () => {
    it('returns a string with workspace and user info', () => {
      const prompt = service.buildDashboardPrompt({
        userName: 'Daniel',
        workspaceName: 'Kloel',
      });
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('handles empty params', () => {
      const prompt = service.buildDashboardPrompt();
      expect(typeof prompt).toBe('string');
    });
  });

  describe('detectExpertiseLevel', () => {
    it('returns EXPERT for high-signal message', () => {
      const level = service.detectExpertiseLevel(
        'Preciso configurar webhook com idempotência e backpressure no postgres',
      );
      expect(level).toBe('EXPERT');
    });

    it('returns AVANÇADO for advanced signals', () => {
      const level = service.detectExpertiseLevel(
        'Quero integrar API de automação com CRM e pipeline',
      );
      expect(level).toBe('AVANÇADO');
    });

    it('returns INTERMEDIÁRIO for moderate messages', () => {
      const level = service.detectExpertiseLevel(
        'Preciso de ajuda com a configuração de automação e segmentação',
      );
      expect(level).toBe('INTERMEDIÁRIO');
    });

    it('returns INICIANTE for simple messages', () => {
      const level = service.detectExpertiseLevel('Oi, como funciona?');
      expect(level).toBe('INICIANTE');
    });

    it('considers conversation history with expertise signals', () => {
      const level = service.detectExpertiseLevel('Sim, e também quero integrar API de automação', [
        { role: 'user', content: 'Preciso de integração API' },
        { role: 'user', content: 'Configurar pipeline e conversão' },
        { role: 'assistant', content: 'Claro' },
        { role: 'user', content: 'Tem checkpoint também' },
      ]);
      expect(level).toBe('AVANÇADO');
    });
  });

  describe('shouldUseLongFormBudget', () => {
    it('returns true for report-like messages', () => {
      expect(service.shouldUseLongFormBudget('Crie um relatório completo')).toBe(true);
    });

    it('returns false for chat messages', () => {
      expect(service.shouldUseLongFormBudget('Oi, tudo bem?')).toBe(false);
    });
  });

  describe('shouldAttemptToolPlanningPass', () => {
    it('returns true for product catalog messages', () => {
      expect(service.shouldAttemptToolPlanningPass('Crie um produto novo no catálogo')).toBe(true);
    });

    it('returns false for ideas-only messages', () => {
      expect(service.shouldAttemptToolPlanningPass('Me dê ideias de produtos')).toBe(false);
    });

    it('returns false for simple messages', () => {
      expect(service.shouldAttemptToolPlanningPass('Oi')).toBe(false);
    });
  });

  describe('buildStreamAbortMessage', () => {
    it('returns timeout message', () => {
      const msg = service.buildStreamAbortMessage('kloel_stream_timeout', 30000);
      expect(msg).toContain('30s');
    });

    it('returns client disconnected', () => {
      expect(service.buildStreamAbortMessage('client_disconnected')).toBe('client_disconnected');
    });

    it('returns unavailable fallback', () => {
      const msg = service.buildStreamAbortMessage('other_reason');
      expect(msg).toContain('motor de resposta');
    });
  });

  describe('isClientDisconnected', () => {
    it('returns true for client_disconnected', () => {
      expect(service.isClientDisconnected('client_disconnected')).toBe(true);
    });

    it('returns false for other reasons', () => {
      expect(service.isClientDisconnected('timeout')).toBe(false);
    });
  });

  describe('buildChatModelMessages', () => {
    it('builds messages array with system prompts and user message', () => {
      const messages = service.buildChatModelMessages({
        systemPrompt: 'System prompt',
        dynamicContext: 'Dynamic context',
        recentMessages: [],
        userMessage: 'Hello',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('system');
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toBe('Hello');
    });

    it('includes marketing addendum when provided', () => {
      const messages = service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        marketingPromptAddendum: 'Marketing',
        recentMessages: [],
        userMessage: 'Hello',
      });
      expect(messages).toHaveLength(4);
    });

    it('includes summary message when provided', () => {
      const messages = service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        summaryMessage: { role: 'system', content: 'Summary' },
        recentMessages: [],
        userMessage: 'Hello',
      });
      expect(messages).toHaveLength(4);
    });

    it('includes recent history', () => {
      const messages = service.buildChatModelMessages({
        systemPrompt: 'S',
        dynamicContext: 'D',
        recentMessages: [
          { role: 'user', content: 'Q' },
          { role: 'assistant', content: 'A' },
        ],
        userMessage: 'New Q',
      });
      expect(messages).toHaveLength(5);
    });
  });

  describe('buildMarketingPromptAddendum', () => {
    it('returns addendum from marketing skill service', async () => {
      const result = await service.buildMarketingPromptAddendum('ws-1', 'chat', 'message');
      expect(result).toBe('Marketing context');
      expect(marketingSkill.buildPacket).toHaveBeenCalledWith('ws-1', 'message');
    });

    it('returns null when mode is not chat', async () => {
      const result = await service.buildMarketingPromptAddendum('ws-1', 'onboarding', 'msg');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      marketingSkill.buildPacket = jest.fn().mockRejectedValue(new Error('fail'));
      const result = await service.buildMarketingPromptAddendum('ws-1', 'chat', 'msg');
      expect(result).toBeNull();
    });
  });

  describe('buildDynamicRuntimeContext', () => {
    it('delegates to helper', async () => {
      const result = await service.buildDynamicRuntimeContext({
        workspaceId: 'ws-1',
        userName: 'User',
        expertiseLevel: 'INICIANTE',
      });
      expect(result).toBe('Dynamic context');
    });
  });

  describe('buildAssistantReply', () => {
    it('delegates to buildAssistantReplyImpl', async () => {
      const result = await service.buildAssistantReply({
        message: 'Hello',
        workspaceId: 'ws-1',
        userName: 'User',
      });
      expect(typeof result).toBe('string');
    });
  });

  describe('error handling', () => {
    it('hasOpenAiKey returns boolean', () => {
      const result = service.hasOpenAiKey();
      expect(typeof result).toBe('boolean');
    });
  });
});
