import { Test, TestingModule } from '@nestjs/testing';
import { KloelThinkerService } from './kloel-thinker.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService, estimateChatCostCents } from './llm-budget.service';
import { Response } from 'express';

jest.mock('./kloel-thread.service', () => ({
  KloelThreadService: class MockKloelThreadService {},
  StoredProcessingTraceEntry: undefined,
  StoredResponseVersion: undefined,
  ChatMessage: undefined,
  ThreadConversationState: undefined,
}));

jest.mock('./kloel-workspace-context.service', () => ({
  KloelWorkspaceContextService: class MockKloelWorkspaceContextService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('./kloel-reply-engine.service', () => ({
  KloelReplyEngineService: class MockKloelReplyEngineService {},
  LocalToolExecutor: undefined,
}));

jest.mock('./kloel-llm-e2e-guard', () => ({
  KLOEL_LLM_E2E_GUARD: Symbol('KLOEL_LLM_E2E_GUARD'),
  KloelLLME2EGuard: class MockKloelLLME2EGuard {},
  NoopKloelLLME2EGuard: class MockNoopKloelLLME2EGuard {},
}));

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: class MockKloelConversationStore {},
}));

import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';
import { KLOEL_LLM_E2E_GUARD, KloelLLME2EGuard } from './kloel-llm-e2e-guard';

jest.mock('./kloel-thinker.helpers', () => ({
  thinkSyncImpl: jest.fn(),
  regenerateThreadAssistantResponseImpl: jest.fn(),
}));

jest.mock('./kloel-thinker-think.helpers', () => ({
  runComposerCapabilityBranch: jest.fn(),
  runToolPlanningBranch: jest.fn(),
  finalizeSuccessfulReply: jest.fn(),
}));

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: jest.fn().mockImplementation(() => ({
    getConversationMessages: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('./kloel-stream-writer', () => ({
  KloelStreamWriter: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    write: jest.fn(),
    close: jest.fn(),
    streamModelResponse: jest.fn(),
  })),
}));

