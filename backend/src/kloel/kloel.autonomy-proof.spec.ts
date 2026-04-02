jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  callOpenAIWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { chatCompletionWithFallback } from './openai-wrapper';

type TraceEntry = {
  cycle: number;
  type:
    | 'connect'
    | 'status'
    | 'sync'
    | 'backlog'
    | 'list_contacts'
    | 'list_chats'
    | 'read_messages'
    | 'create_contact'
    | 'presence'
    | 'send_message'
    | 'inbound';
  phone?: string;
  chatId?: string;
  presence?: 'typing' | 'paused' | 'seen';
  count?: number;
  pendingMessages?: number;
  pendingConversations?: number;
  connected?: boolean;
  message?: string;
};

describe('KloelService bounded autonomy proof', () => {
  let service: KloelService;
  let prisma: any;
  let whatsappService: any;
  let providerRegistry: any;
  let unifiedAgentService: any;

  const workspaceId = 'ws-proof';
  const alicePhone = '5511999991111';
  const carlosPhone = '5511999992222';
  const danielaPhone = '5511999993333';
  const aliceChatId = `${alicePhone}@c.us`;
  const carlosChatId = `${carlosPhone}@c.us`;
  const danielaChatId = `${danielaPhone}@c.us`;

  let activeCycle = 0;
  let clock = Date.parse('2026-03-20T12:00:00.000Z');
  let dbMessageSeq = 0;
  let waMessageSeq = 0;
  const trace: TraceEntry[] = [];
  const historyStore: Array<{
    role: string;
    content: string;
    createdAt: Date;
  }> = [];
  const dbContacts = new Map<string, any>();
  const dbMessages = new Map<string, any>();
  const worldChats = new Map<string, any>();
  const worldMessages = new Map<string, any[]>();
  const expectedToolAlphabet = [
    'connect_whatsapp',
    'get_whatsapp_status',
    'sync_whatsapp_history',
    'get_whatsapp_backlog',
    'list_whatsapp_contacts',
    'list_whatsapp_chats',
    'get_whatsapp_messages',
    'create_whatsapp_contact',
    'set_whatsapp_presence',
    'send_whatsapp_message',
  ];

  const nextTimestamp = () => {
    clock += 1000;
    return clock;
  };

  const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

  const normalizeChatId = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw;
    return `${normalizePhone(raw)}@c.us`;
  };

  const phoneFromChatId = (value: string) =>
    normalizePhone(String(value || '').split('@')[0] || '');

  const record = (entry: Omit<TraceEntry, 'cycle'>) => {
    trace.push({ cycle: activeCycle, ...entry });
  };

  const currentBacklog = () => {
    if (!world.connected) {
      return {
        connected: false,
        status: 'SCAN_QR_CODE',
        pendingConversations: 0,
        pendingMessages: 0,
        chats: [],
      };
    }

    const chats = Array.from(worldChats.values())
      .map((chat) => ({
        ...chat,
        pending: Number(chat.unreadCount || 0) > 0,
      }))
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    const pendingChats = chats.filter((chat) => Number(chat.unreadCount || 0) > 0);

    return {
      connected: true,
      status: 'WORKING',
      pendingConversations: pendingChats.length,
      pendingMessages: pendingChats.reduce(
        (sum, chat) => sum + (Number(chat.unreadCount || 0) || 0),
        0,
      ),
      chats: pendingChats,
    };
  };

  const world = {
    connected: false,
    qrCode: 'qr-proof-2026',
  };

  const upsertChat = (phone: string, name: string, unreadCount: number, timestamp: number) => {
    worldChats.set(phone, {
      id: `${phone}@c.us`,
      phone,
      name,
      unreadCount,
      timestamp,
      lastMessageAt: new Date(timestamp).toISOString(),
    });
  };

  const pushInbound = (phone: string, name: string, body: string) => {
    const timestamp = nextTimestamp();
    const chatId = `${phone}@c.us`;
    const existing = worldChats.get(phone);
    const unreadCount = (existing?.unreadCount || 0) + 1;
    upsertChat(phone, name, unreadCount, timestamp);

    const chatMessages = worldMessages.get(chatId) || [];
    chatMessages.push({
      id: `wa-in-${++waMessageSeq}`,
      chatId,
      phone,
      body,
      direction: 'INBOUND',
      fromMe: false,
      type: 'text',
      hasMedia: false,
      mediaUrl: null,
      timestamp,
      isoTimestamp: new Date(timestamp).toISOString(),
      source: 'waha',
    });
    worldMessages.set(chatId, chatMessages);

    record({
      type: 'inbound',
      phone,
      chatId,
      message: body,
      pendingMessages: currentBacklog().pendingMessages,
      pendingConversations: currentBacklog().pendingConversations,
    });
  };

  const pushOutbound = (phone: string, body: string) => {
    const timestamp = nextTimestamp();
    const chatId = `${phone}@c.us`;
    const chat = worldChats.get(phone) || {
      id: chatId,
      phone,
      name: dbContacts.get(phone)?.name || phone,
      unreadCount: 0,
      timestamp,
      lastMessageAt: new Date(timestamp).toISOString(),
    };
    chat.unreadCount = 0;
    chat.timestamp = timestamp;
    chat.lastMessageAt = new Date(timestamp).toISOString();
    worldChats.set(phone, chat);

    const chatMessages = worldMessages.get(chatId) || [];
    chatMessages.push({
      id: `wa-out-${++waMessageSeq}`,
      chatId,
      phone,
      body,
      direction: 'OUTBOUND',
      fromMe: true,
      type: 'text',
      hasMedia: false,
      mediaUrl: null,
      timestamp,
      isoTimestamp: new Date(timestamp).toISOString(),
      source: 'waha',
    });
    worldMessages.set(chatId, chatMessages);
  };

  const toolCall = (name: string, args: Record<string, any> = {}) => ({
    id: `${name}-${Math.random().toString(36).slice(2, 10)}`,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  });

  const queueCycle = (
    tools: Array<{ name: string; args?: Record<string, any> }>,
    finalContent: string,
  ) => {
    (chatCompletionWithFallback as jest.Mock)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
              tool_calls: tools.map((tool) => toolCall(tool.name, tool.args || {})),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: finalContent,
            },
          },
        ],
      });
  };

  const parseEvents = (writes: string[]) =>
    writes
      .join('')
      .split('\n\n')
      .filter(Boolean)
      .map((block) => JSON.parse(block.replace(/^data: /, '')));

  const runCycle = async (cycle: number, message: string) => {
    activeCycle = cycle;
    const before = currentBacklog();
    const writes: string[] = [];
    const response = {
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
      end: jest.fn(),
    };

    await service.think(
      {
        workspaceId,
        message,
        mode: 'chat',
      },
      response as any,
    );

    const after = currentBacklog();
    return {
      before,
      after,
      events: parseEvents(writes),
    };
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    trace.length = 0;
    historyStore.length = 0;
    dbContacts.clear();
    dbMessages.clear();
    worldChats.clear();
    worldMessages.clear();
    activeCycle = 0;
    clock = Date.parse('2026-03-20T12:00:00.000Z');
    dbMessageSeq = 0;
    waMessageSeq = 0;
    world.connected = false;

    dbContacts.set(alicePhone, {
      id: 'contact-alice',
      workspaceId,
      phone: alicePhone,
      name: 'Alice',
      email: 'alice@test.local',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:05:00.000Z'),
    });

    const aliceT1 = nextTimestamp();
    const aliceT2 = nextTimestamp();
    const carlosT1 = nextTimestamp();

    upsertChat(alicePhone, 'Alice', 2, aliceT2);
    upsertChat(carlosPhone, 'Carlos', 1, carlosT1);

    worldMessages.set(aliceChatId, [
      {
        id: `wa-in-${++waMessageSeq}`,
        chatId: aliceChatId,
        phone: alicePhone,
        body: 'Oi, quero saber o preço do plano.',
        direction: 'INBOUND',
        fromMe: false,
        type: 'text',
        hasMedia: false,
        mediaUrl: null,
        timestamp: aliceT1,
        isoTimestamp: new Date(aliceT1).toISOString(),
        source: 'waha',
      },
      {
        id: `wa-in-${++waMessageSeq}`,
        chatId: aliceChatId,
        phone: alicePhone,
        body: 'Vocês conseguem me responder hoje?',
        direction: 'INBOUND',
        fromMe: false,
        type: 'text',
        hasMedia: false,
        mediaUrl: null,
        timestamp: aliceT2,
        isoTimestamp: new Date(aliceT2).toISOString(),
        source: 'waha',
      },
    ]);

    worldMessages.set(carlosChatId, [
      {
        id: `wa-in-${++waMessageSeq}`,
        chatId: carlosChatId,
        phone: carlosPhone,
        body: 'Bom dia, preciso de atendimento.',
        direction: 'INBOUND',
        fromMe: false,
        type: 'text',
        hasMedia: false,
        mediaUrl: null,
        timestamp: carlosT1,
        isoTimestamp: new Date(carlosT1).toISOString(),
        source: 'waha',
      },
    ]);

    prisma = {
      kloelMessage: {
        findMany: jest.fn().mockImplementation(() =>
          Promise.resolve(
            historyStore.map((entry, index) => ({
              id: `history-${index + 1}`,
              ...entry,
            })),
          ),
        ),
        create: jest.fn().mockImplementation(({ data }: any) => {
          historyStore.push({
            role: data.role,
            content: data.content,
            createdAt: new Date(nextTimestamp()),
          });
          return Promise.resolve({ id: `history-${historyStore.length}` });
        }),
      },
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(undefined),
        update: jest.fn(),
      },
      flow: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      contact: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const phone = normalizePhone(where?.phone?.contains || '');
          return Promise.resolve(
            Array.from(dbContacts.values()).find((contact) => contact.phone === phone) || null,
          );
        }),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const phone = normalizePhone(data.phone || '');
          const created = {
            id: `contact-${phone}`,
            workspaceId: data.workspaceId,
            phone,
            name: data.name || phone,
            email: data.email || null,
            createdAt: new Date(nextTimestamp()),
            updatedAt: new Date(nextTimestamp()),
          };
          dbContacts.set(phone, created);
          return Promise.resolve(created);
        }),
      },
      message: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const created = {
            id: `db-msg-${++dbMessageSeq}`,
            ...data,
          };
          dbMessages.set(created.id, created);
          return Promise.resolve(created);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const found = dbMessages.get(where.id) || { id: where.id };
          const updated = { ...found, ...data };
          dbMessages.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
    };

    whatsappService = {
      listContacts: jest.fn().mockImplementation(async () => {
        const contacts = Array.from(dbContacts.values())
          .sort((a, b) => a.phone.localeCompare(b.phone))
          .map((contact) => ({
            id: `${contact.phone}@c.us`,
            phone: contact.phone,
            name: contact.name || contact.phone,
            email: contact.email || null,
            source: 'crm',
          }));

        record({
          type: 'list_contacts',
          count: contacts.length,
          pendingMessages: currentBacklog().pendingMessages,
          pendingConversations: currentBacklog().pendingConversations,
          connected: world.connected,
        });

        return contacts;
      }),
      createContact: jest.fn().mockImplementation(async (_workspaceId: string, input: any) => {
        const phone = normalizePhone(input.phone || '');
        const existing = dbContacts.get(phone);
        const contact = {
          id: `${phone}@c.us`,
          phone,
          name: input.name || existing?.name || phone,
          email: input.email || existing?.email || null,
          localContactId: existing?.id || `contact-${phone}`,
          source: 'crm',
          registered: true,
          createdAt: new Date(nextTimestamp()).toISOString(),
          updatedAt: new Date(nextTimestamp()).toISOString(),
        };

        dbContacts.set(phone, {
          id: contact.localContactId,
          workspaceId,
          phone,
          name: contact.name,
          email: contact.email,
          createdAt: new Date(contact.createdAt),
          updatedAt: new Date(contact.updatedAt),
        });

        record({
          type: 'create_contact',
          phone,
          chatId: `${phone}@c.us`,
          count: dbContacts.size,
        });

        return contact;
      }),
      listChats: jest.fn().mockImplementation(async () => {
        const chats = Array.from(worldChats.values())
          .map((chat) => ({
            ...chat,
            pending: Number(chat.unreadCount || 0) > 0,
          }))
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

        record({
          type: 'list_chats',
          count: chats.length,
          pendingMessages: currentBacklog().pendingMessages,
          pendingConversations: currentBacklog().pendingConversations,
          connected: world.connected,
        });

        return chats;
      }),
      getChatMessages: jest
        .fn()
        .mockImplementation(async (_workspaceId: string, chatId: string) => {
          const normalized = normalizeChatId(chatId);
          const messages = [...(worldMessages.get(normalized) || [])].sort(
            (a, b) => a.timestamp - b.timestamp,
          );

          record({
            type: 'read_messages',
            phone: phoneFromChatId(normalized),
            chatId: normalized,
            count: messages.length,
          });

          return messages;
        }),
      getBacklog: jest.fn().mockImplementation(async () => {
        const backlog = currentBacklog();
        record({
          type: 'backlog',
          pendingMessages: backlog.pendingMessages,
          pendingConversations: backlog.pendingConversations,
          connected: backlog.connected,
        });
        return backlog;
      }),
      setPresence: jest
        .fn()
        .mockImplementation(async (_workspaceId: string, chatId: string, presence: any) => {
          const normalized = normalizeChatId(chatId);
          record({
            type: 'presence',
            phone: phoneFromChatId(normalized),
            chatId: normalized,
            presence,
          });
          return { ok: true, chatId: normalized, presence };
        }),
      triggerSync: jest.fn().mockImplementation(async (_workspaceId: string, reason: string) => {
        record({
          type: 'sync',
          message: reason,
          connected: world.connected,
        });
        return {
          scheduled: true,
          reason,
        };
      }),
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      sendMessage: jest
        .fn()
        .mockImplementation(async (_workspaceId: string, phone: string, message: string) => {
          pushOutbound(phone, message);
          record({
            type: 'send_message',
            phone,
            chatId: `${phone}@c.us`,
            message,
            pendingMessages: currentBacklog().pendingMessages,
            pendingConversations: currentBacklog().pendingConversations,
          });
          return { ok: true };
        }),
    };

    providerRegistry = {
      getSessionStatus: jest.fn().mockImplementation(async () => {
        record({
          type: 'status',
          connected: world.connected,
          pendingMessages: currentBacklog().pendingMessages,
          pendingConversations: currentBacklog().pendingConversations,
        });
        return {
          connected: world.connected,
          status: world.connected ? 'WORKING' : 'SCAN_QR_CODE',
          qrCode: world.connected ? undefined : world.qrCode,
          phoneNumber: world.connected ? '5511988887777' : undefined,
        };
      }),
      startSession: jest.fn().mockImplementation(async () => {
        world.connected = true;
        record({
          type: 'connect',
          connected: true,
        });
        return {
          success: true,
          qrCode: world.qrCode,
        };
      }),
    };

    unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ error: 'Unknown tool' }),
    };

    service = new KloelService(
      prisma,
      { createSmartPayment: jest.fn() } as any,
      whatsappService,
      providerRegistry,
      unifiedAgentService,
      { textToSpeech: jest.fn(), transcribeAudio: jest.fn() } as any,
      { trackAiUsage: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('proves by execution trace that the agent connected, kept acting, answered the backlog, reacted to a new arrival and used the full WhatsApp action alphabet', async () => {
    queueCycle(
      [
        { name: 'connect_whatsapp' },
        { name: 'get_whatsapp_status' },
        { name: 'sync_whatsapp_history', args: { reason: 'boot_proof' } },
        { name: 'get_whatsapp_backlog' },
      ],
      'Sessão conectada, sincronização iniciada e backlog identificado.',
    );

    queueCycle(
      [
        { name: 'list_whatsapp_contacts', args: { limit: 10 } },
        { name: 'list_whatsapp_chats', args: { limit: 10 } },
        {
          name: 'get_whatsapp_messages',
          args: { chatId: aliceChatId, limit: 20 },
        },
        {
          name: 'set_whatsapp_presence',
          args: { chatId: aliceChatId, presence: 'typing' },
        },
        {
          name: 'send_whatsapp_message',
          args: {
            phone: alicePhone,
            message: 'Oi Alice, estou te respondendo agora com o valor e próximos passos.',
          },
        },
        {
          name: 'set_whatsapp_presence',
          args: { chatId: aliceChatId, presence: 'seen' },
        },
        {
          name: 'get_whatsapp_messages',
          args: { chatId: carlosChatId, limit: 20 },
        },
        {
          name: 'create_whatsapp_contact',
          args: { phone: carlosPhone, name: 'Carlos' },
        },
        {
          name: 'set_whatsapp_presence',
          args: { chatId: carlosChatId, presence: 'typing' },
        },
        {
          name: 'send_whatsapp_message',
          args: {
            phone: carlosPhone,
            message: 'Bom dia, Carlos. Recebi sua mensagem e já assumi seu atendimento.',
          },
        },
        {
          name: 'set_whatsapp_presence',
          args: { chatId: carlosChatId, presence: 'seen' },
        },
        { name: 'get_whatsapp_backlog' },
      ],
      'As conversas pendentes foram processadas e o backlog imediato foi zerado.',
    );

    queueCycle(
      [
        { name: 'get_whatsapp_backlog' },
        { name: 'list_whatsapp_contacts', args: { limit: 10 } },
        { name: 'list_whatsapp_chats', args: { limit: 10 } },
        {
          name: 'get_whatsapp_messages',
          args: { chatId: danielaChatId, limit: 20 },
        },
        {
          name: 'create_whatsapp_contact',
          args: { phone: danielaPhone, name: 'Daniela' },
        },
        { name: 'list_whatsapp_contacts', args: { limit: 10 } },
        {
          name: 'set_whatsapp_presence',
          args: { chatId: danielaChatId, presence: 'typing' },
        },
        {
          name: 'send_whatsapp_message',
          args: {
            phone: danielaPhone,
            message: 'Oi Daniela, acabei de receber sua mensagem e já estou no atendimento.',
          },
        },
        {
          name: 'set_whatsapp_presence',
          args: { chatId: danielaChatId, presence: 'seen' },
        },
        { name: 'get_whatsapp_backlog' },
      ],
      'Nova conversa capturada em tempo real, contato criado e backlog zerado de novo.',
    );

    const cycle1 = await runCycle(1, 'conecte, sincronize e me diga se o whatsapp está vivo');
    const cycle2 = await runCycle(2, 'responda todas as conversas pendentes agora');

    activeCycle = 3;
    pushInbound(
      danielaPhone,
      'Daniela',
      'Olá, acabei de chegar. Vocês conseguem falar comigo agora?',
    );

    const cycle3 = await runCycle(
      3,
      'apareceu uma nova conversa, trate imediatamente e prove que você não parou',
    );

    const allEvents = [...cycle1.events, ...cycle2.events, ...cycle3.events];
    const observedToolAlphabet = Array.from(
      new Set(allEvents.filter((event) => event.type === 'tool_call').map((event) => event.tool)),
    ).sort();

    const cycleProof = [cycle1, cycle2, cycle3].map((cycle, index) => ({
      cycle: index + 1,
      pendingBefore: cycle.before.pendingMessages,
      pendingAfter: cycle.after.pendingMessages,
      outboundActions: trace.filter(
        (entry) => entry.type === 'send_message' && entry.cycle === index + 1,
      ).length,
    }));

    expect(cycle1.before.pendingMessages).toBe(0);
    expect(cycle1.after.pendingMessages).toBe(3);
    expect(cycle2.before.pendingMessages).toBe(3);
    expect(cycle2.after.pendingMessages).toBe(0);
    expect(cycle3.before.pendingMessages).toBe(1);
    expect(cycle3.after.pendingMessages).toBe(0);

    expect(cycleProof.filter((item) => item.pendingBefore > 0)).toEqual([
      { cycle: 2, pendingBefore: 3, pendingAfter: 0, outboundActions: 2 },
      { cycle: 3, pendingBefore: 1, pendingAfter: 0, outboundActions: 1 },
    ]);

    expect(observedToolAlphabet).toEqual(expectedToolAlphabet.sort());

    const sendEntries = trace.filter((entry) => entry.type === 'send_message');
    expect(sendEntries.map((entry) => entry.phone)).toEqual([
      alicePhone,
      carlosPhone,
      danielaPhone,
    ]);

    for (const sendEntry of sendEntries) {
      const sendIndex = trace.findIndex(
        (entry) =>
          entry.type === 'send_message' &&
          entry.phone === sendEntry.phone &&
          entry.cycle === sendEntry.cycle,
      );
      const priorSameCycle = trace
        .slice(0, sendIndex)
        .filter((entry) => entry.cycle === sendEntry.cycle);
      const laterSameCycle = trace
        .slice(sendIndex + 1)
        .filter((entry) => entry.cycle === sendEntry.cycle);

      expect(
        priorSameCycle.some(
          (entry) => entry.type === 'read_messages' && entry.chatId === sendEntry.chatId,
        ),
      ).toBe(true);
      expect(
        priorSameCycle.some(
          (entry) =>
            entry.type === 'presence' &&
            entry.chatId === sendEntry.chatId &&
            entry.presence === 'typing',
        ),
      ).toBe(true);
      expect(
        laterSameCycle.some(
          (entry) =>
            entry.type === 'presence' &&
            entry.chatId === sendEntry.chatId &&
            entry.presence === 'seen',
        ),
      ).toBe(true);
    }

    const carlosCreateIndex = trace.findIndex(
      (entry) => entry.type === 'create_contact' && entry.phone === carlosPhone,
    );
    const carlosSendIndex = trace.findIndex(
      (entry) => entry.type === 'send_message' && entry.phone === carlosPhone,
    );
    const danielaCreateIndex = trace.findIndex(
      (entry) => entry.type === 'create_contact' && entry.phone === danielaPhone,
    );
    const danielaSendIndex = trace.findIndex(
      (entry) => entry.type === 'send_message' && entry.phone === danielaPhone,
    );

    expect(carlosCreateIndex).toBeGreaterThan(-1);
    expect(danielaCreateIndex).toBeGreaterThan(-1);
    expect(carlosCreateIndex).toBeLessThan(carlosSendIndex);
    expect(danielaCreateIndex).toBeLessThan(danielaSendIndex);

    expect(
      trace.filter((entry) => entry.type === 'list_contacts' && entry.cycle === 2)[0]?.count,
    ).toBe(1);
    expect(
      trace.filter((entry) => entry.type === 'list_contacts' && entry.cycle === 3)[0]?.count,
    ).toBe(2);
    expect(
      trace.filter((entry) => entry.type === 'list_contacts' && entry.cycle === 3)[1]?.count,
    ).toBe(3);

    expect(worldMessages.get(aliceChatId)?.at(-1)).toEqual(
      expect.objectContaining({
        fromMe: true,
      }),
    );
    expect(worldMessages.get(carlosChatId)?.at(-1)).toEqual(
      expect.objectContaining({
        fromMe: true,
      }),
    );
    expect(worldMessages.get(danielaChatId)?.at(-1)).toEqual(
      expect.objectContaining({
        fromMe: true,
      }),
    );

    expect(currentBacklog()).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 0,
        pendingMessages: 0,
      }),
    );
  });
});
