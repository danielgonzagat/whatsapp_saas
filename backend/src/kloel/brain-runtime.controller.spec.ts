import { BrainRuntimeController } from './brain-runtime.controller';

describe('BrainRuntimeController', () => {
  let autonomy: { propose: jest.Mock };
  let brain: {
    decide: jest.Mock;
    eventTaxonomy: jest.Mock;
    listCapabilities: jest.Mock;
    observe: jest.Mock;
  };
  let graph: { buildWorkspaceGraph: jest.Mock; recommendNextActions: jest.Mock };
  let controller: BrainRuntimeController;

  const request = {
    workspaceId: 'ws-guard',
    user: {
      sub: 'user-1',
      workspaceId: 'ws-user',
    },
  };

  beforeEach(() => {
    autonomy = {
      propose: jest.fn().mockResolvedValue({ proposals: [] }),
    };
    brain = {
      decide: jest.fn().mockResolvedValue({
        actions: [{ tool: 'create_product', result: { success: true } }],
        confidence: 0.9,
        conversationId: 'thread-1',
        intent: 'create_product',
        response: 'Produto criado.',
        source: 'chat',
        title: 'Produto novo',
      }),
      eventTaxonomy: jest.fn().mockReturnValue({ count: 1, events: ['brain.decide'] }),
      listCapabilities: jest.fn().mockReturnValue({ capabilities: [], count: 0, domains: {} }),
      observe: jest.fn().mockResolvedValue({ mode: 'observe', insights: [] }),
    };
    graph = {
      buildWorkspaceGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
      recommendNextActions: jest.fn().mockResolvedValue({ recommendations: [] }),
    };
    controller = new BrainRuntimeController(brain as never, graph as never, autonomy as never);
  });

  it('delegates decisions with the guarded workspace id', async () => {
    await controller.decide(
      { source: 'chat', messages: [{ role: 'user', content: 'cria produto' }] },
      request as never,
    );

    expect(brain.decide).toHaveBeenCalledWith({
      body: { source: 'chat', messages: [{ role: 'user', content: 'cria produto' }] },
      workspaceId: 'ws-guard',
      userId: 'user-1',
    });
  });

  it('streams events in the legacy chat-compatible envelope', async () => {
    const writes: string[] = [];
    const response = {
      end: jest.fn(),
      flushHeaders: jest.fn(),
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
    };

    await controller.stream(
      { source: 'chat', messages: [{ role: 'user', content: 'cria produto' }] },
      request as never,
      response as never,
    );

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(writes.join('')).toContain('"type":"status"');
    expect(writes.join('')).toContain('"type":"thread"');
    expect(writes.join('')).toContain('"type":"tool_result"');
    expect(writes.join('')).toContain('"type":"content"');
    expect(writes.join('')).toContain('"type":"done"');
    expect(response.end).toHaveBeenCalled();
  });
});
