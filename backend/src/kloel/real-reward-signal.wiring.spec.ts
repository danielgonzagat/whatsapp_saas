import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';

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
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Bem-vindo ao onboarding!' } }],
    model: 'gpt-4o',
    usage: { total_tokens: 100 },
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
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Resposta do assistente'),
}));

function makeDecisionOutcomeMock() {
  return {
    recordDecision: jest.fn().mockResolvedValue(undefined),
    closeOutcome: jest.fn().mockResolvedValue(undefined),
    closeOpenChatReplies: jest.fn().mockResolvedValue(0),
    findOpenByWorkspace: jest.fn().mockResolvedValue([]),
    findClosedByDecisionType: jest.fn().mockResolvedValue([]),
    findAllClosedSince: jest.fn().mockResolvedValue([]),
    findAllClosedSinceForWorkspace: jest.fn().mockResolvedValue([]),
    recordEvent: jest.fn().mockResolvedValue(undefined),
    sweepExpired: jest.fn().mockResolvedValue(0),
  };
}

function makeBaseDeps() {
  return {
    prisma: {
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
      kloelMemory: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    },
    planLimits: {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    },
    threadService: {
      resolveThread: jest.fn().mockResolvedValue({ id: 'thread-1', title: 'Test' }),
      getThreadConversationState: jest.fn().mockResolvedValue({
        recentMessages: [],
        totalMessages: 0,
      }),
    },
    wsContextService: {
      getWorkspaceContext: jest.fn().mockResolvedValue('Workspace context'),
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn((name: string | null | undefined) => {
          const n = String(name || '').trim();
          return n.split(' ')[0] || 'Usuário';
        }),
      },
    },
    unifiedAgent: {
      processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'Agent reply' }),
    },
  };
}

async function buildService(decisionOutcome: ReturnType<typeof makeDecisionOutcomeMock>) {
  const deps = makeBaseDeps();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      KloelReplyEngineService,
      { provide: PrismaService, useValue: deps.prisma },
      { provide: PlanLimitsService, useValue: deps.planLimits },
      { provide: KloelThreadService, useValue: deps.threadService },
      { provide: KloelWorkspaceContextService, useValue: deps.wsContextService },
      { provide: UnifiedAgentService, useValue: deps.unifiedAgent },
      { provide: DecisionOutcomeService, useValue: decisionOutcome },
    ],
  }).compile();
  return module.get<KloelReplyEngineService>(KloelReplyEngineService);
}

describe('KLOEL_REAL_REWARD_SIGNAL chat_reply deferred-reward wiring', () => {
  let decisionOutcome: ReturnType<typeof makeDecisionOutcomeMock>;
  const ORIGINAL = process.env.KLOEL_REAL_REWARD_SIGNAL;

  beforeEach(() => {
    decisionOutcome = makeDecisionOutcomeMock();
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (ORIGINAL === undefined) {
      delete process.env.KLOEL_REAL_REWARD_SIGNAL;
    } else {
      process.env.KLOEL_REAL_REWARD_SIGNAL = ORIGINAL;
    }
  });

  describe('flag OFF (default) — byte-identical to today', () => {
    beforeEach(() => {
      delete process.env.KLOEL_REAL_REWARD_SIGNAL;
    });

    it('closes the chat_reply outcome immediately as chat.replied / won=true', async () => {
      const service = await buildService(decisionOutcome);

      await service.buildAssistantReply({ message: 'Olá', workspaceId: 'ws-1' });

      expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      const closeCalls = decisionOutcome.closeOutcome.mock.calls as Array<
        [{ outcomeName: string; wonVsBaseline: boolean }]
      >;
      const call = closeCalls[0]?.[0];
      expect(call?.outcomeName).toBe('chat.replied');
      expect(call?.wonVsBaseline).toBe(true);
    });

    it('does NOT close prior-open chat_replies (no continuation closer)', async () => {
      const service = await buildService(decisionOutcome);

      await service.buildAssistantReply({ message: 'Olá', workspaceId: 'ws-1' });

      expect(decisionOutcome.closeOpenChatReplies).not.toHaveBeenCalled();
    });
  });

  describe('flag ON — deferred real reward', () => {
    beforeEach(() => {
      process.env.KLOEL_REAL_REWARD_SIGNAL = 'true';
    });

    it('does NOT close the chat_reply as won on a successful reply (left OPEN)', async () => {
      const service = await buildService(decisionOutcome);

      await service.buildAssistantReply({ message: 'Olá', workspaceId: 'ws-1' });

      // The immediate always-win close is suppressed; the open decision waits for
      // the real consequence (sweep LOSS / continuation+commerce WIN).
      const closeCalls = decisionOutcome.closeOutcome.mock.calls as Array<
        [{ outcomeName?: string }]
      >;
      const wonCloses = closeCalls.filter((c) => c[0]?.outcomeName === 'chat.replied');
      expect(wonCloses).toHaveLength(0);
    });

    it('closes prior-open chat_replies as a continuation WIN at the start of the reply', async () => {
      const service = await buildService(decisionOutcome);

      await service.buildAssistantReply({ message: 'Olá', workspaceId: 'ws-1' });

      expect(decisionOutcome.closeOpenChatReplies).toHaveBeenCalledTimes(1);
      const continueCalls = decisionOutcome.closeOpenChatReplies.mock.calls as Array<
        [string, { outcomeName: string; wonVsBaseline: boolean }]
      >;
      const wsArg = continueCalls[0]?.[0];
      const optsArg = continueCalls[0]?.[1];
      expect(wsArg).toBe('ws-1');
      expect(optsArg?.outcomeName).toBe('chat.continued');
      expect(optsArg?.wonVsBaseline).toBe(true);
    });

    it('still records the chat_reply decision (the open row the consequence will close)', async () => {
      const service = await buildService(decisionOutcome);

      await service.buildAssistantReply({ message: 'Olá', workspaceId: 'ws-1' });

      expect(decisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
      const recordCalls = decisionOutcome.recordDecision.mock.calls as Array<
        [{ decisionType: string }]
      >;
      const rec = recordCalls[0]?.[0];
      expect(rec?.decisionType).toBe('chat_reply');
    });

    it('still closes as chat.error / won=false when the reply throws (error is always a LOSS)', async () => {
      const helpersMock = jest.requireMock<typeof import('./kloel-reply-engine.helpers')>(
        './kloel-reply-engine.helpers',
      );
      (helpersMock.buildAssistantReplyImpl as jest.Mock).mockRejectedValueOnce(
        new Error('LLM timeout'),
      );

      const service = await buildService(decisionOutcome);

      await expect(
        service.buildAssistantReply({ message: 'Olá', workspaceId: 'ws-1' }),
      ).rejects.toThrow('LLM timeout');

      const closeCalls = decisionOutcome.closeOutcome.mock.calls as Array<
        [{ outcomeName?: string; wonVsBaseline?: boolean }]
      >;
      const errorCloses = closeCalls.filter((c) => c[0]?.outcomeName === 'chat.error');
      expect(errorCloses).toHaveLength(1);
      expect(errorCloses[0]?.[0]?.wonVsBaseline).toBe(false);
    });
  });
});
