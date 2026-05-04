export const localContactsSeed = [
  {
    id: 'contact-1',
    workspaceId: 'ws-1',
    phone: '5511999991111',
    name: 'Alice CRM',
    email: 'alice@crm.test',
    leadScore: 92,
    sentiment: 'POSITIVE',
    purchaseProbability: 'HIGH',
    nextBestAction: 'Enviar proposta',
    aiSummary: 'Lead quente, pediu preço e prazo.',
    customFields: {
      purchaseProbabilityScore: 0.92,
      probabilityReasons: ['pediu preço', 'retornou rápido'],
      catalogedAt: '2026-03-21T12:00:00.000Z',
      lastScoredAt: '2026-03-21T12:05:00.000Z',
      whatsappSavedAt: '2026-03-21T12:01:00.000Z',
      intent: 'BUY',
    },
    createdAt: new Date('2026-03-20T08:00:00.000Z'),
    updatedAt: new Date('2026-03-20T09:00:00.000Z'),
  },
  {
    id: 'contact-2',
    workspaceId: 'ws-1',
    phone: '5511999993333',
    name: 'Contato Só CRM',
    email: null,
    leadScore: 31,
    sentiment: 'NEUTRAL',
    purchaseProbability: 'MEDIUM',
    nextBestAction: 'Fazer follow-up leve',
    aiSummary: 'Contato morno, já recebeu resposta.',
    customFields: {
      purchaseProbabilityScore: 0.31,
      probabilityReasons: ['interação curta'],
      catalogedAt: '2026-03-19T11:00:00.000Z',
      lastScoredAt: '2026-03-19T11:10:00.000Z',
      whatsappSavedAt: '2026-03-19T11:01:00.000Z',
      intent: 'INFO',
      buyerStatus: 'BOUGHT',
      purchasedProduct: 'Mentoria Premium',
      purchaseValue: 2497,
      purchaseReason: 'deal_won_recorded',
    },
    createdAt: new Date('2026-03-20T07:00:00.000Z'),
    updatedAt: new Date('2026-03-20T07:30:00.000Z'),
  },
];

export const localConversationsSeed = [
  {
    id: 'conv-1',
    contactId: 'contact-1',
    unreadCount: 5,
    status: 'OPEN',
    mode: 'AI',
    assignedAgentId: null,
    lastMessageAt: new Date('2026-03-20T10:30:00.000Z'),
    messages: [
      { id: 'conv-1-msg-1', direction: 'INBOUND', createdAt: new Date('2026-03-20T10:30:00.000Z') },
    ],
    contact: { id: 'contact-1', phone: '5511999991111', name: 'Alice CRM' },
  },
  {
    id: 'conv-2',
    contactId: 'contact-2',
    unreadCount: 0,
    status: 'OPEN',
    mode: 'AI',
    assignedAgentId: null,
    lastMessageAt: new Date('2026-03-20T10:00:00.000Z'),
    messages: [
      {
        id: 'conv-2-msg-1',
        direction: 'OUTBOUND',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
      },
    ],
    contact: { id: 'contact-2', phone: '5511999993333', name: 'Contato Só CRM' },
  },
];

export const localMessagesSeed = [
  {
    id: 'db-msg-1',
    workspaceId: 'ws-1',
    contactId: 'contact-1',
    conversationId: 'conv-1',
    direction: 'INBOUND',
    content: 'Mensagem do banco',
    type: 'TEXT',
    mediaUrl: null,
    createdAt: new Date('2026-03-20T06:00:00.000Z'),
  },
];

export function buildMockProviderRegistry() {
  return {
    getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
    disconnect: jest.fn().mockResolvedValue({ success: true }),
    startSession: jest.fn().mockResolvedValue({ success: true }),
    sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'provider-msg-1' }),
    getProviderType: jest.fn().mockResolvedValue('whatsapp-api'),
    getContacts: jest.fn().mockResolvedValue([
      { id: '5511999991111@c.us', name: 'Alice WA', pushName: 'Alice App' },
      { id: '5511999992222@c.us', pushName: 'Bob App' },
    ]),
    getChats: jest.fn().mockResolvedValue([
      { id: '5511999991111@c.us', unreadCount: 2, timestamp: 1_742_467_800 },
      { id: '5511999992222@c.us', unread: 1, lastMessageTimestamp: 1_742_464_200 },
      { id: '5511999993333@c.us', unreadCount: 0, timestamp: 1_742_460_000 },
    ]),
    getChatMessages: jest.fn().mockResolvedValue([
      {
        id: 'm-new',
        chatId: '5511999991111@c.us',
        body: 'Mensagem nova',
        timestamp: 1_742_467_900,
        fromMe: false,
        type: 'chat',
      },
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
    ]),
    sendTyping: jest.fn().mockResolvedValue(undefined),
    stopTyping: jest.fn().mockResolvedValue(undefined),
    sendSeen: jest.fn().mockResolvedValue(undefined),
    readChatMessages: jest.fn().mockResolvedValue(undefined),
    setPresence: jest.fn().mockResolvedValue(undefined),
    isRegisteredUser: jest.fn().mockResolvedValue(true),
    isRegistered: jest.fn().mockResolvedValue(true),
    upsertContactProfile: jest.fn().mockResolvedValue(true),
    extractPhoneFromChatId: jest.fn((chatId: string) => String(chatId || '').split('@')[0]),
    getQrCode: jest.fn().mockResolvedValue({ success: true, qr: 'qr-code' }),
    getSessionDiagnostics: jest.fn().mockResolvedValue({}),
    deleteSession: jest.fn().mockResolvedValue(true),
  };
}

export function buildMockPrisma(localContactsSeed: any[]) {
  const createdContacts: any[] = [];
  const allContacts = () => [...localContactsSeed, ...createdContacts];
  const mockObj: any = {
    contact: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            allContacts().filter((c) => !where?.workspaceId || c.workspaceId === where.workspaceId),
          ),
        ),
      upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
        const existing = allContacts().find(
          (c) =>
            c.workspaceId === where.workspaceId_phone.workspaceId &&
            c.phone === where.workspaceId_phone.phone,
        );
        if (existing)
          return Promise.resolve({
            ...existing,
            name: update?.name ?? existing.name,
            email: update?.email ?? existing.email,
            updatedAt: new Date('2026-03-20T12:00:00.000Z'),
          });
        const next = {
          id: `contact-${createdContacts.length + 10}`,
          workspaceId: create.workspaceId,
          phone: create.phone,
          name: create.name,
          email: create.email || null,
          createdAt: new Date('2026-03-20T12:00:00.000Z'),
          updatedAt: new Date('2026-03-20T12:00:00.000Z'),
        };
        createdContacts.push(next);
        return Promise.resolve(next);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        const found = allContacts().find(
          (c) =>
            c.workspaceId === where.workspaceId_phone.workspaceId &&
            c.phone === where.workspaceId_phone.phone,
        );
        return Promise.resolve(found ? { id: found.id } : null);
      }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    conversation: { findMany: jest.fn().mockResolvedValue(localConversationsSeed) },
    message: {
      findMany: jest.fn().mockResolvedValue(localMessagesSeed),
      findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-03-20T11:00:00.000Z') }),
      create: jest.fn().mockResolvedValue({ id: 'outbound-msg-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    autopilotEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    tag: {
      upsert: jest.fn().mockResolvedValue({ id: 'tag-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  mockObj.$transaction = jest.fn((callback: any) => callback(mockObj));
  return mockObj;
}
