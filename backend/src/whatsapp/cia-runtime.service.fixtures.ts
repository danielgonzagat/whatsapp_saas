export type PrismaMock = {
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  conversation: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  contact: { findUnique: jest.Mock; findFirst: jest.Mock };
  message: { findFirst: jest.Mock; findMany: jest.Mock };
  kloelMemory: { findUnique: jest.Mock; findMany: jest.Mock };
  systemInsight: { findMany: jest.Mock };
};

export type ProviderRegistryMock = {
  getSessionStatus: jest.Mock;
  getChats: jest.Mock;
  getChatMessages: jest.Mock;
};

export type CatchupServiceMock = {
  triggerCatchup: jest.Mock;
  runCatchupNow: jest.Mock;
};

export type AgentEventsMock = { publish: jest.Mock };
export type WorkerRuntimeMock = { isAvailable: jest.Mock };

export type RedisMock = {
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  decr: jest.Mock;
};

export type WhatsappServiceMock = { sendMessage: jest.Mock };
export type UnifiedAgentMock = { processIncomingMessage: jest.Mock };

export function makePrismaMock(): PrismaMock {
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        providerSettings: {
          autopilot: { enabled: false },
          autonomy: { autoBootstrapOnConnected: true },
          ciaRuntime: {},
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'conv-1',
          unreadCount: 5,
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          lastMessageAt: new Date(),
          contactId: 'contact-1',
          contact: { id: 'contact-1', name: 'Alice', phone: '5511999991111' },
          messages: [
            {
              id: 'conv-1-msg-1',
              direction: 'INBOUND',
              createdAt: new Date(),
              content: 'Quero saber o preço',
            },
          ],
        },
        {
          id: 'conv-2',
          unreadCount: 2,
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          lastMessageAt: new Date(Date.now() - 1_000),
          contactId: 'contact-2',
          contact: { id: 'contact-2', name: 'Bruno', phone: '5511888888888' },
          messages: [
            {
              id: 'conv-2-msg-1',
              direction: 'INBOUND',
              createdAt: new Date(Date.now() - 1_000),
              content: 'Tem composição?',
            },
          ],
        },
      ]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    contact: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string } }) => {
        if (where?.id === 'contact-1') return { id: 'contact-1', phone: '5511999991111' };
        if (where?.id === 'contact-2') return { id: 'contact-2', phone: '5511888888888' };
        return null;
      }),
      findFirst: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { phone?: string; contact?: { phone?: string } } }) => {
            const phone = where?.phone || where?.contact?.phone;
            if (phone === '5511999991111') return { id: 'contact-1', phone: '5511999991111' };
            if (phone === '5511888888888') return { id: 'contact-2', phone: '5511888888888' };
            return null;
          },
        ),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockImplementation(({ where }: { where: { contactId?: string } }) => {
        if (where?.contactId === 'contact-1') {
          return [
            {
              content: 'Quero saber o preço',
              externalId: 'quoted-contact-1',
              createdAt: new Date().toISOString(),
            },
          ];
        }
        if (where?.contactId === 'contact-2') {
          return [
            {
              content: 'Tem composição?',
              externalId: 'quoted-contact-2',
              createdAt: new Date(Date.now() - 1_000).toISOString(),
            },
          ];
        }
        return [];
      }),
    },
    kloelMemory: {
      findUnique: jest.fn().mockResolvedValue({ value: { openBacklog: 12, hotLeadCount: 3 } }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ value: { normalizedKey: 'price_resistance', frequency: 5 } }]),
    },
    systemInsight: {
      findMany: jest.fn().mockResolvedValue([{ id: 'insight-1', type: 'CIA_MARKET_SIGNAL' }]),
    },
  };
}

export function makeProviderRegistryMock(): ProviderRegistryMock {
  return {
    getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'WORKING' }),
    getChats: jest.fn().mockResolvedValue([
      { id: 'chat-1', unreadCount: 5, timestamp: Date.now() },
      { id: 'chat-2', unreadCount: 2, timestamp: Date.now() - 1000 },
      { id: 'chat-3', unreadCount: 0, timestamp: Date.now() - 2000 },
    ]),
    getChatMessages: jest.fn().mockResolvedValue([]),
  };
}

export function makeCatchupServiceMock(): CatchupServiceMock {
  return {
    triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true, reason: 'cia_bootstrap' }),
    runCatchupNow: jest.fn().mockResolvedValue({
      scheduled: true,
      importedMessages: 0,
      touchedChats: 0,
      processedChats: 0,
      overflow: false,
    }),
  };
}

export function makeAgentEventsMock(): AgentEventsMock {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

export function makeWorkerRuntimeMock(): WorkerRuntimeMock {
  return { isAvailable: jest.fn().mockResolvedValue(true) };
}

export function makeRedisMock(): RedisMock {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
  };
}

export function makeWhatsappServiceMock(): WhatsappServiceMock {
  return {
    sendMessage: jest.fn().mockResolvedValue({ ok: true, delivery: 'sent', direct: true }),
  };
}

export function makeUnifiedAgentMock(): UnifiedAgentMock {
  return {
    processIncomingMessage: jest.fn().mockResolvedValue({
      reply: 'Resposta automática',
      response: 'Resposta automática',
      actions: [],
      intent: 'QUALIFY',
      confidence: 0.9,
    }),
  };
}
