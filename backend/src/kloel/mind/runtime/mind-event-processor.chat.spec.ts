import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from '../../kloel-reply-engine.service';
import { MindEventProcessorService } from './mind-event-processor.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanLimitsService } from '../../../billing/plan-limits.service';
import { KloelThreadService } from '../../kloel-thread.service';
import { KloelWorkspaceContextService } from '../../kloel-workspace-context.service';
import { UnifiedAgentService } from '../../unified-agent.service';

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'mock-key',
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('../../openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Resposta de teste' } }],
    usage: { total_tokens: 80 },
  }),
}));

jest.mock('../../../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../../../lib/openai-models')>(
    '../../../lib/openai-models',
  );
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn().mockReturnValue(actual.CANONICAL_MODEL_IDS.openAiTextOmni),
  };
});

jest.mock('../../kloel-reply-engine.helpers', () => ({
  WHITESPACE_RE: /\s+/,
  RELAT_O__RIO_DOCUMENTO_RE: /relat[oó]rio|documento/i,
  CRIE_CADASTRAR_CADASTRE_RE: /crie|cadastrar|cadastre/i,
  PRODUTO_CAT_A__LOGO_AUT_RE: /produto|cat[aá]logo|automa/i,
  KLOEL_STREAM_ABORT_REASON_TIMEOUT: 'kloel_stream_timeout',
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED: 'client_disconnected',
  buildDynamicRuntimeContextHelper: jest.fn().mockResolvedValue('Dynamic context'),
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Resposta do assistente'),
}));

describe('MindEventProcessorService chat fast-path (PI-K18-B)', () => {
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
  let mockProcess: jest.Mock;
  let mockMindEventProcessor: { process: jest.Mock };

  beforeEach(() => {
    mockProcess = jest.fn().mockResolvedValue({
      predicted: 0,
      resolved: 0,
      surpriseSum: 0,
      beliefsUpdated: 0,
    });
    mockMindEventProcessor = { process: mockProcess };

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

  /**
   * Flush pending microtasks and a macrotask tick so fire-and-forget
   * void(async () => { … })() IIFEs settle before assertions.
   */
  const flushFireAndForget = (): Promise<void> =>
    new Promise<void>((resolve) => setTimeout(resolve, 10));

  it('calls mindEventProcessorService.process with chat.replied on successful reply', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: MindEventProcessorService, useValue: mockMindEventProcessor },
      ],
    }).compile();

    const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

    const result = await service.buildAssistantReply({
      message: 'Olá',
      workspaceId: 'ws-1',
    });

    expect(result).toBe('Resposta do assistente');
    await flushFireAndForget();

    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(mockProcess).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      kind: 'chat.replied',
      subject: 'workspace:ws-1',
      occurredAt: expect.any(Date) as Date,
      payload: {
        surface: 'dashboard',
        success: true,
        degraded: false,
      },
    });
  });

  it('calls mindEventProcessorService.process with degraded payload on degraded reply', async () => {
    const helpersMock = jest.requireMock<{
      buildAssistantReplyImpl: jest.Mock<Promise<string>, unknown[]>;
    }>('../../kloel-reply-engine.helpers');
    helpersMock.buildAssistantReplyImpl.mockResolvedValueOnce('');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: MindEventProcessorService, useValue: mockMindEventProcessor },
      ],
    }).compile();

    const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

    await service.buildAssistantReply({
      message: 'Olá',
      workspaceId: 'ws-1',
    });

    await flushFireAndForget();

    const innerPayload: jest.Expect = expect.objectContaining({
      success: false,
      degraded: true,
    });
    const outerArg: jest.Expect = expect.objectContaining({ payload: innerPayload });
    expect(mockProcess).toHaveBeenCalledWith(
      outerArg,
    );
  });

  it('does not throw when MindEventProcessorService is absent', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        // MindEventProcessorService NOT provided — tests @Optional() tolerance
      ],
    }).compile();

    const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

    const result = await service.buildAssistantReply({
      message: 'Olá',
      workspaceId: 'ws-1',
    });

    expect(result).toBe('Resposta do assistente');
    await flushFireAndForget();
    // No error thrown — the @Optional() absence was tolerated
  });

  it('logs kloel_mind_event_processor_skipped when process throws, reply unaffected', async () => {
    mockProcess.mockRejectedValueOnce(new Error('DB timeout'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: MindEventProcessorService, useValue: mockMindEventProcessor },
      ],
    }).compile();

    const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

    // Access private logger to spy on warn
    const loggerWarnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger,
      'warn',
    );

    const result = await service.buildAssistantReply({
      message: 'Olá',
      workspaceId: 'ws-1',
    });

    expect(result).toBe('Resposta do assistente');
    await flushFireAndForget();

    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'kloel_mind_event_processor_skipped',
      expect.objectContaining({
        reason: 'DB timeout',
      }),
    );
  });

  it('does not call process when workspaceId is undefined', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: MindEventProcessorService, useValue: mockMindEventProcessor },
      ],
    }).compile();

    const service = module.get<KloelReplyEngineService>(KloelReplyEngineService);

    await service.buildAssistantReply({
      message: 'Olá',
      // no workspaceId
    });

    await flushFireAndForget();

    expect(mockProcess).not.toHaveBeenCalled();
  });
});
