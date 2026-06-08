import { wsId, planLimits } from './kloel-thinker.service.spec.helpers';
import type { KloelComposerService } from './kloel-composer.service';

describe('KloelThinkerService', () => {
  describe('think (SSE)', () => {
    it('normalizes refine_response markdown at the SSE stream and persistence boundary', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const rawContent =
        '## Diagnóstico executivo Texto bruto inline. ## Lacunas e riscos * Risco um. * Risco dois. ## Versão refinada * Item refinado. ## Próxima ação verificável Validar no Chrome.';
      const normalizedContent =
        '## Diagnóstico executivo\n\nTexto bruto inline.\n\n## Lacunas e riscos\n\n* Risco um.\n* Risco dois.\n\n## Versão refinada\n\n* Item refinado.\n\n## Próxima ação verificável\n\nValidar no Chrome.';
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: rawContent,
          metadata: { capability: 'refine_response' },
        }),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await runComposerCapabilityBranch(
        'refine_response',
        'Contexto operacional real',
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'Refine para documentação pública',
          mode: 'chat',
          metadata: { capability: 'refine_response' },
          clientRequestId: 'req-refine-normalize',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'content', content: normalizedContent }),
        ]),
      );
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        normalizedContent,
        expect.objectContaining({ capability: 'refine_response' }),
      );
      expect(localConversationStore.saveMessage).toHaveBeenLastCalledWith(
        wsId,
        'assistant',
        normalizedContent,
      );
    });

    it('turns composer provider setup errors into persisted user-facing replies', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const { ERR_SITE_API_KEY_MISSING } = jest.requireActual<
        typeof import('./kloel-composer.service.helpers')
      >('./kloel-composer.service.helpers');
      const localComposerService = {
        executeComposerCapability: jest.fn().mockRejectedValue(new Error(ERR_SITE_API_KEY_MISSING)),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await expect(
        runComposerCapabilityBranch(
          'create_site',
          undefined,
          undefined,
          localComposerService as unknown as KloelComposerService,
          {
            workspaceId: wsId,
            message: 'Crie uma landing page',
            mode: 'chat',
            metadata: { capability: 'create_site' },
            clientRequestId: 'req-site-missing-provider',
            thread: { id: 'thread-1', title: 'Nova conversa' },
            persistedUserMessage: { id: 'msg-user-1' },
            processingTraceEntries: [],
            safeWrite: (event) => events.push(event),
            streamWriter: localStreamWriter,
            replyEngine: { openai: null },
            threadService: localThreadService,
            conversationStore: localConversationStore,
            planLimits,
          } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
        ),
      ).resolves.toBeUndefined();

      const contentEvent = events.find(
        (event): event is { type: string; content: string } =>
          !!event &&
          typeof event === 'object' &&
          !Array.isArray(event) &&
          (event as { type?: unknown }).type === 'content',
      );
      expect(contentEvent?.content).toContain('A criação de site está conectada');
      expect(contentEvent?.content).toContain('configuração de geração de sites');
      expect(contentEvent?.content).not.toContain('provedor');
      expect(contentEvent?.content).not.toContain('chave');
      expect(contentEvent?.content).not.toContain('ANTHROPIC');
      expect(contentEvent?.content).not.toContain('API_KEY');
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_result', tool: 'create_site', success: false }),
          expect.objectContaining({ type: 'done' }),
        ]),
      );
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        expect.stringContaining('A criação de site está conectada'),
        expect.objectContaining({
          capability: 'create_site',
          capabilityError: true,
          requestState: 'completed',
        }),
      );
      expect(localConversationStore.saveMessage).toHaveBeenLastCalledWith(
        wsId,
        'assistant',
        expect.stringContaining('A criação de site está conectada'),
      );
    });

    it('re-throws real composer provider failures instead of faking a successful turn', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const providerError = new Error('Anthropic API error 503: upstream unavailable');
      const localComposerService = {
        executeComposerCapability: jest.fn().mockRejectedValue(providerError),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await expect(
        runComposerCapabilityBranch(
          'create_site',
          undefined,
          undefined,
          localComposerService as unknown as KloelComposerService,
          {
            workspaceId: wsId,
            message: 'Crie uma landing page',
            mode: 'chat',
            metadata: { capability: 'create_site' },
            clientRequestId: 'req-site-provider-5xx',
            thread: { id: 'thread-1', title: 'Nova conversa' },
            persistedUserMessage: { id: 'msg-user-1' },
            processingTraceEntries: [],
            safeWrite: (event) => events.push(event),
            streamWriter: localStreamWriter,
            replyEngine: { openai: null },
            threadService: localThreadService,
            conversationStore: localConversationStore,
            planLimits,
          } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
        ),
      ).rejects.toBe(providerError);

      // No fake successful turn: no content/done emitted, nothing persisted.
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'done' }));
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'content' }));
      expect(localThreadService.persistAssistantThreadMessage).not.toHaveBeenCalled();
      expect(localConversationStore.saveMessage).not.toHaveBeenCalled();
      expect(localStreamWriter.close).not.toHaveBeenCalled();
    });
  });
});
