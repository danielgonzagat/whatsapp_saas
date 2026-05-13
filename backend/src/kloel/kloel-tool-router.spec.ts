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

  it('truncates oversized tool messages before returning them to the LLM', async () => {
    const logger = { warn: jest.fn() };
    const unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ success: true, data: 'x'.repeat(7000) }),
    };
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
      executeLocalTool: jest.fn(),
    });

    const content = JSON.parse(result.toolMessages[0]?.content ?? '{}') as Record<string, unknown>;
    expect(content.truncated).toBe(true);
    expect(content.originalChars).toEqual(expect.any(Number));
    expect(String(content.preview).length).toBeLessThanOrEqual(6000);
  });
});
