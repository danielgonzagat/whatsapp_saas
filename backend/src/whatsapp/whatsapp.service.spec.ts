import { WhatsappService } from './whatsapp.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

import { buildWhatsappServiceSetup, WhatsappServiceSetup } from './whatsapp.service.spec-setup';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let mockAutopilotAdd: jest.Mock;
  let _mockFlowAdd: jest.Mock;
  let workspaceService: WhatsappServiceSetup['workspaceService'];
  let _inboxService: WhatsappServiceSetup['inboxService'];
  let _planLimits: WhatsappServiceSetup['planLimits'];
  let _redis: WhatsappServiceSetup['redis'];
  let _neuroCrm: WhatsappServiceSetup['neuroCrm'];
  let prisma: WhatsappServiceSetup['prisma'];
  let providerRegistry: WhatsappServiceSetup['providerRegistry'];
  let _whatsappApi: WhatsappServiceSetup['whatsappApi'];
  let _catchupService: WhatsappServiceSetup['catchupService'];
  let _ciaRuntime: WhatsappServiceSetup['ciaRuntime'];
  let _workerRuntime: WhatsappServiceSetup['workerRuntime'];

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-04-20T00:00:00.000Z'));
    const setup = buildWhatsappServiceSetup();
    service = setup.service;
    mockAutopilotAdd = setup.mockAutopilotAdd;
    _mockFlowAdd = setup.mockFlowAdd;
    workspaceService = setup.workspaceService;
    _inboxService = setup.inboxService;
    _planLimits = setup.planLimits;
    _redis = setup.redis;
    _neuroCrm = setup.neuroCrm;
    prisma = setup.prisma;
    providerRegistry = setup.providerRegistry;
    _whatsappApi = setup.whatsappApi;
    _catchupService = setup.catchupService;
    _ciaRuntime = setup.ciaRuntime;
    _workerRuntime = setup.workerRuntime;
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

    expect(messages.map((message: { id: string }) => message.id)).toEqual([
      'm-old',
      'm-out',
      'm-new',
    ]);
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
});
