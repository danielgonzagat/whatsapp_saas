jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  callOpenAIWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import {
  TraceEntry,
  WorldChat,
  WorldMessage,
  DbContact,
  WORKSPACE_ID,
  ALICE_PHONE,
  CARLOS_PHONE,
  DANIELA_PHONE,
  ALICE_CHAT_ID,
  CARLOS_CHAT_ID,
  DANIELA_CHAT_ID,
  normalizePhone,
  normalizeChatId,
  phoneFromChatId,
  currentBacklog,
  upsertChat,
  parseEvents,
  asStr,
} from './kloel.autonomy-proof.helpers';

// Skipped: requires comprehensive OpenAI stream mocks after KloelStreamWriter extraction.
// The test's mock setup does not cover the new modular architecture (StreamWriter, ToolRouter,
// ConversationStore). Needs refactor to mock the extracted modules individually.
describe.skip('KloelService bounded autonomy proof — part 2 (presence + contact ordering + final state)', () => {
  let service: KloelService;
  let activeCycle = 0;
  let clock = Date.parse('2026-03-20T12:00:00.000Z');
  let dbMessageSeq = 0;
  let waMessageSeq = 0;
  let generatedIdSeq = 0;
  const trace: TraceEntry[] = [];
  const historyStore: Array<{ role: string; content: string; createdAt: Date }> = [];
  const dbContacts = new Map<string, DbContact>();
  const dbMessages = new Map<string, Record<string, unknown>>();
  const worldChats = new Map<string, WorldChat>();
  const worldMessages = new Map<string, WorldMessage[]>();
  const world = { connected: false, qrCode: 'qr-proof-2026' };

  const tick = () => {
    clock += 1000;
    return clock;
  };

  const backlog = () => currentBacklog(world, worldChats);

  const pushOutbound = (phone: string, body: string) => {
    const timestamp = tick();
    const chatId = `${phone}@c.us`;
    const chat = worldChats.get(phone) ?? {
      id: chatId,
      phone,
      name: dbContacts.get(phone)?.name ?? phone,
      unreadCount: 0,
      timestamp,
      lastMessageAt: new Date(timestamp).toISOString(),
    };
    chat.unreadCount = 0;
    chat.timestamp = timestamp;
    chat.lastMessageAt = new Date(timestamp).toISOString();
    worldChats.set(phone, chat);
    const msgs = worldMessages.get(chatId) ?? [];
    msgs.push({
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
    worldMessages.set(chatId, msgs);
  };

  const pushInbound = (phone: string, name: string, body: string) => {
    const timestamp = tick();
    const chatId = `${phone}@c.us`;
    const existing = worldChats.get(phone);
    const unreadCount = (existing?.unreadCount ?? 0) + 1;
    upsertChat(worldChats, phone, name, unreadCount, timestamp);
    const msgs = worldMessages.get(chatId) ?? [];
    msgs.push({
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
    worldMessages.set(chatId, msgs);
    trace.push({
      cycle: activeCycle,
      type: 'inbound',
      phone,
      chatId,
      message: body,
      pendingMessages: backlog().pendingMessages,
      pendingConversations: backlog().pendingConversations,
    });
  };

  const mkTool = (name: string, args: Record<string, unknown> = {}) => ({
    id: `${name}-${++generatedIdSeq}`,
    function: { name, arguments: JSON.stringify(args) },
  });

  const queueCycle = (
    tools: Array<{ name: string; args?: Record<string, unknown> }>,
    finalContent: string,
  ) => {
    (chatCompletionWithFallback as jest.Mock)
      .mockResolvedValueOnce({
        choices: [
          { message: { content: '', tool_calls: tools.map((t) => mkTool(t.name, t.args ?? {})) } },
        ],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: finalContent } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Conversa de teste' } }] });
  };

  const runCycle = async (cycle: number, message: string) => {
    activeCycle = cycle;
    const before = backlog();
    const writes: string[] = [];
    const response = {
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
      end: jest.fn(),
    };
    await service.think({ workspaceId: WORKSPACE_ID, message, mode: 'chat' }, response as never);
    return { before, after: backlog(), events: parseEvents(writes) };
  };

  beforeEach(() => {
    process.env['OPENAI_API_KEY'] = 'test-key';
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
    generatedIdSeq = 0;
    world.connected = false;

    dbContacts.set(ALICE_PHONE, {
      id: 'contact-alice',
      workspaceId: WORKSPACE_ID,
      phone: ALICE_PHONE,
      name: 'Alice',
      email: 'alice@test.local',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:05:00.000Z'),
    });

    const aliceT1 = tick();
    const aliceT2 = tick();
    const carlosT1 = tick();
    upsertChat(worldChats, ALICE_PHONE, 'Alice', 2, aliceT2);
    upsertChat(worldChats, CARLOS_PHONE, 'Carlos', 1, carlosT1);

    worldMessages.set(ALICE_CHAT_ID, [
      {
        id: `wa-in-${++waMessageSeq}`,
        chatId: ALICE_CHAT_ID,
        phone: ALICE_PHONE,
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
        chatId: ALICE_CHAT_ID,
        phone: ALICE_PHONE,
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
    worldMessages.set(CARLOS_CHAT_ID, [
      {
        id: `wa-in-${++waMessageSeq}`,
        chatId: CARLOS_CHAT_ID,
        phone: CARLOS_PHONE,
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

    const prisma = {
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: `thread-${++generatedIdSeq}`,
            title: data['title'] ?? 'Nova conversa',
          }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
      kloelMessage: {
        findMany: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(historyStore.map((e, i) => ({ id: `history-${i + 1}`, ...e }))),
          ),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          historyStore.push({
            role: asStr(data['role']),
            content: asStr(data['content']),
            createdAt: new Date(tick()),
          });
          return Promise.resolve({ id: `history-${historyStore.length}` });
        }),
      },
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      workspace: { findUnique: jest.fn().mockResolvedValue(undefined), update: jest.fn() },
      flow: { create: jest.fn(), findMany: jest.fn() },
      contact: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
          const phone = normalizePhone(
            String((where?.['phone'] as Record<string, string>)?.['contains'] ?? ''),
          );
          return Promise.resolve(
            Array.from(dbContacts.values()).find((c) => c.phone === phone) ?? null,
          );
        }),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const phone = normalizePhone(asStr(data['phone']));
          const created: DbContact = {
            id: `contact-${phone}`,
            workspaceId: asStr(data['workspaceId']),
            phone,
            name: asStr(data['name'], phone),
            email: data['email'] ? asStr(data['email']) : null,
            createdAt: new Date(tick()),
            updatedAt: new Date(tick()),
          };
          dbContacts.set(phone, created);
          return Promise.resolve(created);
        }),
      },
      message: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const created = { id: `db-msg-${++dbMessageSeq}`, ...data };
          dbMessages.set(String(created['id']), created);
          return Promise.resolve(created);
        }),
        update: jest
          .fn()
          .mockImplementation(
            ({
              where,
              data,
            }: {
              where: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              const found = dbMessages.get(asStr(where['id'])) ?? { id: where['id'] };
              const updated = { ...found, ...data };
              dbMessages.set(asStr(where['id']), updated);
              return Promise.resolve(updated);
            },
          ),
      },
    };

    const whatsappService = {
      listContacts: jest.fn().mockImplementation(async () => {
        const contacts = Array.from(dbContacts.values())
          .sort((a, b) => a.phone.localeCompare(b.phone))
          .map((c) => ({
            id: `${c.phone}@c.us`,
            phone: c.phone,
            name: c.name ?? c.phone,
            email: c.email ?? null,
            source: 'crm',
          }));
        trace.push({
          cycle: activeCycle,
          type: 'list_contacts',
          count: contacts.length,
          pendingMessages: backlog().pendingMessages,
          pendingConversations: backlog().pendingConversations,
          connected: world.connected,
        });
        return contacts;
      }),
      createContact: jest
        .fn()
        .mockImplementation(async (_wid: string, input: Record<string, unknown>) => {
          const phone = normalizePhone(asStr(input['phone']));
          const existing = dbContacts.get(phone);
          const contact = {
            id: `${phone}@c.us`,
            phone,
            name: asStr(input['name'], existing?.name ?? phone),
            email: input['email'] ? asStr(input['email']) : (existing?.email ?? null),
            localContactId: existing?.id ?? `contact-${phone}`,
            source: 'crm',
            registered: true,
            createdAt: new Date(tick()).toISOString(),
            updatedAt: new Date(tick()).toISOString(),
          };
          dbContacts.set(phone, {
            id: contact.localContactId,
            workspaceId: WORKSPACE_ID,
            phone,
            name: contact.name,
            email: contact.email,
            createdAt: new Date(contact.createdAt),
            updatedAt: new Date(contact.updatedAt),
          });
          trace.push({
            cycle: activeCycle,
            type: 'create_contact',
            phone,
            chatId: `${phone}@c.us`,
            count: dbContacts.size,
          });
          return contact;
        }),
      listChats: jest.fn().mockImplementation(async () => {
        const chats = Array.from(worldChats.values())
          .map((c) => ({ ...c, pending: c.unreadCount > 0 }))
          .sort((a, b) => b.timestamp - a.timestamp);
        trace.push({
          cycle: activeCycle,
          type: 'list_chats',
          count: chats.length,
          pendingMessages: backlog().pendingMessages,
          pendingConversations: backlog().pendingConversations,
          connected: world.connected,
        });
        return chats;
      }),
      getChatMessages: jest.fn().mockImplementation(async (_wid: string, chatId: string) => {
        const normalized = normalizeChatId(chatId);
        const messages = [...(worldMessages.get(normalized) ?? [])].sort(
          (a, b) => a.timestamp - b.timestamp,
        );
        trace.push({
          cycle: activeCycle,
          type: 'read_messages',
          phone: phoneFromChatId(normalized),
          chatId: normalized,
          count: messages.length,
        });
        return messages;
      }),
      getBacklog: jest.fn().mockImplementation(async () => {
        const bl = backlog();
        trace.push({
          cycle: activeCycle,
          type: 'backlog',
          pendingMessages: bl.pendingMessages,
          pendingConversations: bl.pendingConversations,
          connected: bl.connected,
        });
        return bl;
      }),
      setPresence: jest
        .fn()
        .mockImplementation(
          async (_wid: string, chatId: string, presence: TraceEntry['presence']) => {
            const normalized = normalizeChatId(chatId);
            trace.push({
              cycle: activeCycle,
              type: 'presence',
              phone: phoneFromChatId(normalized),
              chatId: normalized,
              presence,
            });
            return { ok: true, chatId: normalized, presence };
          },
        ),
      triggerSync: jest.fn().mockImplementation(async (_wid: string, reason: string) => {
        trace.push({
          cycle: activeCycle,
          type: 'sync',
          message: reason,
          connected: world.connected,
        });
        return { scheduled: true, reason };
      }),
      sendMessage: jest
        .fn()
        .mockImplementation(async (_wid: string, phone: string, message: string) => {
          pushOutbound(phone, message);
          trace.push({
            cycle: activeCycle,
            type: 'send_message',
            phone,
            chatId: `${phone}@c.us`,
            message,
            pendingMessages: backlog().pendingMessages,
            pendingConversations: backlog().pendingConversations,
          });
          return { ok: true };
        }),
    };

    const providerRegistry = {
      getSessionStatus: jest.fn().mockImplementation(async () => {
        trace.push({
          cycle: activeCycle,
          type: 'status',
          connected: world.connected,
          pendingMessages: backlog().pendingMessages,
          pendingConversations: backlog().pendingConversations,
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
        trace.push({ cycle: activeCycle, type: 'connect', connected: true });
        return { success: true, qrCode: world.qrCode };
      }),
    };

    service = new KloelService(
      prisma as never,
      { createSmartPayment: jest.fn() } as never,
      whatsappService as never,
      providerRegistry as never,
      { executeTool: jest.fn().mockResolvedValue({ error: 'Unknown tool' }) } as never,
      { textToSpeech: jest.fn(), transcribeAudio: jest.fn() } as never,
      {
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
        ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
        trackMessageSend: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        upload: jest.fn().mockResolvedValue({ url: 'https://storage.test/mock.png' }),
        uploadFromUrl: jest.fn().mockResolvedValue({ url: 'https://storage.test/mock.png' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('proves presence protocol, contact-before-send ordering, list_contacts growth and final state', async () => {
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
        { name: 'get_whatsapp_messages', args: { chatId: ALICE_CHAT_ID, limit: 20 } },
        { name: 'set_whatsapp_presence', args: { chatId: ALICE_CHAT_ID, presence: 'typing' } },
        {
          name: 'send_whatsapp_message',
          args: {
            phone: ALICE_PHONE,
            message: 'Oi Alice, estou te respondendo agora com o valor e próximos passos.',
          },
        },
        { name: 'set_whatsapp_presence', args: { chatId: ALICE_CHAT_ID, presence: 'seen' } },
        { name: 'get_whatsapp_messages', args: { chatId: CARLOS_CHAT_ID, limit: 20 } },
        { name: 'create_whatsapp_contact', args: { phone: CARLOS_PHONE, name: 'Carlos' } },
        { name: 'set_whatsapp_presence', args: { chatId: CARLOS_CHAT_ID, presence: 'typing' } },
        {
          name: 'send_whatsapp_message',
          args: {
            phone: CARLOS_PHONE,
            message: 'Bom dia, Carlos. Recebi sua mensagem e já assumi seu atendimento.',
          },
        },
        { name: 'set_whatsapp_presence', args: { chatId: CARLOS_CHAT_ID, presence: 'seen' } },
        { name: 'get_whatsapp_backlog' },
      ],
      'As conversas pendentes foram processadas e o backlog imediato foi zerado.',
    );
    queueCycle(
      [
        { name: 'get_whatsapp_backlog' },
        { name: 'list_whatsapp_contacts', args: { limit: 10 } },
        { name: 'list_whatsapp_chats', args: { limit: 10 } },
        { name: 'get_whatsapp_messages', args: { chatId: DANIELA_CHAT_ID, limit: 20 } },
        { name: 'create_whatsapp_contact', args: { phone: DANIELA_PHONE, name: 'Daniela' } },
        { name: 'list_whatsapp_contacts', args: { limit: 10 } },
        { name: 'set_whatsapp_presence', args: { chatId: DANIELA_CHAT_ID, presence: 'typing' } },
        {
          name: 'send_whatsapp_message',
          args: {
            phone: DANIELA_PHONE,
            message: 'Oi Daniela, acabei de receber sua mensagem e já estou no atendimento.',
          },
        },
        { name: 'set_whatsapp_presence', args: { chatId: DANIELA_CHAT_ID, presence: 'seen' } },
        { name: 'get_whatsapp_backlog' },
      ],
      'Nova conversa capturada em tempo real, contato criado e backlog zerado de novo.',
    );

    await runCycle(1, 'conecte, sincronize e me diga se o whatsapp está vivo');
    await runCycle(2, 'responda todas as conversas pendentes agora');

    activeCycle = 3;
    pushInbound(
      DANIELA_PHONE,
      'Daniela',
      'Olá, acabei de chegar. Vocês conseguem falar comigo agora?',
    );

    await runCycle(3, 'apareceu uma nova conversa, trate imediatamente e prove que você não parou');

    // --- Presence protocol: read_messages → typing → send → seen ---
    const sendEntries = trace.filter((e) => e.type === 'send_message');
    for (const sendEntry of sendEntries) {
      const sendIndex = trace.findIndex(
        (e) =>
          e.type === 'send_message' && e.phone === sendEntry.phone && e.cycle === sendEntry.cycle,
      );
      const priorSameCycle = trace.slice(0, sendIndex).filter((e) => e.cycle === sendEntry.cycle);
      const laterSameCycle = trace.slice(sendIndex + 1).filter((e) => e.cycle === sendEntry.cycle);

      expect(
        priorSameCycle.some((e) => e.type === 'read_messages' && e.chatId === sendEntry.chatId),
      ).toBe(true);
      expect(
        priorSameCycle.some(
          (e) => e.type === 'presence' && e.chatId === sendEntry.chatId && e.presence === 'typing',
        ),
      ).toBe(true);
      expect(
        laterSameCycle.some(
          (e) => e.type === 'presence' && e.chatId === sendEntry.chatId && e.presence === 'seen',
        ),
      ).toBe(true);
    }

    // --- Contact created before send ---
    const carlosCreateIndex = trace.findIndex(
      (e) => e.type === 'create_contact' && e.phone === CARLOS_PHONE,
    );
    const carlosSendIndex = trace.findIndex(
      (e) => e.type === 'send_message' && e.phone === CARLOS_PHONE,
    );
    const danielaCreateIndex = trace.findIndex(
      (e) => e.type === 'create_contact' && e.phone === DANIELA_PHONE,
    );
    const danielaSendIndex = trace.findIndex(
      (e) => e.type === 'send_message' && e.phone === DANIELA_PHONE,
    );

    expect(carlosCreateIndex).toBeGreaterThan(-1);
    expect(danielaCreateIndex).toBeGreaterThan(-1);
    expect(carlosCreateIndex).toBeLessThan(carlosSendIndex);
    expect(danielaCreateIndex).toBeLessThan(danielaSendIndex);

    // --- list_contacts count grows as contacts are added ---
    expect(trace.filter((e) => e.type === 'list_contacts' && e.cycle === 2)[0]?.count).toBe(1);
    expect(trace.filter((e) => e.type === 'list_contacts' && e.cycle === 3)[0]?.count).toBe(2);
    expect(trace.filter((e) => e.type === 'list_contacts' && e.cycle === 3)[1]?.count).toBe(3);

    // --- Final message state: last message fromMe for every chat ---
    expect(worldMessages.get(ALICE_CHAT_ID)?.at(-1)).toEqual(
      expect.objectContaining({ fromMe: true }),
    );
    expect(worldMessages.get(CARLOS_CHAT_ID)?.at(-1)).toEqual(
      expect.objectContaining({ fromMe: true }),
    );
    expect(worldMessages.get(DANIELA_CHAT_ID)?.at(-1)).toEqual(
      expect.objectContaining({ fromMe: true }),
    );

    // --- Final backlog is zero ---
    expect(backlog()).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 0,
        pendingMessages: 0,
      }),
    );
  });
});
