import { GoneException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../../../common/interfaces';
import { WhatsAppApiController } from './whatsapp-api.controller';
import { WhatsAppCatalogController } from './whatsapp-catalog.controller';
import { WhatsAppMetaCompatController } from './whatsapp-meta-compat.controller';

describe('WhatsAppApiController', () => {
  let providerRegistry: {
    startSession: jest.Mock;
    restartSession: jest.Mock;
    getSessionStatus: jest.Mock;
    getQrCode: jest.Mock;
    getProviderType: jest.Mock;
    syncSessionConfig: jest.Mock;
  };
  let whatsappApi: {
    getResolvedSessionId: jest.Mock;
    getSessionConfigDiagnostics: jest.Mock;
    getClientInfo: jest.Mock;
    getRuntimeConfigDiagnostics: jest.Mock;
  };
  let agentEvents: {
    getRecent: jest.Mock;
    subscribe: jest.Mock;
    publish: jest.Mock;
  };
  let ciaRuntime: {
    getOperationalIntelligence: jest.Mock;
    bootstrap: jest.Mock;
    startBacklogRun: jest.Mock;
    pauseAutonomy: jest.Mock;
  };
  let whatsappService: {
    listContacts: jest.Mock;
    createContact: jest.Mock;
    listChats: jest.Mock;
    getChatMessages: jest.Mock;
    setPresence: jest.Mock;
    getOperationalBacklogReport: jest.Mock;
    getBacklog: jest.Mock;
    listCatalogContacts: jest.Mock;
    listPurchaseProbabilityRanking: jest.Mock;
    triggerCatalogRefresh: jest.Mock;
    triggerCatalogRescore: jest.Mock;
    triggerSync: jest.Mock;
  };
  let accountAgent: {
    getRuntime: jest.Mock;
  };
  let workspaces: {
    getWorkspace: jest.Mock;
    patchSettings: jest.Mock;
  };
  let controller: WhatsAppApiController;
  let metaCompatController: WhatsAppMetaCompatController;
  let catalogController: WhatsAppCatalogController;

  beforeEach(() => {
    providerRegistry = {
      startSession: jest.fn(),
      restartSession: jest.fn().mockResolvedValue({ success: true, message: 'already_connected' }),
      getSessionStatus: jest.fn().mockResolvedValue({
        connected: false,
        status: 'PENDING',
      }),
      getQrCode: jest.fn(),
      getProviderType: jest.fn().mockResolvedValue('meta-cloud'),
      syncSessionConfig: jest.fn().mockResolvedValue(undefined),
    };
    whatsappApi = {
      getResolvedSessionId: jest
        .fn<string, [string]>()
        .mockImplementation((value: string) => value),
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
    agentEvents = {
      getRecent: jest.fn().mockReturnValue([]),
      subscribe: jest.fn().mockReturnValue(() => undefined),
      publish: jest.fn().mockResolvedValue(undefined),
    };
    ciaRuntime = {
      getOperationalIntelligence: jest.fn().mockResolvedValue(null),
      bootstrap: jest.fn().mockResolvedValue({ connected: true, mode: 'LIVE' }),
      startBacklogRun: jest.fn().mockResolvedValue({ queued: true }),
      pauseAutonomy: jest.fn().mockResolvedValue({ paused: true }),
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

    controller = new WhatsAppApiController(
      providerRegistry as never,
      whatsappApi as never,
      agentEvents as never,
      ciaRuntime as never,
      whatsappService as never,
      accountAgent as never,
      workspaces as never,
    );
    metaCompatController = new WhatsAppMetaCompatController();
    catalogController = new WhatsAppCatalogController(whatsappService as never);
  });

  function expectMetaOnlyGone(run: () => unknown, feature: string) {
    try {
      run();
    } catch (error) {
      if (!(error instanceof GoneException)) {
        throw error;
      }
      expect(error.getStatus()).toBe(410);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          provider: 'meta-cloud',
          notSupported: true,
          feature,
        }),
      );
      return;
    }
    throw new Error(`Expected ${feature} to reject with GoneException`);
  }

  it('rejects legacy session lifecycle endpoints with Meta-only Gone responses', () => {
    expectMetaOnlyGone(() => controller.getStatus(), 'legacy_session_status');
    expectMetaOnlyGone(() => controller.startSession(), 'legacy_session_start');
    expectMetaOnlyGone(() => controller.forceCheck(), 'legacy_session_force_check');
    expectMetaOnlyGone(() => controller.forceReconnect(), 'legacy_session_force_reconnect');
    expectMetaOnlyGone(() => controller.repairConfig(), 'legacy_session_repair_config');
    expectMetaOnlyGone(() => controller.getRetiredSessionCode(), 'legacy_session_code');
    expectMetaOnlyGone(() => controller.getSessionView(), 'legacy_session_view');
    expectMetaOnlyGone(() => controller.disconnect(), 'legacy_session_disconnect');
    expectMetaOnlyGone(() => controller.logout(), 'legacy_session_logout');

    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(providerRegistry.restartSession).not.toHaveBeenCalled();
    expect(providerRegistry.getQrCode).not.toHaveBeenCalled();
    expect(providerRegistry.syncSessionConfig).not.toHaveBeenCalled();
  });

  it('falls back to the resolved workspace session id when sessionName is malformed', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });
    workspaces.getWorkspace.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: {
        whatsappProvider: 'meta-cloud',
        whatsappApiSession: { sessionName: { broken: true } },
      },
    });

    const result = await controller.getDiagnostics({
      workspaceId: 'ws-1',
    } as never as AuthenticatedRequest);

    expect(result).toEqual(
      expect.objectContaining({
        sessionName: 'ws-1',
      }),
    );
    expect(whatsappApi.getSessionConfigDiagnostics).toHaveBeenCalledWith('ws-1');
    expect(whatsappApi.getClientInfo).toHaveBeenCalledWith('ws-1');
  });

  it('normalizes unsupported backlog modes to the safe default', async () => {
    await controller.startBacklog({ workspaceId: 'ws-1' } as never as AuthenticatedRequest, {
      mode: 'unexpected-mode',
      limit: 12,
    });

    expect(ciaRuntime.startBacklogRun).toHaveBeenCalledWith('ws-1', 'reply_all_recent_first', 12);
  });

  it('rejects legacy compat and recreate endpoints with Meta-only Gone responses', () => {
    expectMetaOnlyGone(() => metaCompatController.linkSession(), 'legacy_session_link');
    expectMetaOnlyGone(() => metaCompatController.claimSession(), 'legacy_session_claim');
    expectMetaOnlyGone(
      () => metaCompatController.getSessionStreamToken(),
      'legacy_session_stream_token',
    );
    expectMetaOnlyGone(
      () => catalogController.recreateSessionIfInvalid(),
      'legacy_session_recreate_if_invalid',
    );
  });

  it('delegates contacts, chats, backlog and sync actions to WhatsappService', async () => {
    const mockReq = {
      user: { workspaceId: 'ws-1' },
      workspaceId: 'ws-1',
    } as never as AuthenticatedRequest;
    const contacts = await catalogController.getContacts(mockReq);
    const created = await catalogController.createContact(mockReq, {
      phone: '5511999992222',
      name: 'Novo',
    });
    const chats = await catalogController.getChats(mockReq);
    const messages = await catalogController.getChatMessages(
      {
        user: { workspaceId: 'ws-1' },
        workspaceId: 'ws-1',
        query: { limit: '50' },
        body: {},
      } as never as AuthenticatedRequest,
      '5511999991111%40c.us',
    );
    const presence = await catalogController.setPresence(mockReq, '5511999991111%40c.us', {
      presence: 'typing',
    });
    const backlog = await catalogController.getBacklog(mockReq);
    const sync = await catalogController.sync(mockReq, { reason: 'proof' });

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
