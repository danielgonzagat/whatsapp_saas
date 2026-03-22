import { CiaRuntimeService } from './cia-runtime.service';

const { autopilotQueue } = jest.requireMock('../queue/queue');

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('CiaRuntimeService', () => {
  let prisma: any;
  let providerRegistry: any;
  let whatsappApi: any;
  let catchupService: any;
  let agentEvents: any;
  let workerRuntime: any;
  let redis: any;
  let whatsappService: any;
  let unifiedAgent: any;
  let service: CiaRuntimeService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {
            autopilot: { enabled: false },
            autonomy: { autoBootstrapOnConnected: true },
            ciaRuntime: {},
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'conv-1',
            unreadCount: 5,
            status: 'OPEN',
            mode: 'AI',
            assignedAgentId: null,
            lastMessageAt: new Date(),
            contactId: 'contact-1',
            contact: {
              id: 'contact-1',
              name: 'Alice',
              phone: '5511999991111',
            },
            messages: [
              {
                id: 'conv-1-msg-1',
                direction: 'INBOUND',
                createdAt: new Date(),
                content: 'Quero saber o preço',
              },
            ],
          },
          {
            id: 'conv-2',
            unreadCount: 2,
            status: 'OPEN',
            mode: 'AI',
            assignedAgentId: null,
            lastMessageAt: new Date(Date.now() - 1_000),
            contactId: 'contact-2',
            contact: {
              id: 'contact-2',
              name: 'Bruno',
              phone: '5511888888888',
            },
            messages: [
              {
                id: 'conv-2-msg-1',
                direction: 'INBOUND',
                createdAt: new Date(Date.now() - 1_000),
                content: 'Tem composição?',
              },
            ],
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      contact: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.id === 'contact-1') {
            return { id: 'contact-1', phone: '5511999991111' };
          }
          if (where?.id === 'contact-2') {
            return { id: 'contact-2', phone: '5511888888888' };
          }
          return null;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          const phone = where?.phone || where?.contact?.phone;
          if (phone === '5511999991111') {
            return { id: 'contact-1', phone: '5511999991111' };
          }
          if (phone === '5511888888888') {
            return { id: 'contact-2', phone: '5511888888888' };
          }
          return null;
        }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.contactId === 'contact-1') {
            return [
              {
                content: 'Quero saber o preço',
                externalId: 'quoted-contact-1',
                createdAt: new Date().toISOString(),
              },
            ];
          }
          if (where?.contactId === 'contact-2') {
            return [
              {
                content: 'Tem composição?',
                externalId: 'quoted-contact-2',
                createdAt: new Date(Date.now() - 1_000).toISOString(),
              },
            ];
          }
          return [];
        }),
      },
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue({
          value: { openBacklog: 12, hotLeadCount: 3 },
        }),
        findMany: jest.fn().mockResolvedValue([
          { value: { normalizedKey: 'price_resistance', frequency: 5 } },
        ]),
      },
      systemInsight: {
        findMany: jest.fn().mockResolvedValue([{ id: 'insight-1', type: 'CIA_MARKET_SIGNAL' }]),
      },
    };

    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({
        connected: true,
        status: 'WORKING',
      }),
    };

    whatsappApi = {
      getChats: jest.fn().mockResolvedValue([
        { id: 'chat-1', unreadCount: 5, timestamp: Date.now() },
        { id: 'chat-2', unreadCount: 2, timestamp: Date.now() - 1000 },
        { id: 'chat-3', unreadCount: 0, timestamp: Date.now() - 2000 },
      ]),
    };

    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({
        scheduled: true,
        reason: 'cia_bootstrap',
      }),
      runCatchupNow: jest.fn().mockResolvedValue({
        scheduled: true,
        importedMessages: 0,
        touchedChats: 0,
        processedChats: 0,
        overflow: false,
      }),
    };

    agentEvents = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    workerRuntime = {
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({
        ok: true,
        delivery: 'sent',
        direct: true,
      }),
    };
    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        reply: 'Resposta automática',
        response: 'Resposta automática',
        actions: [],
        intent: 'QUALIFY',
        confidence: 0.9,
      }),
    };

    service = new CiaRuntimeService(
      prisma,
      providerRegistry,
      whatsappApi,
      catchupService,
      agentEvents,
      workerRuntime,
      redis,
      whatsappService,
      unifiedAgent,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('bootstraps the CIA runtime, counts pending conversations and immediately enters continuous autonomy', async () => {
    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 2,
        pendingMessages: 7,
        autoStarted: true,
        immediateRun: expect.objectContaining({
          queued: true,
          autoStarted: true,
          totalQueued: 2,
        }),
        options: [],
      }),
    );
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'cia_bootstrap',
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        workspaceId: 'ws-1',
        phase: 'instant_value',
      }),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'sweep-unread-conversations',
      expect.objectContaining({
        workspaceId: 'ws-1',
        mode: 'reply_all_recent_first',
        limit: 2,
      }),
      expect.any(Object),
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            autonomy: expect.objectContaining({
              mode: 'FULL',
              reactiveEnabled: true,
            }),
            ciaRuntime: expect.objectContaining({
              state: 'EXECUTING_BACKLOG',
            }),
          }),
        }),
      }),
    );
  });

  it('refuses to bootstrap when WhatsApp is not connected and emits an explicit error', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'SCAN_QR_CODE',
    });

    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: false,
        pendingConversations: 0,
        pendingMessages: 0,
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        workspaceId: 'ws-1',
        phase: 'access',
      }),
    );
  });

  it('returns the current operational intelligence snapshot for the workspace', async () => {
    const result = await service.getOperationalIntelligence('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        businessState: expect.objectContaining({ openBacklog: 12 }),
        marketSignals: [expect.objectContaining({ normalizedKey: 'price_resistance' })],
        humanTasks: [expect.any(Object)],
        demandStates: [expect.any(Object)],
        insights: [expect.objectContaining({ type: 'CIA_MARKET_SIGNAL' })],
        runtime: expect.any(Object),
        autonomy: expect.anything(),
      }),
    );
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_key: {
            workspaceId: 'ws-1',
            key: 'business_state:current',
          },
        },
      }),
    );
  });

  it('puts the workspace into FULL autonomy when bootstrap finds no backlog', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    whatsappApi.getChats.mockResolvedValue([
      {
        id: 'chat-1',
        unreadCount: 0,
        timestamp: Date.now() - 48 * 60 * 60 * 1000,
      },
    ]);

    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 0,
        autoStarted: false,
      }),
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            autopilot: expect.objectContaining({
              enabled: true,
            }),
            autonomy: expect.objectContaining({
              mode: 'FULL',
              reactiveEnabled: true,
            }),
            ciaRuntime: expect.objectContaining({
              state: 'LIVE_AUTONOMY',
              mode: 'reply_only_new',
            }),
          }),
        }),
      }),
    );
  });

  it('treats recent WAHA chat activity as backlog only when the explicit zero-unread fallback is enabled', async () => {
    process.env.CIA_BOOTSTRAP_INCLUDE_ZERO_UNREAD_ACTIVITY = 'true';
    prisma.conversation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'conv-remote-1',
          unreadCount: 0,
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          lastMessageAt: new Date(),
          contactId: 'contact-remote-1',
          contact: {
            id: 'contact-remote-1',
            name: 'Carla',
            phone: '5511777777777',
          },
          messages: [
            {
              id: 'conv-remote-1-msg-1',
              direction: 'INBOUND',
              createdAt: new Date(),
            },
          ],
        },
      ]);
    whatsappApi.getChats.mockResolvedValue([
      {
        id: '5511777777777@c.us',
        conversationTimestamp: Math.floor(Date.now() / 1000),
        lastMessageRecvTimestamp: Math.floor(Date.now() / 1000),
      },
    ]);

    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 1,
        autoStarted: true,
      }),
    );
    expect(catchupService.runCatchupNow).toHaveBeenCalledWith(
      'ws-1',
      'cia_bootstrap_inline',
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'sweep-unread-conversations',
      expect.objectContaining({
        workspaceId: 'ws-1',
        limit: 1,
      }),
      expect.any(Object),
    );
  });

  it('keeps FULL autonomy enabled when WAHA chat overview fails during bootstrap', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    whatsappApi.getChats.mockRejectedValue(new Error('TIMEOUT'));

    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 0,
        pendingMessages: 0,
        autoStarted: false,
      }),
    );
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'cia_bootstrap',
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            autopilot: expect.objectContaining({
              enabled: true,
            }),
            autonomy: expect.objectContaining({
              mode: 'FULL',
              reason: 'session_connected_degraded_sync',
            }),
          }),
        }),
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        workspaceId: 'ws-1',
        phase: 'sync',
        message: expect.stringContaining('Vou seguir no modo live'),
      }),
    );
  });

  it('falls back to inline backlog execution when the worker is unavailable', async () => {
    workerRuntime.isAvailable.mockResolvedValue(false);

    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        autoStarted: true,
        immediateRun: expect.objectContaining({
          queued: true,
          inlineFallback: true,
          processedInline: 2,
          skippedInline: 0,
          totalQueued: 2,
        }),
      }),
    );
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledTimes(2);
    expect(whatsappService.sendMessage).toHaveBeenCalledTimes(2);
    expect(autopilotQueue.add).not.toHaveBeenCalled();
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        workspaceId: 'ws-1',
        phase: 'backlog_inline_fallback',
      }),
    );
  });

  it('still treats unread conversations as pending even when the last stored message is outbound', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-outbound-unread',
        unreadCount: 3,
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        lastMessageAt: new Date(),
        contactId: 'contact-outbound-unread',
        contact: {
          id: 'contact-outbound-unread',
          name: 'Helena',
          phone: '5511333333333',
        },
        messages: [
          {
            id: 'conv-outbound-unread-msg-1',
            direction: 'OUTBOUND',
            createdAt: new Date(),
            content: 'Te respondi aqui antes.',
          },
        ],
      },
    ]);

    const pending = await (service as any).listPendingConversations('ws-1', 10);

    expect(pending).toHaveLength(1);
    expect(pending[0].operational).toEqual(
      expect.objectContaining({
        pending: true,
        pendingMessages: 3,
        blockedReason: null,
      }),
    );
  });

  it('resumes a conversation that was locked in HUMAN mode', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-human-1',
      mode: 'HUMAN',
      contactId: 'contact-1',
      contact: {
        name: 'Marcos',
        phone: '5511999999999',
      },
    });

    const result = await service.resumeConversationAutonomy(
      'ws-1',
      'conv-human-1',
    );

    expect(result).toEqual({
      conversationId: 'conv-human-1',
      mode: 'AI',
      resumed: true,
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-human-1' },
      data: { mode: 'AI', assignedAgentId: null },
    });
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        phase: 'conversation_resumed',
        workspaceId: 'ws-1',
      }),
    );
  });
});
