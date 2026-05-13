import {
  AgentRuntimeBuiltinMemoryProvider,
  AgentRuntimeMemoryManagerService,
} from './agent-runtime.memory-manager';
import { AgentRuntimeMemoryProviderBase } from './agent-runtime.memory-provider';

function makeSessionStore() {
  return {
    search: jest.fn().mockResolvedValue({
      query: 'checkout',
      tokens: ['checkout'],
      totalFound: 1,
      memories: [
        {
          id: 'mem_1',
          key: 'agent_turn:whatsapp:1',
          category: 'agent_event',
          content: 'customer asked about checkout recovery',
          value: null,
          source: {
            source: 'kloel_memory',
            confidence: 0.92,
            freshness: 'fresh',
            truthMode: 'observed',
            observedAt: '2026-05-13T00:00:00.000Z',
          },
        },
      ],
    }),
    recordTurn: jest.fn().mockResolvedValue('agent_turn:agent-runtime:1'),
    recordRuntimeEvent: jest.fn().mockResolvedValue('agent_runtime:delegation:1'),
  };
}

class ExternalMemoryProvider extends AgentRuntimeMemoryProviderBase {
  readonly name: string;
  readonly external = true;

  constructor(name: string) {
    super();
    this.name = name;
  }

  override systemPromptBlock(): string {
    return `<external-provider name="${this.name}" />`;
  }

  override getToolSchemas() {
    return [
      {
        name: `${this.name}.search`,
        description: 'Search external provider memory.',
        parameters: { type: 'object' },
      },
    ];
  }

  override handleToolCall(): string {
    return JSON.stringify({ ok: true, provider: this.name });
  }
}

describe('AgentRuntimeMemoryManagerService', () => {
  it('registers builtin memory provider and renders fenced recall context', async () => {
    const sessions = makeSessionStore();
    const builtin = new AgentRuntimeBuiltinMemoryProvider(sessions as never);
    const manager = new AgentRuntimeMemoryManagerService(builtin);

    expect(manager.listProviders()).toEqual(['builtin']);

    const prompt = await manager.buildSystemPrompt('ws_1');
    const prefetch = await manager.prefetchAll('ws_1', 'checkout', { sessionId: 'thread_1' });

    expect(prompt).toContain('kloel-memory-provider');
    expect(prefetch).toContain('<memory-context provider="builtin">');
    expect(prefetch).toContain('customer asked about checkout recovery');
    expect(sessions.search).toHaveBeenCalledWith('ws_1', 'checkout', 6);
  });

  it('allows only one external provider to avoid conflicting memory backends', () => {
    const manager = new AgentRuntimeMemoryManagerService(
      new AgentRuntimeBuiltinMemoryProvider(makeSessionStore() as never),
    );

    expect(manager.registerProvider(new ExternalMemoryProvider('honcho'))).toBe(true);
    expect(manager.registerProvider(new ExternalMemoryProvider('mem0'))).toBe(false);
    expect(manager.listProviders()).toEqual(['builtin', 'honcho']);
  });

  it('routes memory provider tools to their owner provider', async () => {
    const manager = new AgentRuntimeMemoryManagerService(
      new AgentRuntimeBuiltinMemoryProvider(makeSessionStore() as never),
    );
    manager.registerProvider(new ExternalMemoryProvider('honcho'));

    expect(manager.getToolSchemas()).toEqual([
      {
        name: 'honcho.search',
        description: 'Search external provider memory.',
        parameters: { type: 'object' },
      },
    ]);
    await expect(manager.handleToolCall('honcho.search', { query: 'checkout' })).resolves.toBe(
      JSON.stringify({ ok: true, provider: 'honcho' }),
    );
    await expect(manager.handleToolCall('unknown.search', {})).resolves.toContain(
      'unknown_memory_tool',
    );
  });

  it('persists delegation, pre-compression, memory-write, and session lifecycle hooks', async () => {
    const sessions = makeSessionStore();
    const manager = new AgentRuntimeMemoryManagerService(
      new AgentRuntimeBuiltinMemoryProvider(sessions as never),
    );

    await manager.onTurnStart({
      workspaceId: 'ws_1',
      sessionId: 'parent_1',
      turnNumber: 1,
      message: 'recover checkout',
      channel: 'whatsapp',
      model: 'deepseek-v4-pro',
      toolCount: 2,
    });
    const compressionInsight = await manager.onPreCompress({
      workspaceId: 'ws_1',
      sessionId: 'parent_1',
      messages: [{ role: 'user', content: 'checkout failed' }],
    });
    await manager.onMemoryWrite({
      workspaceId: 'ws_1',
      sessionId: 'parent_1',
      action: 'upsert',
      target: 'lead_memory',
      content: 'lead prefers Pix',
    });
    await manager.onDelegation({
      workspaceId: 'ws_1',
      sessionId: 'parent_1',
      childSessionId: 'child_1',
      task: 'inspect worker code',
      result: 'worker added tests',
    });
    await manager.onSessionSwitch('ws_1', 'parent_2', { parentSessionId: 'parent_1' });
    await manager.onSessionEnd('ws_1', 'parent_2');

    expect(compressionInsight).toContain('provider-insight');
    expect(sessions.recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'turn_start' }),
    );
    expect(sessions.recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'pre_compress' }),
    );
    expect(sessions.recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'memory_write' }),
    );
    expect(sessions.recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'delegation' }),
    );
    expect(sessions.recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'session_switch' }),
    );
    expect(sessions.recordRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'session_end' }),
    );
  });

  it('syncs completed turns through the builtin provider', async () => {
    const sessions = makeSessionStore();
    const manager = new AgentRuntimeMemoryManagerService(
      new AgentRuntimeBuiltinMemoryProvider(sessions as never),
    );

    await manager.syncTurnAll({
      workspaceId: 'ws_1',
      userContent: 'hello',
      assistantContent: 'hi',
      sessionId: 'thread_1',
      channel: 'whatsapp',
    });

    expect(sessions.recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        channel: 'whatsapp',
        userMessage: 'hello',
        assistantMessage: 'hi',
        threadId: 'thread_1',
      }),
    );
  });
});
