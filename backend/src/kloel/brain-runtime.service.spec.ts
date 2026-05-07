import { BrainRuntimeService } from './brain-runtime.service';

describe('BrainRuntimeService', () => {
  let unifiedAgent: { processMessage: jest.Mock };
  let contextData: { getProducts: jest.Mock; getWorkspaceContext: jest.Mock };
  let capabilities: { allowedFor: jest.Mock; grouped: jest.Mock; list: jest.Mock };
  let events: { record: jest.Mock };
  let graph: { recommendNextActions: jest.Mock };
  let threads: {
    maybeGenerateThreadTitle: jest.Mock;
    persistAssistantThreadMessage: jest.Mock;
    persistUserThreadMessage: jest.Mock;
    resolveThread: jest.Mock;
  };
  let service: BrainRuntimeService;

  beforeEach(() => {
    unifiedAgent = {
      processMessage: jest.fn().mockResolvedValue({
        actions: [{ tool: 'create_product', args: {}, result: { success: true } }],
        confidence: 0.91,
        intent: 'create_product',
        response: 'Produto criado.',
      }),
    };
    contextData = {
      getWorkspaceContext: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Kloel' }),
      getProducts: jest.fn().mockResolvedValue([{ id: 'product-1' }]),
    };
    capabilities = {
      list: jest.fn().mockReturnValue([
        {
          domain: 'product',
          name: 'create_product',
          description: 'Cria produto',
          parameters: {},
          risk: 'normal',
        },
      ]),
      allowedFor: jest.fn().mockReturnValue(['create_product']),
      grouped: jest.fn().mockReturnValue({
        control: [],
        messaging: [],
        product: [
          {
            domain: 'product',
            name: 'create_product',
            description: 'Cria produto',
            parameters: {},
            risk: 'normal',
          },
        ],
        sales: [],
      }),
    };
    events = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    graph = {
      recommendNextActions: jest.fn().mockResolvedValue({
        recommendations: [
          {
            action: 'brain.decide',
            confidence: 1,
            reason: 'Caminho forte: 3 execução(ões) recentes em 3 evento(s).',
          },
        ],
        window: { eventCount: 3, take: 500 },
      }),
    };
    threads = {
      resolveThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        title: 'Nova conversa',
        summary: null,
        summaryUpdatedAt: null,
      }),
      persistUserThreadMessage: jest.fn().mockResolvedValue({ id: 'user-message-1' }),
      persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'assistant-message-1' }),
      maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Produto novo'),
    };
    service = new BrainRuntimeService(
      unifiedAgent as never,
      contextData as never,
      capabilities,
      events as never,
      threads as never,
      graph as never,
    );
  });

  it('lists capabilities from the registry', () => {
    expect(service.listCapabilities()).toEqual({
      count: 1,
      capabilities: [
        {
          domain: 'product',
          name: 'create_product',
          description: 'Cria produto',
          parameters: {},
          risk: 'normal',
        },
      ],
      domains: {
        control: [],
        messaging: [],
        product: [
          {
            domain: 'product',
            name: 'create_product',
            description: 'Cria produto',
            parameters: {},
            risk: 'normal',
          },
        ],
        sales: [],
      },
    });
  });

  it('exposes the canonical event taxonomy', () => {
    const taxonomy = service.eventTaxonomy();
    expect(typeof taxonomy.count).toBe('number');
    expect(taxonomy.events).toEqual(
      expect.arrayContaining(['brain.decide', 'brain.observe', 'sale.completed']),
    );
  });

  it('delegates active decisions to the unified agent and records an event', async () => {
    const result = await service.decide({
      workspaceId: 'ws-1',
      userId: 'user-1',
      body: {
        source: 'chat',
        intent: 'user_message',
        context: { clientRequestId: 'req-1' },
        messages: [{ role: 'user', content: 'cria um produto de 497' }],
      },
    });

    expect(unifiedAgent.processMessage).toHaveBeenCalledWith({
      allowedTools: ['create_product'],
      workspaceId: 'ws-1',
      contactId: '',
      phone: '',
      message: 'cria um produto de 497',
      context: {
        brainSource: 'chat',
        brainIntent: 'user_message',
        brainRequestId: 'req-1',
        brainUserId: 'user-1',
        clientRequestId: 'req-1',
      },
    });
    expect(threads.persistUserThreadMessage).toHaveBeenCalledWith(
      'thread-1',
      'ws-1',
      'cria um produto de 497',
      expect.objectContaining({ brain: true, brainIntent: 'user_message' }),
    );
    expect(threads.persistAssistantThreadMessage).toHaveBeenCalledWith(
      'thread-1',
      'ws-1',
      'Produto criado.',
      expect.objectContaining({ brain: true, confidence: 0.91 }),
    );
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        intent: 'user_message',
        action: 'capability.executed',
        status: 'executed',
      }),
    );
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        intent: 'user_message',
        action: 'product.created',
        status: 'executed',
      }),
    );
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        intent: 'user_message',
        action: 'brain.decide',
        status: 'executed',
      }),
    );
    expect(result).toEqual({
      source: 'chat',
      conversationId: 'thread-1',
      title: 'Produto novo',
      intent: 'create_product',
      requestId: 'req-1',
      confidence: 0.91,
      response: 'Produto criado.',
      actions: [{ tool: 'create_product', args: {}, result: { success: true } }],
    });
  });

  it('observes workspace context without executing agent actions', async () => {
    const result = await service.observe({
      workspaceId: 'ws-1',
      userId: 'user-1',
      body: {
        source: 'dashboard',
        question: 'analise os KPIs',
        data: { revenue: 1000 },
      },
    });

    expect(unifiedAgent.processMessage).not.toHaveBeenCalled();
    expect(threads.resolveThread).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        mode: 'observe',
        source: 'dashboard',
        question: 'analise os KPIs',
        workspace: { id: 'ws-1', name: 'Kloel' },
        products: 1,
        capabilities: 1,
        dataKeys: ['revenue'],
        insights: [
          'brain.decide: 100% confidence. Caminho forte: 3 execução(ões) recentes em 3 evento(s).',
        ],
        recommendations: [
          {
            action: 'brain.decide',
            confidence: 1,
            reason: 'Caminho forte: 3 execução(ões) recentes em 3 evento(s).',
          },
        ],
      }),
    );
    expect(typeof result.requestId).toBe('string');
    expect(graph.recommendNextActions).toHaveBeenCalledWith('ws-1');
  });
});
