import { WhatsAppApiController } from './whatsapp-api.controller';

describe('WhatsAppApiController', () => {
  let providerRegistry: any;
  let whatsappApi: any;
  let catchupService: any;
  let agentEvents: any;
  let ciaRuntime: any;
  let whatsappService: any;
  let accountAgent: any;
  let workspaces: any;
  let controller: WhatsAppApiController;

  beforeEach(() => {
    providerRegistry = {
      startSession: jest.fn(),
      getSessionStatus: jest.fn(),
      getProviderType: jest.fn().mockResolvedValue('whatsapp-api'),
      healthCheck: jest.fn().mockResolvedValue({ ok: true }),
    };
    whatsappApi = {
      getQrCode: jest.fn(),
      getRuntimeConfigDiagnostics: jest.fn().mockReturnValue({
        webhookUrl: 'https://api.kloel.test/webhooks/whatsapp-api',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['session.status', 'message', 'message.any', 'message.ack'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
        allowSessionWithoutWebhook: false,
        allowInternalWebhookUrl: false,
      }),
      getSessionConfigDiagnostics: jest.fn().mockResolvedValue({
        sessionName: 'ws-1',
        available: true,
        rawStatus: 'WORKING',
        state: 'CONNECTED',
        phoneNumber: '5511999991111@c.us',
        pushName: 'Loja Teste',
        webhookUrl: 'https://api.kloel.test/webhooks/whatsapp-api',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['session.status', 'message', 'message.any', 'message.ack'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
        configPresent: true,
      }),
    };
    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };
    agentEvents = {
      getRecent: jest.fn().mockReturnValue([]),
      subscribe: jest.fn().mockReturnValue(() => undefined),
    };
    ciaRuntime = {};
    whatsappService = {
      listContacts: jest.fn().mockResolvedValue([{ phone: '5511999991111' }]),
      createContact: jest.fn().mockResolvedValue({ phone: '5511999992222' }),
      listChats: jest.fn().mockResolvedValue([{ id: 'chat-1', unreadCount: 2 }]),
      getChatMessages: jest.fn().mockResolvedValue([{ id: 'msg-1' }]),
      setPresence: jest.fn().mockResolvedValue({ ok: true }),
      getOperationalBacklogReport: jest.fn().mockResolvedValue({
        sourceOfTruth: 'WAHA',
        items: [{ phone: '5511999991111', remoteUnreadCount: 2 }],
      }),
      getBacklog: jest.fn().mockResolvedValue({
        pendingConversations: 1,
        pendingMessages: 2,
      }),
      listCatalogContacts: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ phone: '5511999991111', purchaseProbabilityScore: 0.91 }],
      }),
      listPurchaseProbabilityRanking: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ rank: 1, phone: '5511999991111' }],
      }),
      triggerCatalogRefresh: jest.fn().mockResolvedValue({
        scheduled: true,
        jobName: 'catalog-contacts-30d',
      }),
      triggerCatalogRescore: jest.fn().mockResolvedValue({
        scheduled: true,
        count: 3,
      }),
      triggerSync: jest.fn().mockResolvedValue({ scheduled: true }),
    };
    accountAgent = {
      getRuntime: jest.fn().mockResolvedValue({ workItems: [] }),
    };
    workspaces = {
      getWorkspace: jest.fn().mockResolvedValue({
        providerSettings: {
          whatsappProvider: 'whatsapp-api',
          whatsappApiSession: {
            status: 'connected',
          },
        },
      }),
      patchSettings: jest.fn().mockResolvedValue({}),
    };

    controller = new WhatsAppApiController(
      providerRegistry,
      whatsappApi,
      catchupService,
      agentEvents,
      ciaRuntime,
      whatsappService,
      accountAgent,
      workspaces,
    );
  });

  it('does not trigger catchup during session status polling', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const result = await controller.getStatus({ workspaceId: 'ws-1' });

    expect(result).toEqual({
      connected: true,
      status: 'CONNECTED',
    });
    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
  });

  it('still triggers catchup when startSession detects an already connected session', async () => {
    providerRegistry.startSession.mockResolvedValue({
      success: true,
      message: 'already_connected',
    });

    const result = await controller.startSession({ workspaceId: 'ws-1' });

    expect(result).toEqual({
      success: true,
      message: 'already_connected',
    });
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'session_start_already_connected',
    );
  });

  it('exposes the WhatsApp access surface used by the agent loop', async () => {
    const contacts = await controller.getContacts({ workspaceId: 'ws-1' });
    const created = await controller.createContact(
      { workspaceId: 'ws-1' },
      { phone: '5511999992222', name: 'Novo' },
    );
    const chats = await controller.getChats({ workspaceId: 'ws-1' });
    const messages = await controller.getChatMessages(
      { workspaceId: 'ws-1', query: { limit: '50' }, body: {} },
      '5511999991111%40c.us',
    );
    const presence = await controller.setPresence(
      { workspaceId: 'ws-1' },
      '5511999991111%40c.us',
      { presence: 'typing' },
    );
    const backlog = await controller.getBacklog({ workspaceId: 'ws-1' });
    const sync = await controller.sync(
      { workspaceId: 'ws-1' },
      { reason: 'proof' },
    );

    expect(contacts).toEqual([{ phone: '5511999991111' }]);
    expect(created).toEqual({ phone: '5511999992222' });
    expect(chats).toEqual([{ id: 'chat-1', unreadCount: 2 }]);
    expect(messages).toEqual([{ id: 'msg-1' }]);
    expect(presence).toEqual({ ok: true });
    expect(backlog).toEqual({
      pendingConversations: 1,
      pendingMessages: 2,
    });
    expect(sync).toEqual({ scheduled: true });
    expect(whatsappService.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111@c.us',
      {
        limit: 50,
        offset: 0,
        downloadMedia: false,
      },
    );
  });

  it('exposes the operational backlog report, catalog list and probability ranking', async () => {
    const backlogReport = await controller.getOperationalBacklogReport({
      workspaceId: 'ws-1',
      query: {
        limit: '25',
        includeResolved: 'true',
      },
    });
    const catalogContacts = await controller.getCatalogContacts({
      workspaceId: 'ws-1',
      query: {
        days: '45',
        page: '2',
        limit: '20',
        onlyCataloged: 'false',
      },
    });
    const ranking = await controller.getCatalogRanking({
      workspaceId: 'ws-1',
      query: {
        days: '60',
        limit: '15',
        minLeadScore: '70',
        minProbabilityScore: '0.75',
      },
    });

    expect(backlogReport).toEqual({
      sourceOfTruth: 'WAHA',
      items: [{ phone: '5511999991111', remoteUnreadCount: 2 }],
    });
    expect(catalogContacts).toEqual({
      total: 1,
      items: [{ phone: '5511999991111', purchaseProbabilityScore: 0.91 }],
    });
    expect(ranking).toEqual({
      total: 1,
      items: [{ rank: 1, phone: '5511999991111' }],
    });

    expect(whatsappService.getOperationalBacklogReport).toHaveBeenCalledWith(
      'ws-1',
      {
        limit: 25,
        includeResolved: true,
      },
    );
    expect(whatsappService.listCatalogContacts).toHaveBeenCalledWith('ws-1', {
      days: 45,
      page: 2,
      limit: 20,
      onlyCataloged: false,
    });
    expect(whatsappService.listPurchaseProbabilityRanking).toHaveBeenCalledWith(
      'ws-1',
      {
        days: 60,
        limit: 15,
        minLeadScore: 70,
        minProbabilityScore: 0.75,
        onlyCataloged: true,
        excludeBuyers: false,
      },
    );
  });

  it('triggers manual catalog refresh and rescore jobs', async () => {
    const refresh = await controller.triggerCatalogRefresh(
      { workspaceId: 'ws-1' },
      { days: 45, reason: 'manual_audit' },
    );
    const rescore = await controller.triggerCatalogScore(
      { workspaceId: 'ws-1' },
      { days: 60, limit: 25, reason: 'manual_rescore' },
    );
    const oneContact = await controller.triggerCatalogScore(
      { workspaceId: 'ws-1' },
      { contactId: 'contact-1', reason: 'manual_single_rescore' },
    );

    expect(refresh).toEqual({
      scheduled: true,
      jobName: 'catalog-contacts-30d',
    });
    expect(rescore).toEqual({
      scheduled: true,
      count: 3,
    });
    expect(oneContact).toEqual({
      scheduled: true,
      count: 3,
    });

    expect(whatsappService.triggerCatalogRefresh).toHaveBeenCalledWith(
      'ws-1',
      {
        days: 45,
        reason: 'manual_audit',
      },
    );
    expect(whatsappService.triggerCatalogRescore).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      {
        contactId: undefined,
        days: 60,
        limit: 25,
        reason: 'manual_rescore',
      },
    );
    expect(whatsappService.triggerCatalogRescore).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      {
        contactId: 'contact-1',
        days: 30,
        limit: 100,
        reason: 'manual_single_rescore',
      },
    );
  });

  it('returns the QR directly when the provider has it available', async () => {
    whatsappApi.getQrCode.mockResolvedValue({
      success: true,
      qr: 'data:image/png;base64,abc123',
    });

    const result = await controller.getQrCode({ workspaceId: 'ws-1' });

    expect(result).toEqual({
      available: true,
      qr: 'data:image/png;base64,abc123',
    });
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
  });

  it('falls back to the session snapshot QR when direct QR retrieval is unavailable', async () => {
    whatsappApi.getQrCode.mockResolvedValue({
      success: false,
      message: 'QR not available',
    });
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'SCAN_QR_CODE',
      qrCode: 'data:image/png;base64,fallback',
    });

    const result = await controller.getQrCode({ workspaceId: 'ws-1' });

    expect(result).toEqual({
      available: true,
      qr: 'data:image/png;base64,fallback',
      message: 'QR Code recuperado do snapshot da sessão.',
    });
  });

  it('links an externally created WAHA session to the current workspace and bootstraps if connected', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });
    ciaRuntime.bootstrap = jest
      .fn()
      .mockResolvedValue({ connected: true, mode: 'LIVE' });

    const result = await controller.linkSession(
      { workspaceId: 'ws-1' },
      { sessionName: 'default' },
    );

    expect(workspaces.patchSettings).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: expect.objectContaining({
          status: 'connected',
          sessionName: 'default',
          linkedAt: expect.any(String),
        }),
      }),
    );
    expect(providerRegistry.getSessionStatus).toHaveBeenCalledWith('ws-1');
    expect(ciaRuntime.bootstrap).toHaveBeenCalledWith('ws-1');
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        workspaceId: 'ws-1',
        sessionName: 'default',
        status: {
          connected: true,
          status: 'CONNECTED',
        },
        bootstrap: {
          connected: true,
          mode: 'LIVE',
        },
      }),
    );
  });

  it('rejects empty session names when linking an external WAHA session', async () => {
    const result = await controller.linkSession(
      { workspaceId: 'ws-1' },
      {},
    );

    expect(result).toEqual({
      success: false,
      message: 'sessionName is required',
    });
    expect(workspaces.patchSettings).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
  });

  it('claims a guest workspace session into the authenticated workspace and bootstraps it', async () => {
    workspaces.getWorkspace
      .mockResolvedValueOnce({
        providerSettings: {
          guestMode: true,
          authMode: 'anonymous',
          whatsappApiSession: {
            sessionName: 'guest-session',
            status: 'connected',
            phoneNumber: '5511999991111@c.us',
            pushName: 'Loja Teste',
          },
        },
      })
      .mockResolvedValueOnce({
        providerSettings: {
          guestMode: true,
          authMode: 'anonymous',
          whatsappApiSession: {
            sessionName: 'guest-session',
            status: 'connected',
            phoneNumber: '5511999991111@c.us',
            pushName: 'Loja Teste',
          },
        },
      })
      .mockResolvedValueOnce({
        providerSettings: {
          whatsappProvider: 'whatsapp-api',
          whatsappApiSession: {},
        },
      });

    providerRegistry.getSessionStatus
      .mockResolvedValueOnce({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '5511999991111@c.us',
        pushName: 'Loja Teste',
      })
      .mockResolvedValueOnce({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '5511999991111@c.us',
        pushName: 'Loja Teste',
      });

    ciaRuntime.bootstrap = jest
      .fn()
      .mockResolvedValue({ connected: true, mode: 'LIVE' });

    const result = await controller.claimSession(
      { workspaceId: 'ws-1' },
      { sourceWorkspaceId: 'guest-ws' },
    );

    expect(workspaces.patchSettings).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      expect.objectContaining({
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: expect.objectContaining({
          sessionName: 'guest-session',
          claimedFromWorkspaceId: 'guest-ws',
        }),
      }),
    );
    expect(workspaces.patchSettings).toHaveBeenNthCalledWith(
      2,
      'guest-ws',
      expect.objectContaining({
        connectionStatus: 'claimed',
        whatsappApiSession: expect.objectContaining({
          sessionName: null,
          claimedByWorkspaceId: 'ws-1',
        }),
      }),
    );
    expect(ciaRuntime.bootstrap).toHaveBeenCalledWith('ws-1');
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        sourceWorkspaceId: 'guest-ws',
        targetWorkspaceId: 'ws-1',
        sessionName: 'guest-session',
        status: expect.objectContaining({
          connected: true,
          status: 'CONNECTED',
        }),
      }),
    );
  });

  it('exposes expanded provider diagnostics, backlog and degraded state', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const result = await controller.getProviderStatus({ workspaceId: 'ws-1' });

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        configuredProvider: 'whatsapp-api',
        session: {
          connected: true,
          status: 'CONNECTED',
        },
        degradedMode: false,
        degradedReasons: [],
        diagnostics: expect.objectContaining({
          runtime: expect.objectContaining({
            webhookConfigured: true,
            storeEnabled: true,
          }),
          sessionConfig: expect.objectContaining({
            available: true,
            configPresent: true,
          }),
          backlog: expect.objectContaining({
            pendingConversations: 1,
            pendingMessages: 2,
          }),
          catchup: expect.objectContaining({
            lastCatchupAt: null,
            recoveryBlockedReason: null,
          }),
        }),
      }),
    );
  });
});