type ThinkerPrismaMock = {
  workspace: { findUnique: jest.Mock };
  agent: { findFirst: jest.Mock };
  chatThread: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  chatMessage: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

describe('KloelThinkerService', () => {
  let service: KloelThinkerService;
  let prisma: ThinkerPrismaMock;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let llmBudget: Pick<LLMBudgetService, 'assertBudget' | 'recordSpend'>;
  let threadService: Pick<
    KloelThreadService,
    | 'resolveThread'
    | 'getThreadConversationState'
    | 'buildThreadSummarySystemMessage'
    | 'persistUserThreadMessage'
    | 'buildThreadMessageMetadata'
    | 'resolveClientRequestId'
    | 'appendStoredProcessingTraceEntry'
  >;
  let wsContextService: Pick<KloelWorkspaceContextService, 'getWorkspaceContext'>;
  let composerService: Pick<KloelComposerService, 'searchWeb'>;
  let replyEngine: Pick<
    KloelReplyEngineService,
    | 'hasOpenAiKey'
    | 'buildDashboardPrompt'
    | 'buildChatModelMessages'
    | 'buildDynamicRuntimeContext'
    | 'buildMarketingPromptAddendum'
    | 'detectExpertiseLevel'
    | 'shouldAttemptToolPlanningPass'
    | 'shouldUseLongFormBudget'
    | 'isClientDisconnected'
    | 'buildStreamAbortMessage'
    | 'openai'
    | 'unavailableMessage'
    | 'contextFormatter'
  >;
  let llmE2EGuard: Pick<KloelLLME2EGuard, 'isEnabled' | 'buildStream'>;
  const {
    thinkSyncImpl,
    regenerateThreadAssistantResponseImpl,
  } = require('./kloel-thinker.helpers');
  const { finalizeSuccessfulReply } = require('./kloel-thinker-think.helpers');
  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: wsId }) },
      agent: { findFirst: jest.fn().mockResolvedValue({ name: 'Test User' }) },
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'thread-1',
          title: 'Nova conversa',
          summary: null,
          summaryUpdatedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest
        .fn()
        .mockImplementation((arg: unknown) =>
          typeof arg === 'function' ? arg(prisma) : Promise.resolve(undefined),
        ),
    };

    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    llmBudget = {
      assertBudget: jest.fn().mockResolvedValue(undefined),
      recordSpend: jest.fn().mockResolvedValue(undefined),
    };

    threadService = {
      resolveThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        title: 'Nova conversa',
        summary: null,
        summaryUpdatedAt: null,
      }),
      getThreadConversationState: jest
        .fn()
        .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
      buildThreadSummarySystemMessage: jest.fn().mockReturnValue(null),
      persistUserThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-user-1' }),
      buildThreadMessageMetadata: jest.fn().mockReturnValue({}),
      resolveClientRequestId: jest.fn().mockReturnValue('req-1'),
      appendStoredProcessingTraceEntry: jest.fn(),
    };

    wsContextService = {
      getWorkspaceContext: jest.fn().mockResolvedValue('Company context'),
    };

    composerService = {
      searchWeb: jest.fn().mockResolvedValue({ answer: 'result', sources: [] }),
    };

    replyEngine = {
      hasOpenAiKey: jest.fn().mockReturnValue(true),
      buildDashboardPrompt: jest.fn().mockReturnValue('system prompt'),
      buildChatModelMessages: jest.fn().mockReturnValue([]),
      buildDynamicRuntimeContext: jest.fn().mockResolvedValue([]),
      buildMarketingPromptAddendum: jest.fn().mockResolvedValue([]),
      detectExpertiseLevel: jest.fn().mockReturnValue('beginner'),
      shouldAttemptToolPlanningPass: jest.fn().mockReturnValue(false),
      shouldUseLongFormBudget: jest.fn().mockReturnValue(false),
      isClientDisconnected: jest.fn().mockReturnValue(false),
      buildStreamAbortMessage: jest.fn().mockReturnValue('timeout'),
      openai: {} as Pick<KloelReplyEngineService, 'openai'>['openai'],
      unavailableMessage: 'Indisponível no momento.',
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn().mockReturnValue('User'),
      } as Pick<KloelReplyEngineService, 'contextFormatter'>['contextFormatter'],
    };

    llmE2EGuard = {
      isEnabled: jest.fn().mockReturnValue(false),
      buildStream: jest.fn(),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelThinkerService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: LLMBudgetService, useValue: llmBudget },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: KloelComposerService, useValue: composerService },
        { provide: KloelReplyEngineService, useValue: replyEngine },
        { provide: KLOEL_LLM_E2E_GUARD, useValue: llmE2EGuard },
      ],
    }).compile();

    service = module.get<KloelThinkerService>(KloelThinkerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('think (SSE)', () => {
    it('writes error event and closes when API key is missing', async () => {
      replyEngine.hasOpenAiKey = jest.fn().mockReturnValue(false);
      jest.replaceProperty(process, 'env', { ...process.env, ANTHROPIC_API_KEY: '' });

      await expect(
        service.think(
          { message: 'hello', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
        ),
      ).resolves.toBeUndefined();
    });

    it('does not throw when request is aborted before start', async () => {
      const signal = AbortSignal.abort();

      await expect(
        service.think(
          { message: 'hello', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
          { signal },
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('thinkSync', () => {
    it('delegates to thinkSyncImpl and returns result', async () => {
      const mockResult = { response: 'Hello!', conversationId: 'conv-1', title: 'Title' };
      thinkSyncImpl.mockResolvedValue(mockResult);

      const result = await service.thinkSync(
        { message: 'hello', workspaceId: wsId },
        null,
        undefined,
        undefined,
      );

      expect(thinkSyncImpl).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('propagates errors from thinkSyncImpl', async () => {
      thinkSyncImpl.mockRejectedValue(new Error('LLM failure'));
      await expect(
        service.thinkSync({ message: 'hello', workspaceId: wsId }, null, undefined, undefined),
      ).rejects.toThrow('LLM failure');
    });

    it('passes workspaceId to thinkSyncImpl', async () => {
      thinkSyncImpl.mockResolvedValue({ response: 'Ok' });
      await service.thinkSync(
        { message: 'hello', workspaceId: 'ws-tenant' },
        null,
        undefined,
        undefined,
      );
      const callArgs = thinkSyncImpl.mock.calls[0][0];
      expect(callArgs.workspaceId).toBe('ws-tenant');
    });
  });

  describe('regenerateThreadAssistantResponse', () => {
    it('delegates to regenerateThreadAssistantResponseImpl', async () => {
      const mockRegenerated = {
        id: 'msg-2',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Regenerated response',
        metadata: null,
        createdAt: new Date(),
        deletedMessageIds: ['msg-1'],
      };
      regenerateThreadAssistantResponseImpl.mockResolvedValue(mockRegenerated);

      const result = await service.regenerateThreadAssistantResponse({
        workspaceId: wsId,
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });

      expect(regenerateThreadAssistantResponseImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          conversationId: 'conv-1',
          assistantMessageId: 'msg-1',
        }),
        expect.any(Object),
      );
      expect(result).toEqual(mockRegenerated);
    });

    it('propagates errors from regenerateThreadAssistantResponseImpl', async () => {
      regenerateThreadAssistantResponseImpl.mockRejectedValue(new Error('Thread not found'));
      await expect(
        service.regenerateThreadAssistantResponse({
          workspaceId: wsId,
          conversationId: 'conv-1',
          assistantMessageId: 'msg-1',
        }),
      ).rejects.toThrow('Thread not found');
    });
  });

  describe('error handling', () => {
    it('thinkSync propagates error when helper throws', async () => {
      thinkSyncImpl.mockRejectedValue(new Error('Budget exceeded'));
      await expect(
        service.thinkSync({ message: 'hello', workspaceId: wsId }, null, undefined, undefined),
      ).rejects.toThrow('Budget exceeded');
    });
  });
});
