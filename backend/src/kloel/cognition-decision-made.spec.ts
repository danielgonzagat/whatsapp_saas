import { buildAssistantReplyImpl } from './kloel-reply-engine.helpers';

function makeMockSpine() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

type MockSpine = ReturnType<typeof makeMockSpine>;
function makeDeps(overrides: { spine?: MockSpine; openai?: Record<string, unknown> } = {}) {
  const spine = overrides.spine;
  const mockOpenai = (overrides.openai ?? {
    chat: { completions: { create: jest.fn().mockResolvedValue(mockChatCompletion()) } },
  }) as unknown as import('openai').default;

  const mockPrisma = {
    chatThread: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Test' }) },
    agent: { findFirst: jest.fn().mockResolvedValue(null) },
    kloelMemory: {
      upsert: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as import('../prisma/prisma.service').PrismaService;

  const mockPlanLimits = {
    ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../billing/plan-limits.service').PlanLimitsService;

  const mockThreadService = {
    buildThreadSummarySystemMessage: jest.fn().mockReturnValue(null),
  } as unknown as import('./kloel-thread.service').KloelThreadService;

  const mockWsContextService = {
    getWorkspaceContext: jest.fn().mockResolvedValue(''),
    contextFormatter: { sanitizeUserNameForAssistant: (n: string) => n },
  } as unknown as import('./kloel-workspace-context.service').KloelWorkspaceContextService;

  const mockContextFormatter = {
    sanitizeUserNameForAssistant: (n: string) => n,
    buildAgentProfileContext: () => '',
  } as unknown as import('./kloel-context-formatter').KloelContextFormatter;

  const mockToolRouter = {
    executeAssistantToolCalls: jest
      .fn()
      .mockResolvedValue({ toolMessages: [], usedSearchWeb: false }),
  } as unknown as import('./kloel-tool-router').KloelToolRouter;

  return {
    openai: mockOpenai,
    prisma: mockPrisma,
    planLimits: mockPlanLimits,
    threadService: mockThreadService,
    wsContextService: mockWsContextService,
    contextFormatter: mockContextFormatter,
    toolRouter: mockToolRouter,
    unavailableMessage: 'unavailable',
    hasOpenAiKey: () => true,
    buildDashboardPrompt: () => 'system prompt',
    detectExpertiseLevel: () => 'INICIANTE' as const,
    shouldUseLongFormBudget: () => false,
    buildMarketingPromptAddendum: () => Promise.resolve(null),
    buildChatModelMessages: async (p: { userMessage: string }) => [
      { role: 'user' as const, content: p.userMessage },
    ],
    buildDynamicRuntimeContext: () => Promise.resolve(''),
    ...(spine !== undefined ? { spine } : {}),
  };
}
function mockChatCompletion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cmpl-1',
    object: 'chat.completion',
    created: Date.now(),
    model: overrides.model ?? 'deepseek-chat',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: overrides.content ?? 'Olá! Como posso ajudar?',
          ...(overrides.tool_calls !== undefined ? { tool_calls: overrides.tool_calls } : {}),
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}
describe('cognition.decision_made emission', () => {
  describe('buildAssistantReplyImpl (dashboard reply)', () => {
    it('emits cognition.decision_made with correct shape on successful reply', async () => {
      const spine = makeMockSpine();
      const deps = makeDeps({ spine });

      await buildAssistantReplyImpl({ message: 'Olá', workspaceId: 'ws-1', mode: 'chat' }, deps);

      // The emit is fire-and-forget via void IIFE; wait a tick
      await new Promise((r) => setTimeout(r, 10));

      expect(spine.emit).toHaveBeenCalledTimes(1);
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cognition.decision_made',
          workspaceId: 'ws-1',
          truthMode: 'observed',
          provenance: expect.objectContaining({
            source: 'production',
            processor: 'kloel-reply-engine',
          }),
          payload: expect.objectContaining({
            surface: 'dashboard',
            toolCallsCount: 0,
            fallbackReason: null,
            durationMs: expect.anything(),
            modelUsed: 'deepseek-chat',
          }),
        }),
      );
    });
    it('reports fallbackReason as null when primary model succeeds', async () => {
      const spine = makeMockSpine();
      const deps = makeDeps({ spine });

      await buildAssistantReplyImpl({ message: 'Olá', workspaceId: 'ws-1', mode: 'chat' }, deps);
      await new Promise((r) => setTimeout(r, 10));

      expect(spine.emit).toHaveBeenCalledTimes(1);
      type EmittedEvent = {
        payload: { fallbackReason: unknown; modelUsed: string; toolCallsCount: number };
      };
      const calls = spine.emit.mock.calls as Array<[EmittedEvent]>;
      const payload = calls[0]?.[0].payload;
      if (!payload) throw new Error('expected spine.emit call');
      // fallbackReason is null on the happy path (primary model succeeded)
      expect(payload.fallbackReason).toBeNull();
      expect(payload.modelUsed).toBe('deepseek-chat');
    });
    it('includes toolCallsCount from assistant response', async () => {
      const spine = makeMockSpine();
      const deps = makeDeps({
        spine,
        openai: {
          chat: {
            completions: {
              create: jest.fn().mockResolvedValue(
                mockChatCompletion({
                  tool_calls: [
                    { id: 't1', type: 'function', function: { name: 'search', arguments: '{}' } },
                    { id: 't2', type: 'function', function: { name: 'lookup', arguments: '{}' } },
                  ],
                }),
              ),
            },
          },
        },
      });

      await buildAssistantReplyImpl(
        { message: 'buscar produtos', workspaceId: 'ws-1', mode: 'chat' },
        deps,
      );
      await new Promise((r) => setTimeout(r, 10));

      expect(spine.emit).toHaveBeenCalledTimes(1);
      type EmittedEvent = {
        payload: { fallbackReason: unknown; modelUsed: string; toolCallsCount: number };
      };
      const calls = spine.emit.mock.calls as Array<[EmittedEvent]>;
      const payload = calls[0]?.[0].payload;
      if (!payload) throw new Error('expected spine.emit call');
      expect(payload.toolCallsCount).toBe(2);
    });
    it('tolerates absent spine — does not crash', async () => {
      const deps = makeDeps({});

      await expect(
        buildAssistantReplyImpl({ message: 'Olá', workspaceId: 'ws-1', mode: 'chat' }, deps),
      ).resolves.toBeDefined();
    });

    it('tolerates absent workspaceId — does not emit', async () => {
      const spine = makeMockSpine();
      const deps = makeDeps({ spine });

      await buildAssistantReplyImpl({ message: 'Olá', mode: 'chat' }, deps);
      await new Promise((r) => setTimeout(r, 10));

      expect(spine.emit).not.toHaveBeenCalled();
    });

    it('tolerates spine.emit rejection gracefully', async () => {
      const spine = makeMockSpine();
      spine.emit.mockRejectedValue(new Error('ring buffer full'));
      const deps = makeDeps({ spine });

      await expect(
        buildAssistantReplyImpl({ message: 'Olá', workspaceId: 'ws-1', mode: 'chat' }, deps),
      ).resolves.toBeDefined();
    });
  });
});
