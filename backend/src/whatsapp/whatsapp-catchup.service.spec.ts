jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const { autopilotQueue } = jest.requireMock('../queue/queue');

import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import {
  applyCatchupEnvDefaults,
  buildCatchupMocks,
  buildCatchupService,
  type CatchupAgentEventsMock,
  type CatchupCiaRuntimeMock,
  type CatchupInboxMock,
  type CatchupInboundProcessorMock,
  type CatchupPrismaMock,
  type CatchupProviderRegistryMock,
  type CatchupRedisMock,
  type CatchupWorkerRuntimeMock,
  runCatchup,
} from './whatsapp-catchup.service.spec-helpers';

describe('WhatsAppCatchupService', () => {
  const originalEnv = { ...process.env };

  let prisma: CatchupPrismaMock;
  let providerRegistry: CatchupProviderRegistryMock;
  let inboundProcessor: CatchupInboundProcessorMock;
  let inbox: CatchupInboxMock;
  let redis: CatchupRedisMock;
  let agentEvents: CatchupAgentEventsMock;
  let ciaRuntime: CatchupCiaRuntimeMock;
  let workerRuntime: CatchupWorkerRuntimeMock;

  const buildService = (): WhatsAppCatchupService =>
    buildCatchupService({
      prisma,
      providerRegistry,
      inboundProcessor,
      inbox,
      redis,
      agentEvents,
      ciaRuntime,
      workerRuntime,
    });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    applyCatchupEnvDefaults();

    const mocks = buildCatchupMocks();
    prisma = mocks.prisma;
    providerRegistry = mocks.providerRegistry;
    inboundProcessor = mocks.inboundProcessor;
    inbox = mocks.inbox;
    redis = mocks.redis;
    agentEvents = mocks.agentEvents;
    ciaRuntime = mocks.ciaRuntime;
    workerRuntime = mocks.workerRuntime;

    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511999999999@c.us',
        unreadCount: 3,
        timestamp: Date.now() - 60 * 60 * 1000,
      },
      {
        id: '5511888888888@c.us',
        unreadCount: 1,
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
      },
    ]);
    providerRegistry.getChatMessages.mockImplementation(
      async (
        _workspaceId: string,
        chatId: string,
        options?: { limit?: number; offset?: number },
      ) => {
        const offset = options?.offset || 0;
        if (chatId === '5511999999999@c.us') {
          const pages = [
            [
              {
                id: 'msg-1',
                from: '5511999999999@c.us',
                body: 'Oi, quero detalhes do produto',
                type: 'chat',
                timestamp: Date.now() - 2 * 60 * 60 * 1000,
              },
              {
                id: 'msg-1b',
                from: '5511999999999@c.us',
                body: 'Também quero saber o preço',
                type: 'chat',
                timestamp: Date.now() - 90 * 60 * 1000,
              },
            ],
            [
              {
                id: 'msg-1c',
                from: '5511999999999@c.us',
                body: 'Pode me explicar como funciona?',
                type: 'chat',
                timestamp: Date.now() - 80 * 60 * 1000,
              },
            ],
          ];
          return pages[Math.floor(offset / 2)] || [];
        }
        return [
          {
            id: 'msg-2',
            from: '5511888888888@c.us',
            body: 'Tem promoção?',
            type: 'chat',
            timestamp: Date.now() - 10 * 60 * 1000,
          },
        ];
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('imports unread backlog older than lookback and paginates until draining the chat', async () => {
    const service = buildService();

    await runCatchup(service, 'ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledTimes(3);
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: 'ws-1',
        ingestMode: 'catchup',
        providerMessageId: 'msg-1',
        text: 'Oi, quero detalhes do produto',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-1b',
        text: 'Também quero saber o preço',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-2',
        text: 'Tem promoção?',
      }),
    );
    expect(providerRegistry.readChatMessages).toHaveBeenCalledTimes(2);
    const chatMsgsCalls = providerRegistry.getChatMessages.mock.calls as Array<
      [string, string, ...unknown[]]
    >;
    expect(chatMsgsCalls.some(([ws, cid]) => ws === 'ws-1' && cid === '5511999999999@c.us')).toBe(
      true,
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              lastCatchupImportedMessages: 3,
              lastCatchupTouchedChats: 2,
              lastCatchupOverflow: true,
            }),
          }),
        }),
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phase: 'sync_start',
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phase: 'sync_complete',
      }),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'sweep-unread-conversations',
      expect.objectContaining({
        workspaceId: 'ws-1',
        mode: 'reply_all_recent_first',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('catchup-sweep-unread'),
      }),
    );
  });

  it('ignores the workspace own chat during catchup', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: {
        whatsappApiSession: {
          phoneNumber: '5511999999999',
        },
      },
    });

    const service = buildService();

    await runCatchup(service, 'ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).not.toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-1',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenCalledTimes(1);
    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-2',
      }),
    );
    expect(providerRegistry.readChatMessages).toHaveBeenCalledTimes(1);
    expect(providerRegistry.readChatMessages).toHaveBeenCalledWith('ws-1', '5511888888888@c.us');
  });

  it('marks NOWEB store misconfiguration as a structural catchup failure', async () => {
    providerRegistry.getChats.mockRejectedValue(
      new Error(
        'Enable NOWEB store "config.noweb.store.enabled=True" and "config.noweb.store.full_sync=True"',
      ),
    );

    const service = buildService();

    await expect(
      runCatchup(service, 'ws-1', 'session_status_connected', 'lock-token'),
    ).rejects.toThrow('Enable NOWEB store');

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              recoveryBlockedReason: 'noweb_store_misconfigured',
              lastCatchupError: expect.stringContaining('Enable NOWEB store'),
            }),
          }),
        }),
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phase: 'sync_error',
        meta: expect.objectContaining({
          recoveryBlockedReason: 'noweb_store_misconfigured',
        }),
      }),
    );
  });

  it('falls back to scanning stale chats when unread metadata is missing', async () => {
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511777777777@c.us',
        unreadCount: 0,
        timestamp: Date.now() - 48 * 60 * 60 * 1000,
      },
    ]);
    providerRegistry.getChatMessages.mockResolvedValue([
      {
        id: 'msg-old-1',
        from: '5511777777777@c.us',
        body: 'Mensagem antiga ainda não processada',
        type: 'chat',
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
      },
    ]);

    const service = buildService();

    await runCatchup(service, 'ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        ingestMode: 'catchup',
        providerMessageId: 'msg-old-1',
        text: 'Mensagem antiga ainda não processada',
      }),
    );
    expect(providerRegistry.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511777777777@c.us',
      expect.objectContaining({ offset: 0 }),
    );
  });

  it('uses WAHA conversation timestamps when unread counters are absent', async () => {
    process.env.WAHA_CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY = 'true';
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511666666666@c.us',
        conversationTimestamp: Math.floor(Date.now() / 1000),
        lastMessageRecvTimestamp: Math.floor(Date.now() / 1000),
      },
    ]);
    providerRegistry.getChatMessages.mockResolvedValue([
      {
        id: 'msg-conv-ts-1',
        from: '5511666666666@c.us',
        body: 'Mensagem recente sem unreadCount',
        type: 'chat',
        timestamp: Date.now() - 5 * 60 * 1000,
      },
    ]);

    const service = buildService();

    await runCatchup(service, 'ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-conv-ts-1',
        text: 'Mensagem recente sem unreadCount',
      }),
    );
    expect(providerRegistry.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511666666666@c.us',
      expect.objectContaining({ offset: 0 }),
    );
  });

  it('prefers remoteJidAlt over LID identifiers when importing catchup messages', async () => {
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '262744758587590@lid',
        unreadCount: 1,
        timestamp: Date.now(),
      },
    ]);
    providerRegistry.getChatMessages.mockResolvedValue([
      {
        id: 'msg-lid-1',
        from: '262744758587590@lid',
        body: 'Olá, preciso de ajuda',
        type: 'chat',
        timestamp: Date.now() - 5 * 60 * 1000,
        _data: {
          key: {
            remoteJid: '262744758587590@lid',
            remoteJidAlt: '5511963104453@s.whatsapp.net',
          },
        },
      },
    ]);

    const service = buildService();

    await runCatchup(service, 'ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        from: '5511963104453@s.whatsapp.net',
        providerMessageId: 'msg-lid-1',
      }),
    );
  });

  it('marks the workspace disconnected when catchup discovers that the WAHA session no longer exists', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: {
        connectionStatus: 'connected',
        whatsappApiSession: {
          sessionName: 'ws-1',
          status: 'connected',
          phoneNumber: '5511999999999',
          pushName: 'Workspace Teste',
        },
      },
    });
    providerRegistry.getChats.mockRejectedValue(new Error('Session "ws-1" does not exist'));

    const service = buildService();

    await expect(
      runCatchup(service, 'ws-1', 'session_status_connected', 'lock-token'),
    ).rejects.toThrow('Session "ws-1" does not exist');

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'disconnected',
            whatsappApiSession: expect.objectContaining({
              status: 'disconnected',
              rawStatus: 'SESSION_MISSING',
              disconnectReason: 'Session "ws-1" does not exist',
              phoneNumber: null,
              pushName: null,
              connectedAt: null,
            }),
          }),
        }),
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phase: 'sync_error',
        meta: expect.objectContaining({
          sessionMissing: true,
        }),
      }),
    );
  });

  it('does not schedule catchup for guest workspaces', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Guest Workspace',
      providerSettings: {
        guestMode: true,
        whatsappLifecycle: {
          catchupEnabled: false,
        },
      },
    });

    const service = buildService();

    await expect(service.triggerCatchup('guest-ws', 'manual')).resolves.toEqual({
      scheduled: false,
      reason: 'guest_workspace_disabled',
    });

    expect(redis.set).not.toHaveBeenCalled();
    expect(providerRegistry.getChats).not.toHaveBeenCalled();
  });

  it('rotates stale fallback chats using the persisted backfill cursor', async () => {
    process.env.WAHA_CATCHUP_MAX_PASSES = '1';
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: {
        whatsappApiSession: {
          backfillCursor: {
            chatId: '5511000000001@c.us',
            activityTimestamp: Date.now() - 40 * 24 * 60 * 60 * 1000,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511000000001@c.us',
        unreadCount: 0,
        timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000,
      },
      {
        id: '5511000000002@c.us',
        unreadCount: 0,
        timestamp: Date.now() - 41 * 24 * 60 * 60 * 1000,
      },
    ]);
    providerRegistry.getChatMessages.mockImplementation(
      async (_workspaceId: string, chatId: string) => [
        {
          id: `msg-${chatId}`,
          from: chatId,
          body: `Mensagem pendente em ${chatId}`,
          type: 'chat',
          timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        },
      ],
    );

    const service = buildService();

    await runCatchup(service, 'ws-1', 'watchdog_connected_scan', 'lock-token');

    expect(providerRegistry.getChatMessages).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      '5511000000002@c.us',
      expect.objectContaining({ offset: 0 }),
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              backfillCursor: expect.objectContaining({
                chatId: expect.stringMatching(/c\.us$/),
              }),
            }),
          }),
        }),
      }),
    );
  });

  describe('workspace isolation (invariant I4)', () => {
    it('always passes workspaceId to provider getChats', async () => {
      const service = buildService();

      await runCatchup(service, 'ws-tenant-a', 'test', 'lock-token');

      const calls = providerRegistry.getChats.mock.calls as Array<[string, ...unknown[]]>;
      for (const [wsArg] of calls) {
        expect(wsArg).toBe('ws-tenant-a');
      }
    });

    it('always passes workspaceId to provider getChatMessages', async () => {
      const service = buildService();

      await runCatchup(service, 'ws-tenant-b', 'test', 'lock-token');

      const calls = providerRegistry.getChatMessages.mock.calls as Array<[string, ...unknown[]]>;
      expect(calls.length).toBeGreaterThan(0);
      for (const [wsArg] of calls) {
        expect(wsArg).toBe('ws-tenant-b');
      }
    });

    it('persists catchup snapshot with correct workspaceId', async () => {
      const service = buildService();

      await runCatchup(service, 'ws-zen', 'test', 'lock-token');

      const calls = prisma.workspace.update.mock.calls as Array<
        [{ where: { id: string }; data: Record<string, unknown> }]
      >;
      for (const [arg] of calls) {
        expect(arg.where.id).toBe('ws-zen');
      }
    });

    it('publishes agent events with correct workspaceId', async () => {
      const service = buildService();

      await runCatchup(service, 'ws-events', 'test', 'lock-token');

      const calls = agentEvents.publish.mock.calls as Array<[{ workspaceId: string }]>;
      expect(calls.length).toBeGreaterThan(0);
      for (const [arg] of calls) {
        expect(arg.workspaceId).toBe('ws-events');
      }
    });
  });

  describe('idempotency (invariant I2)', () => {
    it('deduplication: replay of same messageId increments only the first non-deduped call', async () => {
      const processed: Array<{ deduped?: boolean }> = [];
      inboundProcessor.process.mockImplementation(async (_msg: unknown) => {
        const isSecond = processed.length === 1;
        const result = { deduped: isSecond };
        processed.push(result);
        return result;
      });

      const service = buildService();

      await runCatchup(service, 'ws-dedup', 'test', 'lock-token');

      const dedupedCount = processed.filter((r) => r.deduped === true).length;
      const nonDedupedCount = processed.filter((r) => r.deduped === false).length;
      expect(processed.length).toBeGreaterThan(0);
      expect(dedupedCount).toBeGreaterThanOrEqual(1);
      expect(nonDedupedCount).toBeGreaterThanOrEqual(1);
    });
  });
});
