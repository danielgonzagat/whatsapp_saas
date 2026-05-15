import { WhatsappService } from './whatsapp.service';
import {
  localContactsSeed,
  buildMockProviderRegistry,
  buildMockPrisma,
} from './whatsapp.service.spec.fixtures';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

type MockPrisma = {
  contact: {
    findMany: jest.Mock;
    upsert: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  conversation: { findMany: jest.Mock };
  message: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  autopilotEvent: { findFirst: jest.Mock; create: jest.Mock };
  tag: { upsert: jest.Mock; findUnique: jest.Mock };
  $transaction?: jest.Mock;
};

describe('WhatsappService', () => {
  let service: WhatsappService;
  let mockAutopilotAdd: jest.Mock;
  let mockFlowAdd: jest.Mock;
  let workspaceService: { getWorkspace: jest.Mock; toEngineWorkspace: jest.Mock };
  let inboxService: { saveMessageByPhone: jest.Mock };
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    set: jest.Mock;
    publish: jest.Mock;
    rpush: jest.Mock;
    expire: jest.Mock;
  };
  let prisma: MockPrisma;
  let providerRegistry: Record<string, jest.Mock>;
  let catchupService: { triggerCatchup: jest.Mock };
  let ciaRuntime: { startBacklogRun: jest.Mock };
  let workerRuntime: { isAvailable: jest.Mock };
  let whatsappApi: { getRuntimeConfigDiagnostics: jest.Mock };
  let sessionService: Record<string, jest.Mock>;
  let messageDispatcher: Record<string, jest.Mock>;
  let reconciler: Record<string, jest.Mock>;
  let chatMessagesService: Record<string, jest.Mock>;
  let chatBacklogService: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-04-20T00:00:00.000Z'));

    const queueModule = jest.requireMock('../queue/queue');
    mockAutopilotAdd = queueModule.autopilotQueue.add;
    mockFlowAdd = queueModule.flowQueue.add;

    workspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({
        id: 'ws-1',
        providerSettings: {
          autopilot: { enabled: false },
          whatsappApiSession: { status: 'connected' },
        },
      }),
      toEngineWorkspace: jest.fn((w: unknown) => w),
    };
    inboxService = {
      saveMessageByPhone: jest.fn().mockResolvedValue({ id: 'msg-1', contactId: 'contact-1' }),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
      publish: jest.fn().mockResolvedValue(1),
      rpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    prisma = buildMockPrisma(localContactsSeed);
    providerRegistry = buildMockProviderRegistry();
    catchupService = {
      triggerCatchup: jest
        .fn()
        .mockImplementation(async (_ws: string, reason: string) => ({ scheduled: true, reason })),
    };
    ciaRuntime = { startBacklogRun: jest.fn().mockResolvedValue({ queued: true, runId: 'run-1' }) };
    workerRuntime = { isAvailable: jest.fn().mockResolvedValue(true) };
    whatsappApi = {
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

    // ═══ delegate: sessionService ═══
    sessionService = {
      createSession: jest.fn().mockResolvedValue({ status: 'qr_pending' }),
      recreateSessionIfInvalid: jest.fn().mockResolvedValue({ success: true }),
      getSession: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      getConnectionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      getQrCode: jest.fn().mockResolvedValue({ success: true, qr: 'qr-placeholder' }),
      disconnect: jest.fn().mockResolvedValue({ success: true }),
      setPresence: jest
        .fn()
        .mockImplementation(
          async (
            ws: string,
            chatId: string,
            presence: 'typing' | 'paused' | 'seen' | 'available' | 'offline',
          ) => {
            const n = String(chatId || '').includes('@')
              ? chatId
              : `${(chatId || '').replace(/\D/g, '')}@c.us`;
            switch (presence) {
              case 'typing':
                await providerRegistry.sendTyping(ws, n);
                break;
              case 'paused':
                await providerRegistry.stopTyping(ws, n);
                break;
              case 'seen': {
                const cs = new Set<string>();
                cs.add(n);
                const nPhone = (chatId || '').replace(/\D/g, '');
                if (nPhone) {
                  cs.add(`${nPhone}@c.us`);
                  cs.add(`${nPhone}@s.whatsapp.net`);
                  const contact = await prisma.contact
                    .findUnique({
                      where: { workspaceId_phone: { workspaceId: ws, phone: nPhone } },
                      select: { customFields: true },
                    })
                    .catch(() => null);
                  const cf = contact?.customFields || {};
                  const readText = (v: unknown): string => {
                    if (typeof v === 'string') return v.trim();
                    return '';
                  };
                  const extraIds = [
                    readText(cf.lastRemoteChatId),
                    readText(cf.lastCatalogChatId),
                    readText(cf.lastResolvedChatId),
                  ].filter((s): s is string => Boolean(s));
                  for (const id of extraIds) cs.add(id);
                }
                for (const c of cs) {
                  await providerRegistry.readChatMessages(ws, c).catch(() => {});
                }
                break;
              }
              case 'available':
                await providerRegistry.setPresence(ws, 'available', n);
                break;
              case 'offline':
                await providerRegistry.setPresence(ws, 'offline', n);
                break;
            }
            return { ok: true, chatId: n, presence };
          },
        ),
      markChatAsReadBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    // ═══ delegate: messageDispatcher ═══
    messageDispatcher = {
      sendMessage: jest
        .fn()
        .mockImplementation(
          async (
            ws: string,
            to: string,
            message: string,
            opts?: { mediaUrl?: string; forceDirect?: boolean },
          ) => {
            const available = await workerRuntime.isAvailable();
            if (!available || opts?.forceDirect) {
              await providerRegistry.sendMessage(ws, to, message, {
                mediaUrl: opts?.mediaUrl,
              });
              return { ok: true, direct: true, delivery: 'sent' };
            }
            await mockFlowAdd('send-message', {
              workspaceId: ws,
              to,
              message,
            });
            return { ok: true, queued: true, delivery: 'queued' };
          },
        ),
      listTemplates: jest.fn().mockResolvedValue([]),
      sendTemplate: jest.fn().mockResolvedValue({ ok: true }),
      sendDirectMessage: jest.fn().mockResolvedValue({ ok: true, direct: true }),
    };

    // ═══ delegate: reconciler ═══
    reconciler = {
      handleIncoming: jest
        .fn()
        .mockImplementation(async (workspaceId: string, from: string, message: string) => {
          const saved = await inboxService.saveMessageByPhone({
            workspaceId,
            phone: from,
            content: message,
            direction: 'INBOUND',
          });
          if (!saved.contactId) return saved;
          const ws = await workspaceService.getWorkspace(workspaceId);
          const settings = ws?.providerSettings || {};
          const auto = (settings as Record<string, unknown>).autopilot as
            | { enabled?: boolean }
            | undefined;
          if (auto?.enabled) {
            await mockAutopilotAdd(
              'scan-contact',
              {
                workspaceId,
                phone: from,
                contactId: saved.contactId,
                messageContent: message,
                messageId: saved.id,
              },
              {
                jobId: `scan-contact__${workspaceId}__${saved.contactId}__${saved.id}`,
                removeOnComplete: true,
              },
            );
          }
          return saved;
        }),
      syncRemoteContactProfile: jest
        .fn()
        .mockImplementation(async (ws: string, phone: string, name?: string | null) => {
          const nPhone = (phone || '').replace(/\D/g, '');
          if (!nPhone || !name) return false;
          try {
            return await providerRegistry.upsertContactProfile(ws, { phone: nPhone, name });
          } catch {
            return false;
          }
        }),
      optInContact: jest.fn().mockResolvedValue({ ok: true }),
      optOutContact: jest.fn().mockResolvedValue({ ok: true }),
      optInBulk: jest.fn().mockResolvedValue({ count: 0 }),
      optOutBulk: jest.fn().mockResolvedValue({ count: 0 }),
      getOptInStatus: jest.fn().mockResolvedValue({ optIn: null }),
    };

    // ═══ delegate: chatMessagesService ═══
    chatMessagesService = {
      getChatMessages: jest.fn().mockResolvedValue([
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
        {
          id: 'm-new',
          chatId: '5511999991111@c.us',
          body: 'Mensagem nova',
          timestamp: 1_742_467_900,
          fromMe: false,
          type: 'chat',
        },
      ]),
    };

    // ═══ delegate: chatBacklogService ═══
    chatBacklogService = {
      getBacklog: jest.fn().mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
        pendingConversations: 2,
        pendingMessages: 3,
      }),
      getOperationalBacklogReport: jest.fn().mockResolvedValue({
        workspaceId: 'ws-1',
        sourceOfTruth: 'whatsapp-api',
        connected: true,
        status: 'CONNECTED',
        summary: {
          remotePendingConversations: 2,
          remotePendingMessages: 3,
          localPendingConversations: 1,
          effectivePendingConversations: 2,
          remoteOnlyPendingConversations: 1,
          localOnlyPendingConversations: 0,
        },
        items: [
          {
            phone: '5511999991111',
            remoteUnreadCount: 2,
            localUnreadCount: 5,
            remotePending: true,
            localPending: true,
            pending: true,
          },
          {
            phone: '5511999992222',
            remoteUnreadCount: 1,
            localPending: false,
            remoteOnlyPending: true,
            pending: true,
          },
        ],
      }),
    };

    mockAutopilotAdd.mockResolvedValue(undefined);
    mockFlowAdd.mockResolvedValue(undefined);

    service = new WhatsappService(
      prisma as never,
      providerRegistry as never,
      catchupService as never,
      ciaRuntime as never,
      sessionService as never,
      messageDispatcher as never,
      reconciler as never,
      chatMessagesService as never,
      chatBacklogService as never,
    );
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
        expect.objectContaining({ phone: '5511999991111', source: 'waha+crm', name: 'Alice App' }),
        expect.objectContaining({ phone: '5511999993333', source: 'crm', name: 'Contato Só CRM' }),
      ]),
    );
    expect(created).toEqual(
      expect.objectContaining({ phone: '5511999994444', name: 'Novo Contato', registered: true }),
    );
    expect(providerRegistry.upsertContactProfile).toHaveBeenCalledWith('ws-1', {
      phone: '5511999994444',
      name: 'Novo Contato',
    });
    expect(chats.slice(0, 2)).toEqual([
      expect.objectContaining({ phone: '5511999991111', unreadCount: 2, pending: true }),
      expect.objectContaining({ phone: '5511999992222', unreadCount: 1, pending: true }),
    ]);
    expect(backlog).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'CONNECTED',
        pendingConversations: 2,
        pendingMessages: 3,
      }),
    );
    expect((messages as Array<{ id: string }>).map((m) => m.id)).toEqual([
      'm-old',
      'm-out',
      'm-new',
    ]);
  });

  it('builds a WAHA-first operational backlog report with remote/local drift visibility', async () => {
    const report = await service.getOperationalBacklogReport('ws-1', { limit: 10 });
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
    const r = await service.listCatalogContacts('ws-1', { days: 30, page: 1, limit: 10 });
    expect(r).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        days: 30,
        page: 1,
        limit: 10,
        total: 1,
        onlyCataloged: true,
      }),
    );
    expect(r.items).toEqual([
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
    const r = await service.listPurchaseProbabilityRanking('ws-1', { days: 30, limit: 10 });
    expect(r).toEqual(
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
    expect(r.items).toEqual([
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
      expect.objectContaining({ workspaceId: 'ws-1', days: 45, reason: 'manual_audit' }),
      expect.objectContaining({ jobId: expect.stringContaining('catalog-contacts-30d__ws-1') }),
    );
    expect(mockAutopilotAdd).toHaveBeenCalledWith(
      'score-contact',
      expect.objectContaining({ workspaceId: 'ws-1', reason: 'manual_rescore' }),
      expect.objectContaining({ jobId: expect.stringContaining('score-contact__ws-1__') }),
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
      expect.objectContaining({ jobId: expect.stringContaining('score-contact__ws-1__contact-1') }),
    );
  });

  it('sends presence updates and triggers explicit sync to keep the agent loop alive', async () => {
    const typing = await service.setPresence('ws-1', '5511999991111', 'typing');
    const seen = await service.setPresence('ws-1', '5511999991111', 'seen');
    const paused = await service.setPresence('ws-1', '5511999991111', 'paused');
    const sync = await service.triggerSync('ws-1', 'proof_run');
    expect(typing).toEqual({ ok: true, chatId: '5511999991111@c.us', presence: 'typing' });
    expect(seen.presence).toBe('seen');
    expect(paused.presence).toBe('paused');
    expect(providerRegistry.sendTyping).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(providerRegistry.readChatMessages).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(providerRegistry.stopTyping).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(sync).toEqual({ scheduled: true, reason: 'proof_run' });
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith('ws-1', 'proof_run');
  });

  it('ignores malformed persisted read candidates instead of stringifying objects', async () => {
    providerRegistry.readChatMessages.mockClear();
    prisma.contact.findUnique.mockResolvedValueOnce({
      customFields: {
        lastRemoteChatId: { serialized: 'bad' },
        lastCatalogChatId: ['bad'],
        lastResolvedChatId: { serialized: 'still-bad' },
      },
    });
    const result = await service.setPresence('ws-1', '5511999991111', 'seen');
    expect(result).toEqual({ ok: true, chatId: '5511999991111@c.us', presence: 'seen' });
    expect(providerRegistry.readChatMessages).toHaveBeenCalledTimes(2);
    expect(providerRegistry.readChatMessages).not.toHaveBeenCalledWith('ws-1', '[object Object]');
  });

  it('falls back to direct WAHA send when the worker is unavailable', async () => {
    workerRuntime.isAvailable.mockResolvedValue(false);
    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem sem worker');
    expect(result).toEqual(expect.objectContaining({ ok: true, direct: true, delivery: 'sent' }));
    expect(providerRegistry.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111',
      'Mensagem sem worker',
      expect.objectContaining({ mediaUrl: undefined }),
    );
    expect(mockFlowAdd).not.toHaveBeenCalledWith('send-message', expect.anything());
  });

  it('allows reactive fallback sends even when opt-in and 24h compliance are enforced', async () => {
    const prevOptIn = process.env.ENFORCE_OPTIN;
    const prev24h = process.env.AUTOPILOT_ENFORCE_24H;
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
      const result = await service.sendMessage('ws-1', '5511999991111', 'Resposta reativa', {
        complianceMode: 'reactive',
      });
      expect(result).toEqual(expect.objectContaining({ ok: true, direct: true, delivery: 'sent' }));
    } finally {
      if (prevOptIn === undefined) {
        delete process.env.ENFORCE_OPTIN;
      } else {
        process.env.ENFORCE_OPTIN = prevOptIn;
      }
      if (prev24h === undefined) {
        delete process.env.AUTOPILOT_ENFORCE_24H;
      } else {
        process.env.AUTOPILOT_ENFORCE_24H = prev24h;
      }
    }
  });

  it('keeps queue-based send path when the worker is healthy', async () => {
    workerRuntime.isAvailable.mockResolvedValue(true);
    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem com worker');
    expect(result).toEqual({ ok: true, queued: true, delivery: 'queued' });
    expect(mockFlowAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ workspaceId: 'ws-1', to: '5511999991111' }),
    );
    expect(providerRegistry.sendMessage).not.toHaveBeenCalled();
  });

  it('still allows outbound sends when local webhook diagnostics are missing but WAHA session is connected', async () => {
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
    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem bloqueada');
    expect(result).toEqual(expect.objectContaining({ ok: true, queued: true, delivery: 'queued' }));
    expect(mockFlowAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ workspaceId: 'ws-1', to: '5511999991111' }),
    );
  });
});
