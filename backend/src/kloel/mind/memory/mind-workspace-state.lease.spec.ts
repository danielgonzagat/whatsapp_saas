import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from '../../kloel-reply-engine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanLimitsService } from '../../../billing/plan-limits.service';
import { KloelThreadService } from '../../kloel-thread.service';
import { KloelWorkspaceContextService } from '../../kloel-workspace-context.service';
import { UnifiedAgentService } from '../../unified-agent.service';
import { MindWorkspaceStateService } from './mind-workspace-state.service';

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
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Assistant reply'),
}));

describe('MindWorkspaceState tick lease in chat reply (PI-K16-B)', () => {
  let service: KloelReplyEngineService;
  let leaseService: { tryAcquireTickLease: jest.Mock; releaseTickLease: jest.Mock };
  let prisma: { workspace: { findUnique: jest.Mock } };
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let threadService: Pick<KloelThreadService, 'resolveThread' | 'getThreadConversationState'>;
  let wsContextService: {
    getWorkspaceContext: jest.Mock;
    contextFormatter: { sanitizeUserNameForAssistant: jest.Mock };
  };
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    leaseService = {
      tryAcquireTickLease: jest.fn().mockResolvedValue(true),
      releaseTickLease: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test WS' }) },
    };

    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    threadService = {
      resolveThread: jest.fn().mockResolvedValue({ id: 'thread-1', messages: [] }),
      getThreadConversationState: jest.fn().mockResolvedValue({
        recentMessages: [],
        totalMessages: 0,
      }),
    };

    wsContextService = {
      getWorkspaceContext: jest.fn().mockResolvedValue({ name: 'Test WS' }),
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn().mockReturnValue('User'),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: UnifiedAgentService, useValue: { processIncomingMessage: jest.fn() } },
        { provide: MindWorkspaceStateService, useValue: leaseService },
      ],
    }).compile();

    service = module.get(KloelReplyEngineService);

    loggerWarnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger,
      'warn',
    );
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  describe('lease acquired', () => {
    it('proceeds with reply and releases the lease', async () => {
      leaseService.tryAcquireTickLease.mockResolvedValue(true);

      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
        userName: 'User',
      });

      expect(result).toBe('Assistant reply');
      expect(leaseService.tryAcquireTickLease).toHaveBeenCalledWith(
        'ws-1',
        expect.stringMatching(/^chat-reply-/),
        5000,
      );
      expect(leaseService.releaseTickLease).toHaveBeenCalledWith(
        'ws-1',
        expect.stringMatching(/^chat-reply-/),
      );
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('lease unavailable', () => {
    it('logs warning and still proceeds with reply', async () => {
      leaseService.tryAcquireTickLease.mockResolvedValue(false);

      const result = await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-1',
        userName: 'User',
      });

      expect(result).toBe('Assistant reply');
      expect(loggerWarnSpy).toHaveBeenCalledWith('kloel_chat_tick_lease_unavailable', {
        workspaceId: 'ws-1',
      });
      // Must NOT release a lease we never acquired
      expect(leaseService.releaseTickLease).not.toHaveBeenCalled();
    });
  });

  describe('service absent', () => {
    it('proceeds without lease attempt when workspaceId is missing', async () => {
      // workspaceId omitted — lease should be skipped entirely
      const result = await service.buildAssistantReply({
        message: 'Olá',
        userName: 'User',
      });

      expect(result).toBe('Assistant reply');
      expect(leaseService.tryAcquireTickLease).not.toHaveBeenCalled();
      expect(leaseService.releaseTickLease).not.toHaveBeenCalled();
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('lease owner is workspace-specific', () => {
    it('uses distinct owners per call', async () => {
      leaseService.tryAcquireTickLease.mockResolvedValue(true);

      await service.buildAssistantReply({
        message: 'Olá',
        workspaceId: 'ws-A',
        userName: 'User',
      });

      await service.buildAssistantReply({
        message: 'Tudo bem?',
        workspaceId: 'ws-B',
        userName: 'User',
      });

      const [[wsA, ownerA], [wsB, ownerB]] = leaseService.tryAcquireTickLease.mock.calls as [
        string,
        string,
        number,
      ][];

      expect(wsA).toBe('ws-A');
      expect(wsB).toBe('ws-B');
      expect(ownerA).not.toBe(ownerB);
      expect(ownerA).toMatch(/^chat-reply-/);
      expect(ownerB).toMatch(/^chat-reply-/);
    });
  });
});
