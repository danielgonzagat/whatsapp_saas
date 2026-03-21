import { InboundProcessorService } from './inbound-processor.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
  voiceQueue: { add: jest.fn() },
}));

describe('InboundProcessorService', () => {
  let service: InboundProcessorService;
  let prisma: any;
  let inbox: any;
  let redis: any;
  let accountAgent: any;
  let workerRuntime: any;
  let unifiedAgent: any;
  let whatsappService: any;
  let mockAutopilotAdd: jest.Mock;

  beforeEach(() => {
    const queueModule = jest.requireMock('../queue/queue');
    mockAutopilotAdd = queueModule.autopilotQueue.add;

    prisma = {
      contact: {
        upsert: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {
            autopilot: { enabled: true },
            autonomy: { mode: 'LIVE' },
          },
        }),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conv-1',
          mode: 'AI',
          status: 'OPEN',
          assignedAgentId: null,
        }),
      },
    };

    inbox = {
      saveMessageByPhone: jest.fn().mockResolvedValue({
        id: 'msg-1',
        contactId: 'contact-1',
        conversationId: 'conv-1',
      }),
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      rpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    accountAgent = {
      detectCatalogGap: jest.fn().mockResolvedValue({
        created: false,
        approval: null,
      }),
    };

    workerRuntime = {
      isAvailable: jest.fn().mockResolvedValue(false),
    };

    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        actions: [],
        reply: 'Resposta inline do agente',
        intent: 'GREETING',
        confidence: 0.8,
      }),
    };

    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({ ok: true, direct: true }),
    };

    service = new InboundProcessorService(
      prisma,
      inbox,
      redis,
      accountAgent,
      workerRuntime,
      unifiedAgent,
      whatsappService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses inline agent fallback when autonomy is enabled and worker is unavailable', async () => {
    const result = await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      providerMessageId: 'waha-msg-1',
      from: '5511999999999',
      type: 'text',
      text: 'Oi, quero saber do produto',
    });

    expect(result).toEqual(
      expect.objectContaining({
        deduped: false,
        messageId: 'msg-1',
        contactId: 'contact-1',
      }),
    );
    expect(workerRuntime.isAvailable).toHaveBeenCalled();
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        message: 'Oi, quero saber do produto',
      }),
    );
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999',
      'Resposta inline do agente',
      expect.objectContaining({
        externalId: 'inline:msg-1',
        complianceMode: 'reactive',
      }),
    );
    expect(mockAutopilotAdd).not.toHaveBeenCalled();
  });
});
