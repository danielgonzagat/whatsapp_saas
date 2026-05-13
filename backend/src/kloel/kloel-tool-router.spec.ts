import { KloelToolRouter } from './kloel-tool-router';

describe('KloelToolRouter', () => {
  it('blocks assistant tool calls outside an explicit allowedTools scope', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = { executeTool: jest.fn() };
    const executeLocalTool = jest.fn();
    const router = new KloelToolRouter(logger, unifiedAgentService);

    const result = await router.executeAssistantToolCalls({
      assistantMessage: {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'send_whatsapp_message', arguments: '{"phone":"5511"}' },
          },
        ],
      },
      workspaceId: 'ws_1',
      allowedTools: ['search_agent_memory'],
      executeLocalTool,
    });

    expect(unifiedAgentService.executeTool).not.toHaveBeenCalled();
    expect(executeLocalTool).not.toHaveBeenCalled();
    expect(result.receipts).toEqual([
      expect.objectContaining({
        callId: 'call_1',
        name: 'send_whatsapp_message',
        success: false,
        error: 'tool_not_allowed',
      }),
    ]);
    expect(result.toolMessages[0]?.content).toContain('tool_not_allowed');
  });

  it('executes allowed tool calls normally', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'ok' }),
    };
    const executeLocalTool = jest.fn();
    const router = new KloelToolRouter(logger, unifiedAgentService);

    const result = await router.executeAssistantToolCalls({
      assistantMessage: {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'search_agent_memory', arguments: '{"query":"checkout"}' },
          },
        ],
      },
      workspaceId: 'ws_1',
      allowedTools: ['search_agent_memory'],
      executeLocalTool,
    });

    expect(unifiedAgentService.executeTool).toHaveBeenCalledWith(
      'search_agent_memory',
      { query: 'checkout' },
      { workspaceId: 'ws_1', phone: '', contactId: '' },
    );
    expect(executeLocalTool).not.toHaveBeenCalled();
    expect(result.receipts[0]).toEqual(
      expect.objectContaining({ name: 'search_agent_memory', success: true }),
    );
  });

  it('truncates oversized tool messages and creates durable artifact handle', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'x'.repeat(7000) }),
    };
    const storeToolArtifact = jest.fn().mockResolvedValue(undefined);
    const router = new KloelToolRouter(logger, unifiedAgentService, storeToolArtifact);

    const result = await router.executeAssistantToolCalls({
      assistantMessage: {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'search_agent_memory', arguments: '{"query":"checkout"}' },
          },
        ],
      },
      workspaceId: 'ws_1',
      allowedTools: ['search_agent_memory'],
      executeLocalTool: jest.fn(),
    });

    const content = JSON.parse(result.toolMessages[0]?.content ?? '{}') as Record<string, unknown>;
    expect(content.truncated).toBe(true);
    expect(content.originalChars).toEqual(expect.any(Number));
    expect(String(content.preview).length).toBeLessThanOrEqual(6000);
    expect(typeof content.artifactId).toBe('string');
    expect(String(content.artifactId)).toMatch(/^tool_artifact:search_agent_memory:\d+:[a-f0-9]+$/);
    expect(content.hint).toEqual(expect.any(String));

    expect(storeToolArtifact).toHaveBeenCalledTimes(1);
    expect(storeToolArtifact).toHaveBeenCalledWith(
      'ws_1',
      content.artifactId,
      expect.stringContaining('"success":true'),
    );
    expect(result.receipts[0]?.artifactId).toBe(content.artifactId);
  });

  it('gracefully degrades when artifact store fails', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'x'.repeat(7000) }),
    };
    const storeToolArtifact = jest.fn().mockRejectedValue(new Error('db down'));
    const router = new KloelToolRouter(logger, unifiedAgentService, storeToolArtifact);

    const result = await router.executeAssistantToolCalls({
      assistantMessage: {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'search_agent_memory', arguments: '{"query":"checkout"}' },
          },
        ],
      },
      workspaceId: 'ws_1',
      allowedTools: ['search_agent_memory'],
      executeLocalTool: jest.fn(),
    });

    const content = JSON.parse(result.toolMessages[0]?.content ?? '{}') as Record<string, unknown>;
    expect(content.truncated).toBe(true);
    expect(content.artifactId).toBeUndefined();
    expect(content.hint).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao armazenar artefato'),
    );
    expect(result.receipts[0]?.artifactId).toBeUndefined();
  });

  it('does not create artifact for small tool outputs', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'ok' }),
    };
    const storeToolArtifact = jest.fn();
    const router = new KloelToolRouter(logger, unifiedAgentService, storeToolArtifact);

    const result = await router.executeAssistantToolCalls({
      assistantMessage: {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'search_agent_memory', arguments: '{"query":"checkout"}' },
          },
        ],
      },
      workspaceId: 'ws_1',
      allowedTools: ['search_agent_memory'],
      executeLocalTool: jest.fn(),
    });

    const content = JSON.parse(result.toolMessages[0]?.content ?? '{}') as Record<string, unknown>;
    expect(content.truncated).toBeUndefined();
    expect(storeToolArtifact).not.toHaveBeenCalled();
    expect(result.receipts[0]?.artifactId).toBeUndefined();
  });

  it('emits artifactId in tool_result SSE event when truncated', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'x'.repeat(7000) }),
    };
    const storeToolArtifact = jest.fn().mockResolvedValue(undefined);
    const router = new KloelToolRouter(logger, unifiedAgentService, storeToolArtifact);
    const safeWrite = jest.fn();

    await router.executeAssistantToolCalls({
      assistantMessage: {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'search_agent_memory', arguments: '{"query":"checkout"}' },
          },
        ],
      },
      workspaceId: 'ws_1',
      allowedTools: ['search_agent_memory'],
      executeLocalTool: jest.fn(),
      safeWrite,
    });

    const toolResultCalls = safeWrite.mock.calls.filter(
      ([event]: unknown[]) => (event as Record<string, unknown>)?.type === 'tool_result',
    );
    expect(toolResultCalls.length).toBe(1);
    const toolResultEvent = toolResultCalls[0][0] as Record<string, unknown>;
    expect(typeof toolResultEvent.artifactId).toBe('string');
    expect(String(toolResultEvent.artifactId)).toMatch(
      /^tool_artifact:search_agent_memory:\d+:[a-f0-9]+$/,
    );
  });
});
