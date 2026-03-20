import { WhatsAppCatchupService } from './whatsapp-catchup.service';

describe('WhatsAppCatchupService', () => {
  const originalEnv = { ...process.env };

  let prisma: any;
  let whatsappApi: any;
  let inboundProcessor: any;
  let redis: any;
  let agentEvents: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    process.env.WAHA_CATCHUP_MAX_CHATS = '1';
    process.env.WAHA_CATCHUP_MAX_PASSES = '3';
    process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT = '2';
    process.env.WAHA_CATCHUP_MAX_PAGES_PER_CHAT = '3';
    process.env.WAHA_CATCHUP_FALLBACK_CHATS_PER_PASS = '1';
    process.env.WAHA_CATCHUP_FALLBACK_PAGES_PER_CHAT = '1';
    process.env.WAHA_CATCHUP_LOOKBACK_MS = `${60 * 60 * 1000}`;

    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Teste',
          providerSettings: { whatsappApiSession: {} },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    whatsappApi = {
      getChats: jest.fn().mockResolvedValue([
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
      ]),
      getChatMessages: jest
        .fn()
        .mockImplementation(
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
        ),
      sendSeen: jest.fn().mockResolvedValue(undefined),
    };

    inboundProcessor = {
      process: jest.fn().mockResolvedValue({ deduped: false }),
    };

    agentEvents = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue('lock-token'),
      del: jest.fn().mockResolvedValue(1),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('imports unread backlog older than lookback and paginates until draining the chat', async () => {
    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
      agentEvents,
    );

    await (service as any).runCatchup('ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledTimes(4);
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: 'ws-1',
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
        providerMessageId: 'msg-1c',
        text: 'Pode me explicar como funciona?',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-2',
        text: 'Tem promoção?',
      }),
    );
    expect(whatsappApi.sendSeen).toHaveBeenCalledTimes(2);
    expect(whatsappApi.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999@c.us',
      { limit: 2, offset: 0 },
    );
    expect(whatsappApi.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999@c.us',
      { limit: 2, offset: 2 },
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              lastCatchupImportedMessages: 4,
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
  });

  it('marks NOWEB store misconfiguration as a structural catchup failure', async () => {
    whatsappApi.getChats.mockRejectedValue(
      new Error(
        'Enable NOWEB store "config.noweb.store.enabled=True" and "config.noweb.store.full_sync=True"',
      ),
    );

    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
      agentEvents,
    );

    await expect(
      (service as any).runCatchup(
        'ws-1',
        'session_status_connected',
        'lock-token',
      ),
    ).rejects.toThrow('Enable NOWEB store');

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              recoveryBlockedReason: 'noweb_store_misconfigured',
              lastCatchupError: expect.stringContaining(
                'Enable NOWEB store',
              ),
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
    whatsappApi.getChats.mockResolvedValue([
      {
        id: '5511777777777@c.us',
        unreadCount: 0,
        timestamp: Date.now() - 48 * 60 * 60 * 1000,
      },
    ]);
    whatsappApi.getChatMessages.mockResolvedValue([
      {
        id: 'msg-old-1',
        from: '5511777777777@c.us',
        body: 'Mensagem antiga ainda não processada',
        type: 'chat',
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
      },
    ]);

    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
      agentEvents,
    );

    await (service as any).runCatchup('ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-old-1',
        text: 'Mensagem antiga ainda não processada',
      }),
    );
    expect(whatsappApi.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511777777777@c.us',
      { limit: 2, offset: 0 },
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
    whatsappApi.getChats.mockRejectedValue(
      new Error('Session "ws-1" does not exist'),
    );

    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
      agentEvents,
    );

    await expect(
      (service as any).runCatchup(
        'ws-1',
        'session_status_connected',
        'lock-token',
      ),
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

    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
      agentEvents,
    );

    await expect(service.triggerCatchup('guest-ws', 'manual')).resolves.toEqual({
      scheduled: false,
      reason: 'guest_workspace_disabled',
    });

    expect(redis.set).not.toHaveBeenCalled();
    expect(whatsappApi.getChats).not.toHaveBeenCalled();
  });
});
