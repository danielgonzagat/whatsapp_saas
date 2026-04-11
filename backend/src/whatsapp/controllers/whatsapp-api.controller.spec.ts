import { AuthenticatedRequest } from '../../common/interfaces';
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
  let watchdog: any;
  let controller: WhatsAppApiController;

  beforeEach(() => {
    providerRegistry = {
      startSession: jest.fn(),
      restartSession: jest.fn().mockResolvedValue({ success: true, message: 'already_connected' }),
      getSessionStatus: jest.fn(),
      getQrCode: jest.fn(),
      getProviderType: jest.fn().mockResolvedValue('meta-cloud'),
      syncSessionConfig: jest.fn().mockResolvedValue(undefined),
    };
    whatsappApi = {
      getResolvedSessionId: jest.fn().mockImplementation((value) => value),
      getSessionConfigDiagnostics: jest.fn().mockResolvedValue({
        sessionName: 'ws-1',
        available: true,
        rawStatus: 'CONNECTED',
        state: 'CONNECTED',
        phoneNumber: '5511999991111',
        pushName: 'Loja Teste',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['messages'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
        configPresent: true,
      }),
      getClientInfo: jest.fn().mockResolvedValue({
        provider: 'meta-cloud',
        connected: true,
      }),
      getRuntimeConfigDiagnostics: jest.fn().mockReturnValue({
        provider: 'meta-cloud',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['messages'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
      }),
    };
    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };
    agentEvents = {
      getRecent: jest.fn().mockReturnValue([]),
      subscribe: jest.fn().mockReturnValue(() => undefined),
      publish: jest.fn().mockResolvedValue(undefined),
    };
    ciaRuntime = {
      getOperationalIntelligence: jest.fn().mockResolvedValue(null),
      bootstrap: jest.fn().mockResolvedValue({ connected: true, mode: 'LIVE' }),
    };
    whatsappService = {
      listContacts: jest.fn().mockResolvedValue([{ phone: '5511999991111' }]),
      createContact: jest.fn().mockResolvedValue({ phone: '5511999992222' }),
      listChats: jest.fn().mockResolvedValue([{ id: 'chat-1', unreadCount: 2 }]),
      getChatMessages: jest.fn().mockResolvedValue([{ id: 'msg-1' }]),
      setPresence: jest.fn().mockResolvedValue({ ok: true }),
      getOperationalBacklogReport: jest.fn().mockResolvedValue({
        sourceOfTruth: 'META',
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
        name: 'Workspace Teste',
        providerSettings: {
          whatsappProvider: 'meta-cloud',
          whatsappApiSession: { status: 'connected' },
        },
      }),
      patchSettings: jest.fn().mockResolvedValue({}),
    };
    watchdog = {
      checkWorkspaceSession: jest.fn().mockResolvedValue(undefined),
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
      watchdog,
    );
  });

  it('returns provider-aware session status', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    await expect(
      controller.getStatus({ workspaceId: 'ws-1' } as unknown as AuthenticatedRequest),
    ).resolves.toEqual({
      connected: true,
      status: 'CONNECTED',
      provider: 'meta-cloud',
    });
  });

  it('returns QR code from the active provider registry instead of the meta provider', async () => {
    providerRegistry.getQrCode.mockResolvedValue({
      success: true,
      qr: 'data:image/png;base64,qr-live',
    });

    await expect(
      controller.getQrCode({ workspaceId: 'ws-1' } as unknown as AuthenticatedRequest),
    ).resolves.toEqual({
      available: true,
      qr: 'data:image/png;base64,qr-live',
    });
    expect(providerRegistry.getQrCode).toHaveBeenCalledWith('ws-1');
  });

  it('still triggers catchup when startSession reports already connected', async () => {
    providerRegistry.startSession.mockResolvedValue({
      success: true,
      message: 'already_connected',
    });

    await expect(
      controller.startSession({ workspaceId: 'ws-1' } as unknown as AuthenticatedRequest),
    ).resolves.toEqual({
      success: true,
      message: 'already_connected',
    });
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'session_start_already_connected',
    );
  });

  it('forces a watchdog check and returns diagnostics', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const result = await controller.forceCheck({
      workspaceId: 'ws-1',
    } as unknown as AuthenticatedRequest);

    expect(watchdog.checkWorkspaceSession).toHaveBeenCalledWith('ws-1', 'Workspace Teste');
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        diagnostics: expect.objectContaining({
          workspaceId: 'ws-1',
          providerType: 'meta-cloud',
        }),
      }),
    );
  });

  it('returns a not-supported response for legacy session linking', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'CONNECTION_INCOMPLETE',
      authUrl: 'https://meta.test/signup',
    });

    await expect(
      controller.linkSession({ workspaceId: 'ws-1' } as unknown as AuthenticatedRequest, {
        sessionName: 'legacy',
      }),
    ).resolves.toEqual({
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: 'legacy_session_link_not_supported_for_meta_cloud',
      authUrl: 'https://meta.test/signup',
    });
  });

  it('delegates contacts, chats, backlog and sync actions to WhatsappService', async () => {
    const mockReq = { workspaceId: 'ws-1' } as unknown as AuthenticatedRequest;
    const contacts = await controller.getContacts(mockReq);
    const created = await controller.createContact(mockReq, {
      phone: '5511999992222',
      name: 'Novo',
    });
    const chats = await controller.getChats(mockReq);
    const messages = await controller.getChatMessages(
      { workspaceId: 'ws-1', query: { limit: '50' }, body: {} } as unknown as AuthenticatedRequest,
      '5511999991111%40c.us',
    );
    const presence = await controller.setPresence(mockReq, '5511999991111%40c.us', {
      presence: 'typing',
    });
    const backlog = await controller.getBacklog(mockReq);
    const sync = await controller.sync(mockReq, { reason: 'proof' });

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
  });
});
