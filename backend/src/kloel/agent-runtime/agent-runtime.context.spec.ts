import { AgentRuntimeContextService } from './agent-runtime.context';
import type {
  AgentRuntimePulseSelfModel,
  AgentRuntimeRecallResult,
  AgentRuntimeSessionRecallResult,
  AgentSkillSelection,
} from './agent-runtime.types';

describe('AgentRuntimeContextService', () => {
  it('renders frozen operational context with recall, skills, and PULSE truth boundary', async () => {
    const recall: AgentRuntimeRecallResult = {
      query: 'checkout',
      tokens: ['checkout'],
      totalFound: 1,
      memories: [
        {
          id: 'mem_1',
          key: 'agent_turn:whatsapp:1',
          category: 'agent_event',
          content: 'user asked about checkout recovery',
          value: { ok: true },
          source: {
            source: 'kloel_memory',
            confidence: 0.78,
            freshness: 'fresh',
            truthMode: 'observed',
            observedAt: '2026-05-13T00:00:00.000Z',
          },
        },
      ],
    };
    const pulse: AgentRuntimePulseSelfModel = {
      status: 'degraded',
      authorityMode: 'advisory',
      canWorkNow: true,
      canDeclareComplete: false,
      score: 61,
      blockingReasons: ['no_overclaim_fail'],
      nextSafeUnits: ['recover-admin-whatsapp-session-control'],
      generatedAt: '2026-05-13T00:00:00.000Z',
    };
    const sessionRecall: AgentRuntimeSessionRecallResult = {
      query: 'checkout',
      tokens: ['checkout'],
      totalFound: 1,
      sessions: [
        {
          sessionId: 'thread_1',
          source: 'thread',
          matchCount: 2,
          updatedAt: '2026-05-13T00:00:00.000Z',
          summary: 'checkout recovery had pending webhook proof',
          transcriptWindow: 'pending webhook proof',
          messages: [],
        },
      ],
    };
    const selectedSkills: AgentSkillSelection[] = [
      {
        skill: {
          id: 'checkout-recovery',
          title: 'Checkout Recovery',
          summary: 'Recover checkout with real product evidence.',
          category: 'commercial',
          riskLevel: 'normal',
          allowedTools: ['list_products'],
          requiredEvidence: ['lead_status'],
          validation: ['workspace_isolation'],
          rollback: [],
          metrics: ['conversion_rate'],
          body: 'body',
          version: 1,
          updatedAt: '2026-05-13T00:00:00.000Z',
        },
        score: 2,
        reasons: ['match:checkout'],
      },
    ];

    const memoryManager = {
      initializeAll: jest.fn().mockResolvedValue(undefined),
      buildSystemPrompt: jest.fn().mockResolvedValue('<kloel-memory-provider name="builtin" />'),
      prefetchAll: jest
        .fn()
        .mockResolvedValue('<memory-context provider="builtin">checkout</memory-context>'),
      queuePrefetchAll: jest.fn().mockResolvedValue(undefined),
      syncTurnAll: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AgentRuntimeContextService(
      {
        search: jest.fn().mockResolvedValue(recall),
        searchSessions: jest.fn().mockResolvedValue(sessionRecall),
        recordTurn: jest.fn(),
      },
      {
        selectSkills: jest.fn().mockResolvedValue(selectedSkills),
        recordSkillUsage: jest.fn().mockResolvedValue({ ok: true }),
      },
      { buildSelfModel: jest.fn().mockReturnValue(pulse) },
      { buildEnvelope: jest.fn() },
      memoryManager,
      {
        loadCompressedContext: jest.fn().mockResolvedValue({
          summary: '[CONTEXT COMPACTION - REFERENCE ONLY] previous checkout work',
        }),
      },
      { curateTurnOutcome: jest.fn() },
    );

    const context = await service.buildContext({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      message: 'checkout',
      threadId: 'thread_1',
    });

    expect(context.systemPromptBlock).toContain('<kloel-agent-runtime>');
    expect(context.systemPromptBlock).toContain('pulse.canDeclareComplete=false');
    expect(context.systemPromptBlock).toContain('checkout-recovery');
    expect(context.systemPromptBlock).toContain('user asked about checkout recovery');
    expect(context.systemPromptBlock).toContain('sessionRecall:');
    expect(context.systemPromptBlock).toContain('pending webhook proof');
    expect(context.systemPromptBlock).toContain('memoryProviders:');
    expect(context.systemPromptBlock).toContain('prefetchedMemory:');
    expect(context.systemPromptBlock).toContain('compressedContext:');
    expect(context.systemPromptBlock).toContain('previous checkout work');
    expect(memoryManager.initializeAll).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        sessionId: 'thread_1',
        channel: 'whatsapp',
        agentContext: 'primary',
      }),
    );
    expect(memoryManager.queuePrefetchAll).toHaveBeenCalledWith('ws_1', 'checkout', {
      sessionId: 'thread_1',
    });
  });

  it('syncs turn outcomes through the memory manager provider pipeline', async () => {
    const memoryManager = {
      initializeAll: jest.fn(),
      buildSystemPrompt: jest.fn(),
      prefetchAll: jest.fn(),
      queuePrefetchAll: jest.fn(),
      syncTurnAll: jest.fn().mockResolvedValue(undefined),
    };
    const memoryCurator = { curateTurnOutcome: jest.fn().mockResolvedValue(undefined) };
    const sessionStore = { search: jest.fn(), searchSessions: jest.fn(), recordTurn: jest.fn() };
    const service = new AgentRuntimeContextService(
      sessionStore,
      { selectSkills: jest.fn(), recordSkillUsage: jest.fn() },
      { buildSelfModel: jest.fn() },
      { buildEnvelope: jest.fn() },
      memoryManager,
      { loadCompressedContext: jest.fn() },
      memoryCurator,
    );

    await service.recordTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'chat',
      threadId: 'thread_1',
      userMessage: 'recover checkout',
      assistantMessage: 'vou verificar',
    });

    expect(sessionStore.recordTurn).not.toHaveBeenCalled();
    expect(memoryManager.syncTurnAll).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      userContent: 'recover checkout',
      assistantContent: 'vou verificar',
      sessionId: 'thread_1',
      channel: 'chat',
    });
    expect(memoryCurator.curateTurnOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        userMessage: 'recover checkout',
      }),
    );
  });
});
