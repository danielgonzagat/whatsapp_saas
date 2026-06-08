import { wsId } from './kloel-thinker.service.spec.helpers';
import type { KloelComposerService } from './kloel-composer.service';

describe('KloelThinkerService', () => {
  describe('think (SSE)', () => {
    it('accounts estimatedTokens after a successful composer capability call', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: 'Imagem gerada com sucesso.',
          metadata: { capability: 'create_image' },
          estimatedTokens: 512,
        }),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest.fn().mockReturnValue(undefined),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
      const localStreamWriter = { close: jest.fn() };
      const localPlanLimits = {
        ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
      };
      const localLlmBudget = {
        assertBudget: jest.fn().mockResolvedValue(undefined),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };

      await runComposerCapabilityBranch(
        'create_image',
        'Contexto operacional real',
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'gere uma imagem do produto',
          mode: 'chat',
          metadata: { capability: 'create_image' },
          clientRequestId: 'req-1',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits: localPlanLimits,
          llmBudget: localLlmBudget,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      // estimatedTokens flow into the SAME ledgers the normal chat path uses.
      expect(localPlanLimits.trackAiUsage).toHaveBeenCalledWith(wsId, 512);
      expect(localLlmBudget.recordSpend).toHaveBeenCalledWith(wsId, 512);
    });
  });
});
