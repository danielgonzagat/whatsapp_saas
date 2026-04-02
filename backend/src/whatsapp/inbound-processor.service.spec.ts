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
        update: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
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
          lastMessageAt: new Date(),
          messages: [
            {
              direction: 'INBOUND',
              createdAt: new Date(),
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      autopilotEvent: {
        create: jest.fn().mockResolvedValue({}),
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
      del: jest.fn().mockResolvedValue(1),
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
      buildQuotedReplyPlan: jest
        .fn()
        .mockImplementation(async ({ draftReply, customerMessages }: any) =>
          (customerMessages || []).map((message: any) => ({
            quotedMessageId: message.quotedMessageId,
            text: draftReply,
          })),
        ),
    };

    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({ ok: true, direct: true }),
      syncRemoteContactProfile: jest.fn().mockResolvedValue(true),
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
      senderName: 'Alice App',
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
      expect.any(String),
      expect.objectContaining({
        externalId: expect.stringContaining('inline:msg-1'),
        complianceMode: 'reactive',
        quotedMessageId: 'waha-msg-1',
      }),
    );
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { name: 'Alice App' },
        create: expect.objectContaining({
          name: 'Alice App',
        }),
      }),
    );
    expect(whatsappService.syncRemoteContactProfile).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999',
      'Alice App',
    );
    expect(mockAutopilotAdd).not.toHaveBeenCalled();
  });

  it('processes live webhook traffic inline before relying on the worker', async () => {
    workerRuntime.isAvailable.mockResolvedValue(true);

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-1',
      from: '5511888888888',
      senderName: 'Cliente Real',
      type: 'text',
      text: 'Cliente real pediu ajuda agora',
    });

    expect(workerRuntime.isAvailable).not.toHaveBeenCalled();
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511888888888',
        message: 'Cliente real pediu ajuda agora',
        context: expect.objectContaining({
          source: 'waha_inline_reactive',
          deliveryMode: 'reactive',
          forceDirect: true,
        }),
      }),
    );
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511888888888',
      expect.any(String),
      expect.objectContaining({
        complianceMode: 'reactive',
        forceDirect: true,
        quotedMessageId: 'waha-msg-live-1',
      }),
    );
    expect(mockAutopilotAdd).not.toHaveBeenCalled();
  });

  it('keeps catchup imports on the worker path when the worker is available', async () => {
    workerRuntime.isAvailable.mockResolvedValue(true);

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'catchup',
      providerMessageId: 'waha-msg-catchup-1',
      from: '5511777777777',
      type: 'text',
      text: 'Mensagem antiga importada do histórico',
    });

    expect(workerRuntime.isAvailable).toHaveBeenCalled();
    expect(mockAutopilotAdd).toHaveBeenCalled();
    expect(unifiedAgent.processIncomingMessage).not.toHaveBeenCalled();
  });

  it('falls back to inline processing for catchup imports when the worker is unavailable', async () => {
    workerRuntime.isAvailable.mockResolvedValue(false);

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'catchup',
      providerMessageId: 'waha-msg-catchup-inline-1',
      from: '5511555555555',
      type: 'text',
      text: 'Mensagem antiga que precisa de resposta automática',
    });

    expect(workerRuntime.isAvailable).toHaveBeenCalled();
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511555555555',
        message: 'Mensagem antiga que precisa de resposta automática',
        context: expect.objectContaining({
          source: 'waha_inline_fallback',
          deliveryMode: 'reactive',
          forceDirect: true,
        }),
      }),
    );
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511555555555',
      expect.any(String),
      expect.objectContaining({
        complianceMode: 'reactive',
        forceDirect: true,
        quotedMessageId: 'waha-msg-catchup-inline-1',
      }),
    );
    expect(mockAutopilotAdd).not.toHaveBeenCalled();
  });

  it('skips inline send when another pipeline already reserved the shared reply lock', async () => {
    redis.set
      .mockResolvedValueOnce('OK') // inbound dedupe cache
      .mockResolvedValueOnce('OK') // inline lock
      .mockResolvedValueOnce(null); // shared reply lock already taken

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-locked-1',
      from: '5511333333333',
      type: 'text',
      text: 'Quero atendimento agora',
    });

    expect(unifiedAgent.processIncomingMessage).not.toHaveBeenCalled();
    expect(whatsappService.sendMessage).not.toHaveBeenCalled();
  });

  it('bypasses the human lock for live traffic when autonomy mode is FULL', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        autopilot: { enabled: true },
        autonomy: { mode: 'FULL' },
      },
    });
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      mode: 'HUMAN',
      status: 'OPEN',
      assignedAgentId: 'agent-1',
      lastMessageAt: new Date(),
      messages: [
        {
          direction: 'INBOUND',
          createdAt: new Date(),
        },
      ],
    });

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-full-1',
      from: '5511666666666',
      type: 'text',
      text: 'Quero comprar agora',
    });

    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalled();
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511666666666',
      expect.any(String),
      expect.objectContaining({
        forceDirect: true,
        quotedMessageId: 'waha-msg-live-full-1',
      }),
    );
  });

  it('automatically reclaims stale human locks when a new inbound message is waiting for a reply', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-human-reclaim-1',
      mode: 'HUMAN',
      status: 'OPEN',
      assignedAgentId: 'agent-1',
      lastMessageAt: new Date(),
      messages: [
        {
          direction: 'INBOUND',
          createdAt: new Date(),
        },
      ],
    });

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-reclaim-1',
      from: '5511444444444',
      type: 'text',
      text: 'Vocês conseguem me atender agora?',
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-human-reclaim-1' },
      data: { mode: 'AI', assignedAgentId: null },
    });
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalled();
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511444444444',
      expect.any(String),
      expect.objectContaining({
        forceDirect: true,
        quotedMessageId: 'waha-msg-live-reclaim-1',
      }),
    );
  });

  it('keeps live WhatsApp inbound active when the WAHA session is connected but autonomy mode is not persisted yet', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        autopilot: { enabled: false },
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: { status: 'connected', sessionName: 'ws-1' },
        connectionStatus: 'connected',
        ciaRuntime: { state: 'LIVE_READY' },
      },
    });
    workerRuntime.isAvailable.mockResolvedValue(true);

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-connected-1',
      from: '5511555555555',
      type: 'text',
      text: 'Mensagem nova de cliente real',
    });

    expect(workerRuntime.isAvailable).not.toHaveBeenCalled();
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phone: '5511555555555',
        context: expect.objectContaining({
          source: 'waha_inline_reactive',
          forceDirect: true,
        }),
      }),
    );
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511555555555',
      expect.any(String),
      expect.objectContaining({
        forceDirect: true,
        quotedMessageId: 'waha-msg-live-connected-1',
      }),
    );
  });

  it('falls back to a deterministic inline reply when the agent returns no text and no outbound action', async () => {
    unifiedAgent.processIncomingMessage.mockResolvedValue({
      actions: [],
      reply: '',
      response: '',
      intent: 'UNKNOWN',
      confidence: 0.1,
    });

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-fallback-1',
      from: '5511333333333',
      type: 'text',
      text: 'Gostaria de saber o preço',
    });

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511333333333',
      expect.any(String),
      expect.objectContaining({
        forceDirect: true,
        quotedMessageId: 'waha-msg-live-fallback-1',
      }),
    );
  });

  it('falls back to a deterministic inline reply when the unified agent throws', async () => {
    unifiedAgent.processIncomingMessage.mockRejectedValue(
      new Error('openai timeout'),
    );

    await service.process({
      workspaceId: 'ws-1',
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId: 'waha-msg-live-fallback-2',
      from: '5511222222222',
      type: 'text',
      text: 'Olá',
    });

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511222222222',
      expect.any(String),
      expect.objectContaining({
        forceDirect: true,
        quotedMessageId: 'waha-msg-live-fallback-2',
      }),
    );
  });
});
