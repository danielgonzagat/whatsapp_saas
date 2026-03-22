import { WhatsappService } from './whatsapp.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

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
  let workerRuntime: any;

  const localContactsSeed = [
    {
      id: 'contact-1',
      workspaceId: 'ws-1',
      phone: '5511999991111',
      name: 'Alice CRM',
      email: 'alice@crm.test',
      createdAt: new Date('2026-03-20T08:00:00.000Z'),
      updatedAt: new Date('2026-03-20T09:00:00.000Z'),
    },
    {
      id: 'contact-2',
      workspaceId: 'ws-1',
      phone: '5511999993333',
      name: 'Contato Só CRM',
      email: null,
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
      sendMessage: jest
        .fn()
        .mockResolvedValue({ success: true, messageId: 'provider-msg-1' }),
    };

    whatsappApi = {
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
      setPresence: jest.fn().mockResolvedValue(undefined),
      isRegisteredUser: jest.fn().mockResolvedValue(true),
      extractPhoneFromChatId: jest.fn((chatId: string) =>
        String(chatId || '').split('@')[0],
      ),
      getQrCode: jest.fn().mockResolvedValue({ success: true, qr: 'qr-code' }),
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

    workerRuntime = {
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    mockAutopilotAdd.mockResolvedValue(undefined);
    mockFlowAdd.mockResolvedValue(undefined);

    service = new WhatsappService(
      workspaceService as any,
      inboxService as any,
      planLimits as any,
      redis as any,
      neuroCrm as any,
      prisma as any,
      providerRegistry as any,
      whatsappApi as any,
      catchupService as any,
      workerRuntime as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not queue scan-contact when autopilot is disabled, even if WAHA is connected', async () => {
    await service.handleIncoming('ws-1', '5511999999999', 'Quero saber sobre PDRN');

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

    await service.handleIncoming('ws-1', '5511999999999', 'Quero saber sobre PDRN');

    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        messageContent: 'Quero saber sobre PDRN',
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
          name: 'Alice WA',
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

    expect(messages.map((message: any) => message.id)).toEqual([
      'm-old',
      'm-out',
      'm-new',
    ]);
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
    expect(whatsappApi.sendTyping).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111@c.us',
    );
    expect(whatsappApi.sendSeen).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111@c.us',
    );
    expect(whatsappApi.stopTyping).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111@c.us',
    );
    expect(sync).toEqual({
      scheduled: true,
      reason: 'proof_run',
    });
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'proof_run',
    );
  });

  it('falls back to direct WAHA send when the worker is unavailable', async () => {
    workerRuntime.isAvailable.mockResolvedValue(false);

    const result = await service.sendMessage(
      'ws-1',
      '5511999991111',
      'Mensagem sem worker',
    );

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
    expect(mockFlowAdd).not.toHaveBeenCalledWith(
      'send-message',
      expect.anything(),
    );
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
      const result = await service.sendMessage(
        'ws-1',
        '5511999991111',
        'Resposta reativa',
        {
          complianceMode: 'reactive',
        },
      );

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
      if (previousOptIn === undefined) delete process.env.ENFORCE_OPTIN;
      else process.env.ENFORCE_OPTIN = previousOptIn;

      if (previous24h === undefined) delete process.env.AUTOPILOT_ENFORCE_24H;
      else process.env.AUTOPILOT_ENFORCE_24H = previous24h;
    }
  });

  it('keeps queue-based send path when the worker is healthy', async () => {
    workerRuntime.isAvailable.mockResolvedValue(true);

    const result = await service.sendMessage(
      'ws-1',
      '5511999991111',
      'Mensagem com worker',
    );

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

    const result = await service.sendMessage(
      'ws-1',
      '5511999991111',
      'Mensagem bloqueada',
    );

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
