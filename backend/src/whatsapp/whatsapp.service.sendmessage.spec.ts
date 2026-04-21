import { WhatsappService } from './whatsapp.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));

import { buildWhatsappServiceSetup, WhatsappServiceSetup } from './whatsapp.service.spec-setup';

describe('WhatsappService — sendMessage + presence', () => {
  let service: WhatsappService;
  let _mockAutopilotAdd: jest.Mock;
  let mockFlowAdd: jest.Mock;
  let _workspaceService: WhatsappServiceSetup['workspaceService'];
  let inboxService: WhatsappServiceSetup['inboxService'];
  let _planLimits: WhatsappServiceSetup['planLimits'];
  let _redis: WhatsappServiceSetup['redis'];
  let _neuroCrm: WhatsappServiceSetup['neuroCrm'];
  let prisma: WhatsappServiceSetup['prisma'];
  let providerRegistry: WhatsappServiceSetup['providerRegistry'];
  let whatsappApi: WhatsappServiceSetup['whatsappApi'];
  let catchupService: WhatsappServiceSetup['catchupService'];
  let _ciaRuntime: WhatsappServiceSetup['ciaRuntime'];
  let workerRuntime: WhatsappServiceSetup['workerRuntime'];

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-04-20T00:00:00.000Z'));
    const setup = buildWhatsappServiceSetup();
    service = setup.service;
    _mockAutopilotAdd = setup.mockAutopilotAdd;
    mockFlowAdd = setup.mockFlowAdd;
    _workspaceService = setup.workspaceService;
    inboxService = setup.inboxService;
    _planLimits = setup.planLimits;
    _redis = setup.redis;
    _neuroCrm = setup.neuroCrm;
    prisma = setup.prisma;
    providerRegistry = setup.providerRegistry;
    whatsappApi = setup.whatsappApi;
    catchupService = setup.catchupService;
    _ciaRuntime = setup.ciaRuntime;
    workerRuntime = setup.workerRuntime;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('sends presence updates and triggers explicit sync to keep the agent loop alive', async () => {
    const typing = await service.setPresence('ws-1', '5511999991111', 'typing');
    const seen = await service.setPresence('ws-1', '5511999991111', 'seen');
    const paused = await service.setPresence('ws-1', '5511999991111', 'paused');
    const sync = await service.triggerSync('ws-1', 'proof_run');

    expect(typing).toEqual({
      ok: true,
      chatId: '5511999991111@c.us',
      presence: 'typing',
    });
    expect(seen.presence).toBe('seen');
    expect(paused.presence).toBe('paused');
    expect(providerRegistry.sendTyping).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(providerRegistry.readChatMessages).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(providerRegistry.stopTyping).toHaveBeenCalledWith('ws-1', '5511999991111@c.us');
    expect(sync).toEqual({
      scheduled: true,
      reason: 'proof_run',
    });
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

    expect(result).toEqual({
      ok: true,
      chatId: '5511999991111@c.us',
      presence: 'seen',
    });
    expect(providerRegistry.readChatMessages).toHaveBeenCalledTimes(2);
    expect(providerRegistry.readChatMessages).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      '5511999991111@c.us',
    );
    expect(providerRegistry.readChatMessages).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      '5511999991111@s.whatsapp.net',
    );
    expect(providerRegistry.readChatMessages).not.toHaveBeenCalledWith('ws-1', '[object Object]');
  });

  it('falls back to direct WAHA send when the worker is unavailable', async () => {
    workerRuntime.isAvailable.mockResolvedValue(false);

    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem sem worker');

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        direct: true,
        delivery: 'sent',
      }),
    );
    expect(providerRegistry.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999991111',
      'Mensagem sem worker',
      expect.objectContaining({
        mediaUrl: undefined,
        mediaType: undefined,
        caption: undefined,
        quotedMessageId: undefined,
      }),
    );
    expect(mockFlowAdd).not.toHaveBeenCalledWith('send-message', expect.anything());
  });

  it('allows reactive fallback sends even when opt-in and 24h compliance are enforced', async () => {
    const previousOptIn = process.env.ENFORCE_OPTIN;
    const previous24h = process.env.AUTOPILOT_ENFORCE_24H;

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

      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          direct: true,
          delivery: 'sent',
        }),
      );
      expect(providerRegistry.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        '5511999991111',
        'Resposta reativa',
        expect.objectContaining({
          mediaUrl: undefined,
          mediaType: undefined,
          caption: undefined,
          quotedMessageId: undefined,
        }),
      );
    } finally {
      if (previousOptIn === undefined) {
        delete process.env.ENFORCE_OPTIN;
      } else {
        process.env.ENFORCE_OPTIN = previousOptIn;
      }

      if (previous24h === undefined) {
        delete process.env.AUTOPILOT_ENFORCE_24H;
      } else {
        process.env.AUTOPILOT_ENFORCE_24H = previous24h;
      }
    }
  });

  it('keeps queue-based send path when the worker is healthy', async () => {
    workerRuntime.isAvailable.mockResolvedValue(true);

    const result = await service.sendMessage('ws-1', '5511999991111', 'Mensagem com worker');

    expect(result).toEqual({
      ok: true,
      queued: true,
      delivery: 'queued',
    });
    expect(mockFlowAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999991111',
        message: 'Mensagem com worker',
      }),
    );
    expect(providerRegistry.sendMessage).not.toHaveBeenCalled();
    expect(inboxService.saveMessageByPhone).not.toHaveBeenCalled();
  });

  it('still allows outbound sends when the local webhook diagnostics are missing but the WAHA session is connected', async () => {
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

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        queued: true,
        delivery: 'queued',
      }),
    );
    expect(providerRegistry.sendMessage).not.toHaveBeenCalled();
    expect(mockFlowAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999991111',
        message: 'Mensagem bloqueada',
      }),
    );
  });
});
