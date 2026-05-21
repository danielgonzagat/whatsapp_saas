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
  let executor: {
    listProducts: jest.Mock;
    listConversations: jest.Mock;
    queryRevenueSummary: jest.Mock;
    searchContact: jest.Mock;
    sendMessageViaChannel: jest.Mock;
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
    executor = {
      listProducts: jest.fn().mockResolvedValue({ ok: true, data: [{ id: 'p1', name: 'Produto A', price: 9900, active: true }] }),
      listConversations: jest.fn().mockResolvedValue({ ok: true, data: [] }),
      queryRevenueSummary: jest.fn().mockResolvedValue({ ok: true, data: { totalRevenue: 50000, ticketMedio: 5000, totalCount: 10, paidCount: 8, conversao: 80, periodDays: 30 } }),
      searchContact: jest.fn().mockResolvedValue({ ok: true, data: [{ name: 'Joao', phone: '1199999' }] }),
      sendMessageViaChannel: jest.fn().mockResolvedValue({ ok: true, data: { phone: '1199999', messagePreview: 'Ola', channel: 'whatsapp' } }),
    };
    service = new BrainRuntimeService(
      unifiedAgent as never,
      contextData as never,
      capabilities,
      events as never,
      threads as never,
      graph as never,
      executor as never,
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
      predecidedActions: [],
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

  it('passes capability intents as predecided actions to the unified executor', async () => {
    await service.decide({
      workspaceId: 'ws-1',
      userId: 'user-1',
      body: {
        source: 'chat',
        intent: 'create_product',
        context: {
          actionArgs: { name: 'Produto MIND', price: 497 },
          clientRequestId: 'req-2',
        },
        messages: [{ role: 'user', content: 'crie esse produto' }],
      },
    });

    expect(unifiedAgent.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: ['create_product'],
        predecidedActions: [
          {
            tool: 'create_product',
            args: { name: 'Produto MIND', price: 497 },
          },
        ],
      }),
    );
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

  it('dispatches list_products operator intent to executor', async () => {
    const result = await service.decide({
      workspaceId: 'ws-1',
      userId: 'user-1',
      body: {
        source: 'chat',
        intent: 'list_products',
        messages: [{ role: 'user', content: 'liste meus produtos' }],
      },
    });

    expect(unifiedAgent.processMessage).not.toHaveBeenCalled();
    expect(executor.listProducts).toHaveBeenCalledWith('ws-1', {});
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'capability.executed', status: 'executed' }),
    );
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'brain.decide' }),
    );
    expect(result.intent).toBe('list_products');
    expect(result.confidence).toBe(1);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual(
      expect.objectContaining({ tool: 'list_products' }),
    );
  });

  it('dispatches query_revenue_summary operator intent to executor', async () => {
    await service.decide({
      workspaceId: 'ws-1',
      body: {
        source: 'chat',
        intent: 'query_revenue_summary',
        context: { days: 7 },
        messages: [{ role: 'user', content: 'resumo de receita' }],
      },
    });

    expect(unifiedAgent.processMessage).not.toHaveBeenCalled();
    expect(executor.queryRevenueSummary).toHaveBeenCalledWith('ws-1', { days: 7 });
  });

  it('records capability.failed event when operator capability fails', async () => {
    executor.listProducts.mockResolvedValueOnce({ ok: false, error: 'db_error' });

    await service.decide({
      workspaceId: 'ws-1',
      body: {
        source: 'chat',
        intent: 'list_products',
        messages: [{ role: 'user', content: 'produtos' }],
      },
    });

    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'capability.failed',
        status: 'error',
      }),
    );
  });

  it('delegates non-operator intents to unifiedAgent (not executor)', async () => {
    const result = await service.decide({
      workspaceId: 'ws-1',
      body: {
        source: 'chat',
        intent: 'create_product',
        messages: [{ role: 'user', content: 'cria produto X' }],
      },
    });

    expect(executor.listProducts).not.toHaveBeenCalled();
    expect(unifiedAgent.processMessage).toHaveBeenCalled();
    expect(result.response).toBeDefined();
  });
});
