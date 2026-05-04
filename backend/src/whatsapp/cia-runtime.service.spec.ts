import { CiaRuntimeService } from './cia-runtime.service';
import {
  makePrismaMock,
  makeProviderRegistryMock,
  makeCatchupServiceMock,
  makeAgentEventsMock,
  makeWorkerRuntimeMock,
  makeRedisMock,
  makeWhatsappServiceMock,
  makeUnifiedAgentMock,
  makeCiaRuntimeStateMock,
  makeCiaBootstrapMock,
  makeCiaBacklogRunMock,
  type PrismaMock,
  type ProviderRegistryMock,
  type CatchupServiceMock,
  type AgentEventsMock,
  type WorkerRuntimeMock,
  type RedisMock,
  type WhatsappServiceMock,
  type UnifiedAgentMock,
  type CiaRuntimeStateMock,
  type CiaBootstrapMock,
  type CiaBacklogRunMock,
} from './cia-runtime.service.fixtures';

const { autopilotQueue } = jest.requireMock('../queue/queue');

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('CiaRuntimeService', () => {
  let prisma: PrismaMock;
  let providerRegistry: ProviderRegistryMock;
  let catchupService: CatchupServiceMock;
  let agentEvents: AgentEventsMock;
  let workerRuntime: WorkerRuntimeMock;
  let redis: RedisMock;
  let whatsappService: WhatsappServiceMock;
  let unifiedAgent: UnifiedAgentMock;
  let runtimeState: CiaRuntimeStateMock;
  let bootstrapService: CiaBootstrapMock;
  let backlogRunService: CiaBacklogRunMock;
  let service: CiaRuntimeService;

  beforeEach(() => {
    prisma = makePrismaMock();
    providerRegistry = makeProviderRegistryMock();
    catchupService = makeCatchupServiceMock();
    agentEvents = makeAgentEventsMock();
    workerRuntime = makeWorkerRuntimeMock();
    redis = makeRedisMock();
    whatsappService = makeWhatsappServiceMock();
    unifiedAgent = makeUnifiedAgentMock();

    runtimeState = makeCiaRuntimeStateMock(prisma, agentEvents);
    bootstrapService = makeCiaBootstrapMock(
      prisma,
      providerRegistry,
      agentEvents,
      runtimeState,
      catchupService,
    );
    backlogRunService = makeCiaBacklogRunMock(
      prisma,
      providerRegistry,
      agentEvents,
      runtimeState,
      workerRuntime,
      bootstrapService,
      catchupService,
      unifiedAgent,
      whatsappService,
      redis,
    );

    service = new CiaRuntimeService(
      prisma as never,
      providerRegistry as never,
      agentEvents as never,
      runtimeState,
      bootstrapService,
      backlogRunService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.CIA_BOOTSTRAP_INCLUDE_ZERO_UNREAD_ACTIVITY;
    delete process.env.CIA_REMOTE_PENDING_MAX_AGE_MS;
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
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith('ws-1', 'cia_bootstrap');
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

  it('keeps the workspace in reactive silent mode and schedules contact catalog when bootstrap finds no backlog', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    providerRegistry.getChats.mockResolvedValue([
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
              proactiveEnabled: false,
            }),
            ciaRuntime: expect.objectContaining({
              state: 'LIVE_READY',
              mode: 'reply_only_new',
            }),
          }),
        }),
      }),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'catalog-contacts-30d',
      expect.objectContaining({
        workspaceId: 'ws-1',
        days: 30,
      }),
      expect.any(Object),
    );
  });

  it('treats recent WAHA chat activity as backlog only when the explicit zero-unread fallback is enabled', async () => {
    process.env.CIA_BOOTSTRAP_INCLUDE_ZERO_UNREAD_ACTIVITY = 'true';
    prisma.conversation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
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
    providerRegistry.getChats.mockResolvedValue([
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
    expect(catchupService.runCatchupNow).toHaveBeenCalledWith('ws-1', 'cia_bootstrap_inline');
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'sweep-unread-conversations',
      expect.objectContaining({
        workspaceId: 'ws-1',
        limit: 1,
      }),
      expect.any(Object),
    );
  });

  it('does not treat recent zero-unread WAHA activity as backlog by default', async () => {
    delete process.env.CIA_BOOTSTRAP_INCLUDE_ZERO_UNREAD_ACTIVITY;
    prisma.conversation.findMany.mockResolvedValue([]);
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511777777777@c.us',
        unreadCount: 0,
        lastMessageFromMe: true,
        timestamp: Date.now(),
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
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'catalog-contacts-30d',
      expect.objectContaining({
        workspaceId: 'ws-1',
      }),
      expect.any(Object),
    );
  });

  it('ignores stale WAHA chats whose latest remote signal came from the customer', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511777777777@c.us',
        unreadCount: 0,
        lastMessageFromMe: false,
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
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'catalog-contacts-30d',
      expect.objectContaining({
        workspaceId: 'ws-1',
      }),
      expect.any(Object),
    );
  });

  it('keeps FULL autonomy reactive-only when WAHA chat overview fails during bootstrap', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    providerRegistry.getChats.mockRejectedValue(new Error('TIMEOUT'));

    const result = await service.bootstrap('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 0,
        pendingMessages: 0,
        autoStarted: false,
      }),
    );
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith('ws-1', 'cia_bootstrap');
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
              proactiveEnabled: false,
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
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'catalog-contacts-30d',
      expect.objectContaining({
        workspaceId: 'ws-1',
      }),
      expect.any(Object),
    );
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

    const pending = await bootstrapService.listPendingConversations('ws-1', 10);

    expect(pending).toHaveLength(1);
    expect((pending[0] as { operational: Record<string, unknown> }).operational).toEqual(
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

    const result = await service.resumeConversationAutonomy('ws-1', 'conv-human-1');

    expect(result).toEqual({
      conversationId: 'conv-human-1',
      mode: 'AI',
      resumed: true,
    });
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv-human-1', workspaceId: 'ws-1' },
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
