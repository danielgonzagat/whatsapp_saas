import {
  KloelStreamWriter,
  finalizeSuccessfulReply,
  service,
  wsId,
  replyEngine,
  planLimits,
} from './kloel-thinker.service.spec.helpers';
import type { KloelComposerService } from './kloel-composer.service';
import type { LocalToolExecutor, Response } from './kloel-thinker.service.spec.helpers';

describe('KloelThinkerService', () => {
  describe('think (SSE)', () => {
    it('returns an honest tool failure on SSE without falling through to the LLM', async () => {
      const executeLocalTool = jest
        .fn()
        .mockResolvedValue({ success: false, error: 'tool_not_allowed' });

      await service.think(
        { message: 'listar produtos', workspaceId: wsId, allowedTools: ['search_web'] },
        {} as Response,
        null,
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).toHaveBeenCalledWith(wsId, 'list_products', {}, undefined);
      expect(replyEngine.buildChatModelMessages).not.toHaveBeenCalled();
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
      };
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_result',
          tool: 'list_products',
          success: false,
        }),
      );
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'content', content: 'Erro: tool_not_allowed' }),
      );
      expect(finalizeSuccessfulReply).toHaveBeenCalledWith(
        'Erro: tool_not_allowed',
        0,
        expect.objectContaining({ workspaceId: wsId, message: 'listar produtos' }),
      );
    });

    it('persists model-generated executable pre-response as thread processing trace', async () => {
      const { finalizeSuccessfulReply: realFinalizeSuccessfulReply } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const { buildProcessingTraceSummary } =
        jest.requireActual<typeof import('./kloel-thread.helpers')>('./kloel-thread.helpers');
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
        buildProcessingTraceSummary,
      };
      const localConversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
      const localStreamWriter = {
        close: jest.fn(),
        getLastReasoning: jest.fn(() => ({ text: '', durationMs: undefined })),
      };
      const events: unknown[] = [];

      await realFinalizeSuccessfulReply(
        '**Raciocínio resumido:** entendi o contexto do operador.\n**Ações:** verifiquei a conversa ativa.\n**Observações:** não houve chamada de ferramenta nesta resposta.\n**Resposta final:** A resposta limpa para o usuário.',
        120,
        {
          workspaceId: wsId,
          message: 'Explique seu trace executivo',
          mode: 'chat',
          metadata: {},
          clientRequestId: 'req-trace-1',
          thread: { id: 'thread-trace-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event: unknown) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { unavailableMessage: 'Indisponível.', openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof realFinalizeSuccessfulReply>[2],
      );

      // Model-authored headings ("Raciocínio resumido", "Ações", "Observações")
      // are ordinary answer text — NOT executable evidence. The runtime no longer
      // splits them into a fabricated structured trace; the full pre-response is
      // persisted verbatim as the visible reply, and the processing trace stays
      // empty (it only carries REAL tool/status/reasoning events from the agent
      // loop, of which there were none on this turn).
      const persistedPreResponse =
        '**Raciocínio resumido:** entendi o contexto do operador.\n**Ações:** verifiquei a conversa ativa.\n**Observações:** não houve chamada de ferramenta nesta resposta.\n**Resposta final:** A resposta limpa para o usuário.';
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-trace-1',
        wsId,
        persistedPreResponse,
        expect.objectContaining({
          responseVersions: [expect.objectContaining({ content: persistedPreResponse })],
          processingTrace: [],
          processingSummary: undefined,
        }),
      );
      expect(localConversationStore.saveMessage).toHaveBeenLastCalledWith(
        wsId,
        'assistant',
        persistedPreResponse,
      );
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
    });

    it('emits action and observation events for deterministic composer capabilities', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: 'Resultado real da busca web.',
          metadata: {
            capability: 'search_web',
            sources: [{ title: 'Fonte', url: 'https://example.com' }],
          },
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
      const processingTraceEntries = [
        {
          id: 'trace-thinking',
          kind: 'status' as const,
          phase: 'thinking' as const,
          label: 'Raciocínio resumido antes da resposta.',
          createdAt: '2026-06-04T00:00:00.000Z',
        },
        {
          id: 'trace-action',
          kind: 'tool_call' as const,
          phase: 'tool_calling' as const,
          label: 'Consultei contexto operacional relevante antes de responder.',
          tool: 'search_web',
          spanId: 'req-1',
          createdAt: '2026-06-04T00:00:01.000Z',
        },
      ];

      await runComposerCapabilityBranch(
        'search_web',
        'Contexto operacional real',
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'Busque referencias atuais',
          mode: 'chat',
          metadata: { capability: 'search_web' },
          clientRequestId: 'req-1',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries,
          safeWrite: (event: unknown) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'status',
            phase: 'tool_calling',
            message: 'Executando search_web.',
          }),
          expect.objectContaining({ type: 'tool_call', tool: 'search_web' }),
          expect.objectContaining({ type: 'tool_result', tool: 'search_web', success: true }),
          expect.objectContaining({ type: 'content', content: 'Resultado real da busca web.' }),
        ]),
      );
      expect(JSON.stringify(events)).toContain('Executando search_web');
      expect(localComposerService.executeComposerCapability).toHaveBeenCalledWith(
        expect.objectContaining({ capability: 'search_web', message: 'Busque referencias atuais' }),
      );
      expect(localThreadService.buildProcessingTraceSummary).toHaveBeenCalledWith(
        processingTraceEntries,
      );
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        'Resultado real da busca web.',
        expect.objectContaining({
          capability: 'search_web',
          processingSummary: 'Resumo persistido da pré-resposta.',
          processingTrace: expect.arrayContaining([
            expect.objectContaining({
              id: 'trace-thinking',
              label: 'Raciocínio resumido antes da resposta.',
            }),
            expect.objectContaining({
              id: 'trace-action',
              tool: 'search_web',
            }),
          ]) as unknown,
        }),
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'done',
            metadata: expect.objectContaining({
              processingSummary: 'Resumo persistido da pré-resposta.',
              processingTrace: expect.arrayContaining([
                expect.objectContaining({ id: 'trace-thinking' }),
                expect.objectContaining({ id: 'trace-action' }),
              ]) as unknown,
            }) as unknown,
          }),
        ]),
      );
    });
  });
});
