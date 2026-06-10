import {
  ForbiddenException,
  chatCompletionWithFallback,
  finalizeSuccessfulReply,
  wsId,
  replyEngine,
  planLimits,
} from './kloel-thinker.service.spec.helpers';
import type { KloelComposerService } from './kloel-composer.service';
import type { LocalToolExecutor } from './kloel-thinker.service.spec.helpers';

describe('KloelThinkerService', () => {
  describe('think (SSE)', () => {
    it('keeps generated site HTML out of composer observation events', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const generatedSiteHtml = '<html><body><main>Landing completa gerada</main></body></html>';
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: 'Site gerado e pronto para revisão.',
          metadata: {
            capability: 'create_site',
            generatedSiteHtml,
            siteDraftId: 'site-draft-1',
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

      await runComposerCapabilityBranch(
        'create_site',
        undefined,
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'Crie uma landing page',
          mode: 'chat',
          metadata: { capability: 'create_site' },
          clientRequestId: 'req-site-1',
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

      const resultEvent = events.find((event): event is Record<string, unknown> => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
          return false;
        }
        const candidate = event as Record<string, unknown>;
        return candidate.type === 'tool_result';
      });

      // The composer observation event is the public SSE wire: it must never
      // carry the raw generated-site HTML. The hardened tool_result event no
      // longer ships ANY raw result payload over the wire (only the public
      // tool id + risk summary), which is a strictly stronger guarantee
      // than the previous omitted-bytes summary.
      expect(JSON.stringify(resultEvent)).not.toContain(generatedSiteHtml);
      expect(resultEvent).toEqual(
        expect.objectContaining({
          type: 'tool_result',
          tool: 'create_site',
          success: true,
        }),
      );
      expect(resultEvent).not.toHaveProperty('result');
    });

    it('does not re-check plan budget mid tool-planning turn after the first model call overshoots usage', async () => {
      const { runToolPlanningBranch, finalizeSuccessfulReply: realFinalizeSuccessfulReply } =
        jest.requireActual<typeof import('./kloel-thinker-think.helpers')>(
          './kloel-thinker-think.helpers',
        );
      jest.mocked(finalizeSuccessfulReply).mockImplementation(realFinalizeSuccessfulReply);
      const chatCompletionWithFallbackMock = jest.mocked(chatCompletionWithFallback);
      chatCompletionWithFallbackMock.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'code_outline',
                    arguments: '{"file":"backend/src/kloel/kloel-thinker.service.ts"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 1200 },
      } as never);
      const localPlanLimits = {
        ensureTokenBudget: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValue(
            new ForbiddenException('Limite mensal de tokens IA atingido para o plano FREE.'),
          ),
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
      };
      const events: unknown[] = [];
      const localReplyEngine = {
        openai: {},
        unavailableMessage: replyEngine.unavailableMessage,
        toolRouter: {
          executeAssistantToolCalls: jest
            .fn()
            .mockImplementation((input: { safeWrite: (event: unknown) => void }) => {
              input.safeWrite({
                type: 'tool_call',
                callId: 'call-1',
                spanId: 'call-1',
                tool: 'code_outline',
                args: { file: 'backend/src/kloel/kloel-thinker.service.ts' },
                done: false,
              });
              input.safeWrite({
                type: 'tool_result',
                callId: 'call-1',
                spanId: 'call-1',
                tool: 'code_outline',
                success: true,
                result: { success: true, symbols: [{ name: 'think' }] },
                durationMs: 12,
                done: false,
              });
              return Promise.resolve({
                toolMessages: [
                  {
                    role: 'tool',
                    tool_call_id: 'call-1',
                    content: JSON.stringify({ success: true, symbols: [{ name: 'think' }] }),
                  },
                ],
                receipts: [],
                usedSearchWeb: false,
              });
            }),
        },
        buildChatModelMessages: jest
          .fn()
          .mockResolvedValue([{ role: 'user', content: 'responda com base na observação' }]),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue(
            'Raciocínio resumido, 1 ação real e 1 observação antes da resposta final.',
          ),
      };
      const localConversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
      const localStreamWriter = {
        close: jest.fn(),
        getLastReasoning: jest.fn(() => ({ text: '', durationMs: undefined })),
      };
      const streamWriterResponse = jest.fn().mockResolvedValue({
        fullResponse:
          'Eu observei a arquitetura real e finalizei sem vazar ferramenta interna.\n<｜｜DSML｜｜tool_calls> <｜｜DSML｜｜invoke name="get_workspace_status"> </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls>',
        estimatedTokens: 320,
      });

      await expect(
        runToolPlanningBranch(
          [{ role: 'user', content: 'valide sua trajetória' }],
          'system prompt',
          'dynamic context',
          null,
          null,
          0.2,
          500,
          jest.fn() as LocalToolExecutor,
          ['code_outline'],
          undefined,
          streamWriterResponse,
          {
            workspaceId: wsId,
            message: 'valide sua trajetória',
            mode: 'chat',
            metadata: {},
            clientRequestId: 'req-1',
            thread: { id: 'thread-1', title: 'Nova conversa' },
            persistedUserMessage: { id: 'msg-user-1' },
            processingTraceEntries: [],
            safeWrite: (event) => events.push(event),
            streamWriter: localStreamWriter,
            replyEngine: localReplyEngine,
            threadService: localThreadService,
            conversationStore: localConversationStore,
            planLimits: localPlanLimits,
          } as unknown as Parameters<typeof runToolPlanningBranch>[11],
          undefined,
          realFinalizeSuccessfulReply,
        ),
      ).resolves.toBeUndefined();

      expect(localPlanLimits.ensureTokenBudget).toHaveBeenCalledTimes(1);
      expect(streamWriterResponse).toHaveBeenCalled();
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        expect.stringContaining('arquitetura real'),
        expect.any(Object),
      );
      const assistantPersistCalls = localThreadService.persistAssistantThreadMessage.mock
        .calls as Array<[string, string, string, unknown]>;
      const persistedAssistantText = assistantPersistCalls[0]?.[2] ?? '';
      expect(persistedAssistantText).not.toContain('DSML');
      expect(persistedAssistantText).not.toContain('tool_calls');
      const writerCalls = streamWriterResponse.mock.calls as Array<[Array<{ content?: unknown }>]>;
      const finalWriterMessages = writerCalls[0]?.[0] ?? [];
      expect(
        finalWriterMessages.some(
          (item) =>
            typeof item.content === 'string' &&
            item.content.includes('resposta final') &&
            item.content.includes('markup de ferramenta'),
        ),
      ).toBe(true);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_call', tool: 'code_outline' }),
          expect.objectContaining({ type: 'tool_result', tool: 'code_outline', success: true }),
          expect.objectContaining({ type: 'done' }),
        ]),
      );
    });
  });
});
