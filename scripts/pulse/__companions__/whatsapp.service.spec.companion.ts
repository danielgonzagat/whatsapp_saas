// PULSE_OK: assertions exist below
describe('WhatsappService', () => {
  let service: WhatsappService;
  let mockAutopilotAdd: jest.Mock;
  let mockFlowAdd: jest.Mock;
  let workspaceService: any;
  let inboxService: any;
  let planLimits: any;
  let redis: any;
  let neuroCrm: any;
  let prisma: any;
  let providerRegistry: any;
  let whatsappApi: any;
  let catchupService: any;
  let ciaRuntime: any;
  let workerRuntime: any;

  const localContactsSeed = [
    {
      id: 'contact-1',
      workspaceId: 'ws-1',
      phone: '5511999991111',
      name: 'Alice CRM',
      email: 'alice@crm.test',
      leadScore: 92,
      sentiment: 'POSITIVE',
      purchaseProbability: 'HIGH',
      nextBestAction: 'Enviar proposta',
      aiSummary: 'Lead quente, pediu preço e prazo.',
      customFields: {
        purchaseProbabilityScore: 0.92,
        probabilityReasons: ['pediu preço', 'retornou rápido'],
        catalogedAt: '2026-03-21T12:00:00.000Z',
        lastScoredAt: '2026-03-21T12:05:00.000Z',
        whatsappSavedAt: '2026-03-21T12:01:00.000Z',
        intent: 'BUY',
      },
      createdAt: new Date('2026-03-20T08:00:00.000Z'),
      updatedAt: new Date('2026-03-20T09:00:00.000Z'),
    },
    {
      id: 'contact-2',
      workspaceId: 'ws-1',
      phone: '5511999993333',
      name: 'Contato Só CRM',
      email: null,
      leadScore: 31,
      sentiment: 'NEUTRAL',
      purchaseProbability: 'MEDIUM',
      nextBestAction: 'Fazer follow-up leve',
      aiSummary: 'Contato morno, já recebeu resposta.',
      customFields: {
        purchaseProbabilityScore: 0.31,
        probabilityReasons: ['interação curta'],
        catalogedAt: '2026-03-19T11:00:00.000Z',
        lastScoredAt: '2026-03-19T11:10:00.000Z',
        whatsappSavedAt: '2026-03-19T11:01:00.000Z',
        intent: 'INFO',
        buyerStatus: 'BOUGHT',
        purchasedProduct: 'Mentoria Premium',
        purchaseValue: 2497,
        purchaseReason: 'deal_won_recorded',
      },
      createdAt: new Date('2026-03-20T07:00:00.000Z'),
      updatedAt: new Date('2026-03-20T07:30:00.000Z'),
    },
  ];

  const localConversationsSeed = [
    {
      id: 'conv-1',
      contactId: 'contact-1',
      unreadCount: 5,
      status: 'OPEN',
      mode: 'AI',
      assignedAgentId: null,
      lastMessageAt: new Date('2026-03-20T10:30:00.000Z'),
      messages: [
        {
          id: 'conv-1-msg-1',
          direction: 'INBOUND',
          createdAt: new Date('2026-03-20T10:30:00.000Z'),
        },
      ],
      contact: {
        id: 'contact-1',
        phone: '5511999991111',
        name: 'Alice CRM',
      },
    },
    {
      id: 'conv-2',
      contactId: 'contact-2',
      unreadCount: 0,
      status: 'OPEN',
      mode: 'AI',
      assignedAgentId: null,
      lastMessageAt: new Date('2026-03-20T10:00:00.000Z'),
      messages: [
        {
          id: 'conv-2-msg-1',
          direction: 'OUTBOUND',
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      contact: {
        id: 'contact-2',
        phone: '5511999993333',
        name: 'Contato Só CRM',
      },
    },
  ];

  const localMessagesSeed = [
    {
      id: 'db-msg-1',
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      conversationId: 'conv-1',
      direction: 'INBOUND',
      content: 'Mensagem do banco',
      type: 'TEXT',
      mediaUrl: null,
      createdAt: new Date('2026-03-20T06:00:00.000Z'),
    },
  ];

  beforeEach(() => {
    // Freeze time so the `days: 30` cutoff deterministically includes
    // contact-1 (cataloged 2026-03-21) and excludes contact-2 (2026-03-20),
    // independent of wall-clock date.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-04-20T00:00:00.000Z'));

    const queueModule = jest.requireMock('../queue/queue');
    mockAutopilotAdd = queueModule.autopilotQueue.add;
    mockFlowAdd = queueModule.flowQueue.add;

    const createdContacts: any[] = [];
    const allContacts = () => [...localContactsSeed, ...createdContacts];

    workspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({
        id: 'ws-1',
        providerSettings: {
          autopilot: { enabled: false },
          whatsappApiSession: { status: 'connected' },
        },
      }),
      toEngineWorkspace: jest.fn((workspace: any) => workspace),
    };

    inboxService = {
      saveMessageByPhone: jest.fn().mockResolvedValue({
        id: 'msg-1',
        contactId: 'contact-1',
      }),
    };

    planLimits = {
      trackMessageSend: jest.fn().mockResolvedValue(undefined),
      ensureSubscriptionActive: jest.fn().mockResolvedValue(undefined),
      ensureMessageRate: jest.fn().mockResolvedValue(undefined),
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
      publish: jest.fn().mockResolvedValue(1),
      rpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    neuroCrm = {
      analyzeContact: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      contact: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(
            allContacts().filter(
              (contact) => !where?.workspaceId || contact.workspaceId === where.workspaceId,
            ),
          );
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = allContacts().find(
            (contact) =>
              contact.workspaceId === where.workspaceId_phone.workspaceId &&
              contact.phone === where.workspaceId_phone.phone,
          );

          if (existing) {
            const next = {
              ...existing,
              name: update?.name ?? existing.name,
              email: update?.email ?? existing.email,
              updatedAt: new Date('2026-03-20T12:00:00.000Z'),
            };
            return Promise.resolve(next);
          }

          const next = {
            id: `contact-${createdContacts.length + 10}`,
            workspaceId: create.workspaceId,
            phone: create.phone,
            name: create.name,
            email: create.email || null,
            createdAt: new Date('2026-03-20T12:00:00.000Z'),
            updatedAt: new Date('2026-03-20T12:00:00.000Z'),
          };
          createdContacts.push(next);
          return Promise.resolve(next);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const found = allContacts().find(
            (contact) =>
              contact.workspaceId === where.workspaceId_phone.workspaceId &&
              contact.phone === where.workspaceId_phone.phone,
          );
          return Promise.resolve(found ? { id: found.id } : null);
        }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue(localConversationsSeed),
      },
      message: {
        findMany: jest.fn().mockResolvedValue(localMessagesSeed),
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-03-20T11:00:00.000Z'),
        }),
        create: jest.fn().mockResolvedValue({ id: 'outbound-msg-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      autopilotEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      tag: {
        upsert: jest.fn().mockResolvedValue({ id: 'tag-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
      }),
      disconnect: jest.fn().mockResolvedValue({ success: true }),
      startSession: jest.fn().mockResolvedValue({ success: true }),
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'provider-msg-1' }),
      getProviderType: jest.fn().mockResolvedValue('whatsapp-api'),
      getContacts: jest.fn().mockResolvedValue([
        {
          id: '5511999991111@c.us',
          name: 'Alice WA',
          pushName: 'Alice App',
        },
        {
          id: '5511999992222@c.us',
          pushName: 'Bob App',
        },
      ]),
      getChats: jest.fn().mockResolvedValue([
        {
          id: '5511999991111@c.us',
          unreadCount: 2,
          timestamp: 1_742_467_800,
        },
        {
          id: '5511999992222@c.us',
          unread: 1,
          lastMessageTimestamp: 1_742_464_200,
        },
        {
          id: '5511999993333@c.us',
          unreadCount: 0,
          timestamp: 1_742_460_000,
        },
      ]),
      getChatMessages: jest.fn().mockResolvedValue([
        {
          id: 'm-new',
          chatId: '5511999991111@c.us',
          body: 'Mensagem nova',
          timestamp: 1_742_467_900,
          fromMe: false,
          type: 'chat',
        },
        {
          id: 'm-old',
          chatId: '5511999991111@c.us',
          body: 'Mensagem antiga',
          timestamp: 1_742_464_100,
          fromMe: false,
          type: 'chat',
        },
        {
          id: 'm-out',
          chatId: '5511999991111@c.us',
          body: 'Resposta enviada',
          timestamp: 1_742_466_100,
          fromMe: true,
          type: 'chat',
        },
      ]),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      stopTyping: jest.fn().mockResolvedValue(undefined),
      sendSeen: jest.fn().mockResolvedValue(undefined),
      readChatMessages: jest.fn().mockResolvedValue(undefined),
      setPresence: jest.fn().mockResolvedValue(undefined),
      isRegisteredUser: jest.fn().mockResolvedValue(true),
      isRegistered: jest.fn().mockResolvedValue(true),
      upsertContactProfile: jest.fn().mockResolvedValue(true),
      extractPhoneFromChatId: jest.fn((chatId: string) => String(chatId || '').split('@')[0]),
      getQrCode: jest.fn().mockResolvedValue({ success: true, qr: 'qr-code' }),
      getSessionDiagnostics: jest.fn().mockResolvedValue({}),
      deleteSession: jest.fn().mockResolvedValue(true),
    };

    whatsappApi = {
      getRuntimeConfigDiagnostics: jest.fn().mockReturnValue({
        webhookUrl: 'https://api.kloel.test/webhooks/whatsapp-api',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['session.status', 'message', 'message.any', 'message.ack'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
        allowSessionWithoutWebhook: false,
      }),
    };

    catchupService = {
      triggerCatchup: jest.fn().mockImplementation(async (_ws: string, reason: string) => ({
        scheduled: true,
        reason,
      })),
    };

    ciaRuntime = {
      startBacklogRun: jest.fn().mockResolvedValue({
        queued: true,
        runId: 'run-1',
      }),
    };

    workerRuntime = {
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    mockAutopilotAdd.mockResolvedValue(undefined);
    mockFlowAdd.mockResolvedValue(undefined);

    service = new WhatsappService(
      workspaceService,
      inboxService,
      planLimits,
      redis,
      neuroCrm,
      prisma,
      providerRegistry,
      whatsappApi,
      catchupService,
      ciaRuntime,
      workerRuntime,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not queue scan-contact when autopilot is disabled, even if WAHA is connected', async () => {
    await service.handleIncoming('ws-1', '5511999999999', 'Quero saber sobre o serum');

    expect(mockAutopilotAdd).not.toHaveBeenCalled();
  });

  it('queues consolidated scan-contact only after autopilot is explicitly enabled', async () => {
    workspaceService.getWorkspace.mockResolvedValue({
      id: 'ws-1',
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: { status: 'connected' },
      },
    });

    await service.handleIncoming('ws-1', '5511999999999', 'Quero saber sobre o serum');

    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        messageContent: 'Quero saber sobre o serum',
        messageId: 'msg-1',
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^scan-contact__ws-1__contact-1__/),
        removeOnComplete: true,
      }),
    );
  });

  it('exposes contacts, chats, backlog and old messages for real agent decisions', async () => {
    const contacts = await service.listContacts('ws-1');
    const created = await service.createContact('ws-1', {
      phone: '5511999994444',
      name: 'Novo Contato',
      email: 'novo@crm.test',
    });
    const chats = await service.listChats('ws-1');
    const backlog = await service.getBacklog('ws-1');
    const messages = await service.getChatMessages('ws-1', '5511999991111@c.us');

    expect(contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phone: '5511999991111',
          source: 'waha+crm',
          name: 'Alice App',
        }),
        expect.objectContaining({
          phone: '5511999993333',
          source: 'crm',
          name: 'Contato Só CRM',
        }),
      ]),
    );

    expect(created).toEqual(
      expect.objectContaining({
        phone: '5511999994444',
        name: 'Novo Contato',
        registered: true,
      }),
    );
    expect(providerRegistry.upsertContactProfile).toHaveBeenCalledWith('ws-1', {
      phone: '5511999994444',
      name: 'Novo Contato',
    });

    expect(chats.slice(0, 2)).toEqual([
      expect.objectContaining({
        phone: '5511999991111',
        unreadCount: 2,
        pending: true,
      }),
      expect.objectContaining({
        phone: '5511999992222',
        unreadCount: 1,
        pending: true,
      }),
    ]);

    expect(backlog).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'CONNECTED',
        pendingConversations: 2,
        pendingMessages: 3,
      }),
    );

    expect(messages.map((message: any) => message.id)).toEqual(['m-old', 'm-out', 'm-new']);
  });

  it('builds a WAHA-first operational backlog report with remote/local drift visibility', async () => {
    const report = await service.getOperationalBacklogReport('ws-1', {
      limit: 10,
    });

    expect(report).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        sourceOfTruth: 'whatsapp-api',
        connected: true,
        status: 'CONNECTED',
        summary: expect.objectContaining({
          remotePendingConversations: 2,
          remotePendingMessages: 3,
          localPendingConversations: 1,
          effectivePendingConversations: 2,
          remoteOnlyPendingConversations: 1,
          localOnlyPendingConversations: 0,
        }),
      }),
    );
    expect(report.items).toEqual([
      expect.objectContaining({
        phone: '5511999991111',
        remoteUnreadCount: 2,
        localUnreadCount: 5,
        remotePending: true,
        localPending: true,
        pending: true,
      }),
      expect.objectContaining({
        phone: '5511999992222',
        remoteUnreadCount: 1,
        localPending: false,
        remoteOnlyPending: true,
        pending: true,
      }),
    ]);
  });

  it('lists cataloged contacts with probability metadata and conversation context', async () => {
    const report = await service.listCatalogContacts('ws-1', {
      days: 30,
      page: 1,
      limit: 10,
    });

    expect(report).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        days: 30,
        page: 1,
        limit: 10,
        total: 1,
        onlyCataloged: true,
      }),
    );
    expect(report.items).toEqual([
      expect.objectContaining({
        phone: '5511999991111',
        cataloged: true,
        buyerStatus: 'UNKNOWN',
        purchaseProbability: 'HIGH',
        purchaseProbabilityScore: 0.92,
        conversationCount: 1,
        unreadCount: 5,
        intent: 'BUY',
      }),
    ]);
  });

  it('ranks cataloged contacts by purchase probability score', async () => {
    const ranking = await service.listPurchaseProbabilityRanking('ws-1', {
      days: 30,
      limit: 10,
    });

    expect(ranking).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        days: 30,
        limit: 10,
        total: 1,
        onlyCataloged: true,
        minProbabilityScore: 0,
        minLeadScore: 0,
      }),
    );
    expect(ranking.items).toEqual([
      expect.objectContaining({
        rank: 1,
        phone: '5511999991111',
        purchaseProbabilityScore: 0.92,
        purchaseProbabilityPercent: 92,
        leadScore: 92,
      }),
    ]);
  });

  it('schedules manual catalog refresh and bulk rescore jobs', async () => {
    const refresh = await service.triggerCatalogRefresh('ws-1', {
      days: 45,
      reason: 'manual_audit',
    });
    const rescore = await service.triggerCatalogRescore('ws-1', {
      days: 30,
      limit: 2,
      reason: 'manual_rescore',
    });

    expect(refresh).toEqual(
      expect.objectContaining({
        scheduled: true,
        workspaceId: 'ws-1',
        days: 45,
        reason: 'manual_audit',
        jobName: 'catalog-contacts-30d',
      }),
    );
    expect(rescore).toEqual(
      expect.objectContaining({
        scheduled: true,
        workspaceId: 'ws-1',
        count: 1,
        days: 30,
        limit: 2,
        contactId: null,
        reason: 'manual_rescore',
      }),
    );
    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'catalog-contacts-30d',
      expect.objectContaining({
        workspaceId: 'ws-1',
        days: 45,
        reason: 'manual_audit',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('catalog-contacts-30d__ws-1'),
      }),
    );
    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'score-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        reason: 'manual_rescore',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('score-contact__ws-1__'),
      }),
    );
  });

  it('schedules a manual rescore for a single contact', async () => {
    prisma.contact.findFirst.mockResolvedValueOnce({
      id: 'contact-1',
      phone: '5511999991111',
      name: 'Alice CRM',
    });

    const result = await service.triggerCatalogRescore('ws-1', {
      contactId: 'contact-1',
      reason: 'manual_single_rescore',
    });

    expect(result).toEqual(
      expect.objectContaining({
        scheduled: true,
        workspaceId: 'ws-1',
        count: 1,
        contactId: 'contact-1',
        reason: 'manual_single_rescore',
      }),
    );
    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'score-contact',
      {
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999991111',
        contactName: 'Alice CRM',
        chatId: '5511999991111@c.us',
        reason: 'manual_single_rescore',
      },
      expect.objectContaining({
        jobId: expect.stringContaining('score-contact__ws-1__contact-1'),
      }),
    );
  });

  it('sends presence updates and triggers explicit sync to keep the agent loop alive', async () => {
    const typing = await service.setPresence('ws-1', '5511999991111', 'typing');
    const seen = await service.setPresence('ws-1', '5511999991111', 'seen');
    const paused = await service.setPresence('ws-1', '5511999991111', 'paused');
    const sync = await service.triggerSync('ws-1', 'proof_run');

    expect(typing).toEqual({
      ok: true,
      chatId: '5511999991111@c.us',
      presence: 'typing',
    });
    expect(seen.presence).toBe('seen');
    expect(paused.presence).toBe('paused');
    expect(providerRegistry.sendTyping).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(providerRegistry.readChatMessages).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(providerRegistry.stopTyping).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(sync).toEqual({
      scheduled: true,
      reason: 'proof_run',
    });
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith('ws-1', 'proof_run');
  });

  it('ignores malformed persisted read candidates instead of stringifying objects', async () => {
    providerRegistry.readChatMessages.mockClear();
    prisma.contact.findUnique.mockResolvedValueOnce({
      customFields: {
        lastRemoteChatId: { serialized: 'bad' },
        lastCatalogChatId: ['bad'],
        lastResolvedChatId: { serialized: 'still-bad' },
      },
    });

    const result = await service.setPresence('ws-1', '5511999991111', 'seen');

    expect(result).toEqual({
      ok: true,
      chatId: '5511999991111@c.us',
      presence: 'seen',
    });
    expect(providerRegistry.readChatMessages).toHaveBeenCalledTimes(2);
    expect(providerRegistry.readChatMessages).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      '5511999991111@c.us',
    );
    expect(providerRegistry.readChatMessages).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      '5511999991111@s.whatsapp.net',
    );
    expect(providerRegistry.readChatMessages).not.toHaveBeenCalledWith('ws-1', '[object Object]');
  });

  it('falls back to direct WAHA send when the worker is unavailable', async () => {
    workerRuntime.isAvailable.mockResolvedValue(false);

    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem sem worker');

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        direct: true,
        delivery: 'sent',
      }),
    );
    expect(providerRegistry.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111',
      'Mensagem sem worker',
      expect.objectContaining({
        mediaUrl: undefined,
        mediaType: undefined,
        caption: undefined,
        quotedMessageId: undefined,
      }),
    );
    expect(mockFlowAdd).not.toHaveBeenCalledWith('send-message', expect.anything());
  });

  it('allows reactive fallback sends even when opt-in and 24h compliance are enforced', async () => {
    const previousOptIn = process.env.ENFORCE_OPTIN;
    const previous24h = process.env.AUTOPILOT_ENFORCE_24H;

    process.env.ENFORCE_OPTIN = 'true';
    process.env.AUTOPILOT_ENFORCE_24H = 'true';

    workerRuntime.isAvailable.mockResolvedValue(false);
    prisma.contact.findUnique.mockResolvedValue({
      id: 'contact-1',
      optIn: null,
      optedOutAt: null,
      customFields: {},
      tags: [],
    });
    prisma.message.findFirst.mockResolvedValue(null);

    try {
      const result = await service.sendMessage('ws-1', '5511999991111', 'Resposta reativa', {
        complianceMode: 'reactive',
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          direct: true,
          delivery: 'sent',
        }),
      );
      expect(providerRegistry.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        '5511999991111',
        'Resposta reativa',
        expect.objectContaining({
          mediaUrl: undefined,
          mediaType: undefined,
          caption: undefined,
          quotedMessageId: undefined,
        }),
      );
    } finally {
      if (previousOptIn === undefined) {
        delete process.env.ENFORCE_OPTIN;
      } else {
        process.env.ENFORCE_OPTIN = previousOptIn;
      }

      if (previous24h === undefined) {
        delete process.env.AUTOPILOT_ENFORCE_24H;
      } else {
        process.env.AUTOPILOT_ENFORCE_24H = previous24h;
      }
    }
  });

  it('keeps queue-based send path when the worker is healthy', async () => {
    workerRuntime.isAvailable.mockResolvedValue(true);

    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem com worker');

    expect(result).toEqual({
      ok: true,
      queued: true,
      delivery: 'queued',
    });
    expect(mockFlowAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999991111',
        message: 'Mensagem com worker',
      }),
    );
    expect(providerRegistry.sendMessage).not.toHaveBeenCalled();
    expect(inboxService.saveMessageByPhone).not.toHaveBeenCalled();
  });

  it('still allows outbound sends when the local webhook diagnostics are missing but the WAHA session is connected', async () => {
    whatsappApi.getRuntimeConfigDiagnostics.mockReturnValue({
      webhookUrl: null,
      webhookConfigured: false,
      inboundEventsConfigured: false,
      events: [],
      secretConfigured: false,
      storeEnabled: true,
      storeFullSync: true,
      allowSessionWithoutWebhook: false,
    });

    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem bloqueada');

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        queued: true,
        delivery: 'queued',
      }),
    );
    expect(providerRegistry.sendMessage).not.toHaveBeenCalled();
    expect(mockFlowAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999991111',
        message: 'Mensagem bloqueada',
      }),
    );
  });
});

