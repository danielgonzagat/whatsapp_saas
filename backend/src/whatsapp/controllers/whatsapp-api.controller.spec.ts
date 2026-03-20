import { WhatsAppApiController } from './whatsapp-api.controller';

describe('WhatsAppApiController', () => {
  let providerRegistry: any;
  let whatsappApi: any;
  let catchupService: any;
  let agentEvents: any;
  let ciaRuntime: any;
  let whatsappService: any;
  let controller: WhatsAppApiController;

  beforeEach(() => {
    providerRegistry = {
      startSession: jest.fn(),
      getSessionStatus: jest.fn(),
    };
    whatsappApi = {};
    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };
    agentEvents = {};
    ciaRuntime = {};
    whatsappService = {
      listContacts: jest.fn().mockResolvedValue([{ phone: '5511999991111' }]),
      createContact: jest.fn().mockResolvedValue({ phone: '5511999992222' }),
      listChats: jest.fn().mockResolvedValue([{ id: 'chat-1', unreadCount: 2 }]),
      getChatMessages: jest.fn().mockResolvedValue([{ id: 'msg-1' }]),
      setPresence: jest.fn().mockResolvedValue({ ok: true }),
      getBacklog: jest.fn().mockResolvedValue({
        pendingConversations: 1,
        pendingMessages: 2,
      }),
      triggerSync: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    controller = new WhatsAppApiController(
      providerRegistry,
      whatsappApi,
      catchupService,
      agentEvents,
      ciaRuntime,
      whatsappService,
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
});
