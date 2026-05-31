import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';

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
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Resposta do assistente'),
}));
describe('KloelReplyEngineService belief observation (PI-k6)', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });
  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  let prisma: {
    workspace: { findUnique: jest.Mock };
    kloelMemory: { upsert: jest.Mock; findUnique: jest.Mock };
  };
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let threadService: Pick<KloelThreadService, 'resolveThread' | 'getThreadConversationState'>;
  let wsContextService: {
    getWorkspaceContext: jest.Mock;
    contextFormatter: { sanitizeUserNameForAssistant: jest.Mock };
  };
  let unifiedAgent: Pick<UnifiedAgentService, 'processIncomingMessage'>;
  let mockObserveBinary: jest.Mock;
  let mockMindBeliefService: { observeBinary: jest.Mock };

  beforeEach(() => {
    mockObserveBinary = jest.fn().mockResolvedValue({
      id: 'belief-1',
      workspaceId: 'ws-1',
      subject: 'ws-1',
      predicate: 'replied_to_user',
      context: { surface: 'dashboard' },
      mean: 0.75,
      variance: 0.04,
      samples: 5,
      alpha: 4,
      beta: 1,
      updatedAt: new Date(),
    });
    mockMindBeliefService = { observeBinary: mockObserveBinary };

    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
      kloelMemory: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
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

  describe('buildAssistantReply observeBinary firing (PI-k6)', () => {
    it('calls observeBinary with surface=dashboard and outcome=1 after successful reply', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          { provide: MindBeliefService, useValue: mockMindBeliefService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });

      expect(result).toBe('Resposta do assistente');
      expect(mockObserveBinary).toHaveBeenCalledTimes(1);
      expect(mockObserveBinary).toHaveBeenCalledWith(
        'ws-1',
        'ws-1',
        'replied_to_user',
        { surface: 'dashboard' },
        1,
      );
    });

    it('calls observeBinary with outcome=0 when reply is empty string', async () => {
      const { buildAssistantReplyImpl } = jest.requireMock<
        typeof import('./kloel-reply-engine.helpers')
      >('./kloel-reply-engine.helpers');
      (buildAssistantReplyImpl as unknown as jest.Mock).mockResolvedValueOnce('');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          { provide: MindBeliefService, useValue: mockMindBeliefService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });

      expect(mockObserveBinary).toHaveBeenCalledWith(
        'ws-1',
        'ws-1',
        'replied_to_user',
        { surface: 'dashboard' },
        0,
      );
    });

    it('tolerates absence of MindBeliefService without throwing', async () => {
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

      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });

      expect(result).toBe('Resposta do assistente');
      // No error thrown — the absence was tolerated
    });

    it('does not call observeBinary when workspaceId is undefined', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          { provide: MindBeliefService, useValue: mockMindBeliefService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      await service.buildAssistantReply({
        message: 'Olá',
      });

      expect(mockObserveBinary).not.toHaveBeenCalled();
    });

    it('catches observeBinary rejection and logs a warning without blocking the reply', async () => {
      const observeError = new Error('DB unavailable');
      mockObserveBinary.mockRejectedValueOnce(observeError);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelReplyEngineService,
          { provide: PrismaService, useValue: prisma },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: KloelThreadService, useValue: threadService },
          { provide: KloelWorkspaceContextService, useValue: wsContextService },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          { provide: MindBeliefService, useValue: mockMindBeliefService },
        ],
      }).compile();

      const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

      // Should NOT throw — the reply must still be returned
      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
      });

      expect(result).toBe('Resposta do assistente');
      expect(mockObserveBinary).toHaveBeenCalledTimes(1);
    });
  });
});
