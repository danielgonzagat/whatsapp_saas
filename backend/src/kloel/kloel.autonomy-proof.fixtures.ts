import { KloelService } from './kloel.service';
import {
  type ProofCtx,
  asStr,
  normalizePhone,
  normalizeChatId,
  phoneFromChatId,
  currentBacklog,
  upsertChat,
  ctxTick,
  WORKSPACE_ID,
  ALICE_PHONE,
  CARLOS_PHONE,
  ALICE_CHAT_ID,
  CARLOS_CHAT_ID,
} from './kloel.autonomy-proof.helpers';

function pushOutbound(ctx: ProofCtx, phone: string, body: string): void {
  const timestamp = ctxTick(ctx);
  const chatId = `${phone}@c.us`;
  const chat = ctx.worldChats.get(phone) ?? {
    id: chatId,
    phone,
    name: ctx.dbContacts.get(phone)?.name ?? phone,
    unreadCount: 0,
    timestamp,
    lastMessageAt: new Date(timestamp).toISOString(),
  };
  chat.unreadCount = 0;
  chat.timestamp = timestamp;
  chat.lastMessageAt = new Date(timestamp).toISOString();
  ctx.worldChats.set(phone, chat);
  const msgs = ctx.worldMessages.get(chatId) ?? [];
  msgs.push({
    id: `wa-out-${++ctx.waMessageSeq}`,
    chatId,
    phone,
    body,
    direction: 'OUTBOUND' as const,
    fromMe: true,
    type: 'text',
    hasMedia: false,
    mediaUrl: null,
    timestamp,
    isoTimestamp: new Date(timestamp).toISOString(),
    source: 'waha',
  });
  ctx.worldMessages.set(chatId, msgs);
}

export function setupProofEnv(ctx: ProofCtx): KloelService {
  process.env['OPENAI_API_KEY'] = 'test-key';
  ctx.trace.length = 0;
  ctx.historyStore.length = 0;
  ctx.dbContacts.clear();
  ctx.dbMessages.clear();
  ctx.worldChats.clear();
  ctx.worldMessages.clear();
  ctx.activeCycle = 0;
  ctx.clock = Date.parse('2026-03-20T12:00:00.000Z');
  ctx.dbMessageSeq = 0;
  ctx.waMessageSeq = 0;
  ctx.generatedIdSeq = 0;
  ctx.world.connected = false;

  ctx.dbContacts.set(ALICE_PHONE, {
    id: 'contact-alice',
    workspaceId: WORKSPACE_ID,
    phone: ALICE_PHONE,
    name: 'Alice',
    email: 'alice@test.local',
    createdAt: new Date('2026-03-20T10:00:00.000Z'),
    updatedAt: new Date('2026-03-20T10:05:00.000Z'),
  });

  const aliceT1 = ctxTick(ctx);
  const aliceT2 = ctxTick(ctx);
  const carlosT1 = ctxTick(ctx);
  upsertChat(ctx.worldChats, ALICE_PHONE, 'Alice', 2, aliceT2);
  upsertChat(ctx.worldChats, CARLOS_PHONE, 'Carlos', 1, carlosT1);

  ctx.worldMessages.set(ALICE_CHAT_ID, [
    {
      id: `wa-in-${++ctx.waMessageSeq}`,
      chatId: ALICE_CHAT_ID,
      phone: ALICE_PHONE,
      body: 'Oi, quero saber o preço do plano.',
      direction: 'INBOUND' as const,
      fromMe: false,
      type: 'text',
      hasMedia: false,
      mediaUrl: null,
      timestamp: aliceT1,
      isoTimestamp: new Date(aliceT1).toISOString(),
      source: 'waha',
    },
    {
      id: `wa-in-${++ctx.waMessageSeq}`,
      chatId: ALICE_CHAT_ID,
      phone: ALICE_PHONE,
      body: 'Vocês conseguem me responder hoje?',
      direction: 'INBOUND' as const,
      fromMe: false,
      type: 'text',
      hasMedia: false,
      mediaUrl: null,
      timestamp: aliceT2,
      isoTimestamp: new Date(aliceT2).toISOString(),
      source: 'waha',
    },
  ]);
  ctx.worldMessages.set(CARLOS_CHAT_ID, [
    {
      id: `wa-in-${++ctx.waMessageSeq}`,
      chatId: CARLOS_CHAT_ID,
      phone: CARLOS_PHONE,
      body: 'Bom dia, preciso de atendimento.',
      direction: 'INBOUND' as const,
      fromMe: false,
      type: 'text',
      hasMedia: false,
      mediaUrl: null,
      timestamp: carlosT1,
      isoTimestamp: new Date(carlosT1).toISOString(),
      source: 'waha',
    },
  ]);

  const backlog = () => currentBacklog(ctx.world, ctx.worldChats);

  const prisma = {
    chatThread: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: `thread-${++ctx.generatedIdSeq}`,
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
          Promise.resolve(ctx.historyStore.map((e, i) => ({ id: `history-${i + 1}`, ...e }))),
        ),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        ctx.historyStore.push({
          role: asStr(data['role']),
          content: asStr(data['content']),
          createdAt: new Date(ctxTick(ctx)),
        });
        return Promise.resolve({ id: `history-${ctx.historyStore.length}` });
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
          Array.from(ctx.dbContacts.values()).find((c) => c.phone === phone) ?? null,
        );
      }),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const phone = normalizePhone(asStr(data['phone']));
        const created = {
          id: `contact-${phone}`,
          workspaceId: asStr(data['workspaceId']),
          phone,
          name: asStr(data['name'], phone),
          email: data['email'] ? asStr(data['email']) : null,
          createdAt: new Date(ctxTick(ctx)),
          updatedAt: new Date(ctxTick(ctx)),
        };
        ctx.dbContacts.set(phone, created);
        return Promise.resolve(created);
      }),
    },
    message: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `db-msg-${++ctx.dbMessageSeq}`, ...data };
        ctx.dbMessages.set(String(created['id']), created);
        return Promise.resolve(created);
      }),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            const found = ctx.dbMessages.get(asStr(where['id'])) ?? { id: where['id'] };
            const updated = { ...found, ...data };
            ctx.dbMessages.set(asStr(where['id']), updated);
            return Promise.resolve(updated);
          },
        ),
    },
  };

  const whatsappService = {
    listContacts: jest.fn().mockImplementation(() => {
      const contacts = Array.from(ctx.dbContacts.values())
        .sort((a, b) => a.phone.localeCompare(b.phone))
        .map((c) => ({
          id: `${c.phone}@c.us`,
          phone: c.phone,
          name: c.name ?? c.phone,
          email: c.email ?? null,
          source: 'crm',
        }));
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'list_contacts',
        count: contacts.length,
        pendingMessages: backlog().pendingMessages,
        pendingConversations: backlog().pendingConversations,
        connected: ctx.world.connected,
      });
      return Promise.resolve(contacts);
    }),
    createContact: jest.fn().mockImplementation((_wid: string, input: Record<string, unknown>) => {
      const phone = normalizePhone(asStr(input['phone']));
      const existing = ctx.dbContacts.get(phone);
      const contact = {
        id: `${phone}@c.us`,
        phone,
        name: asStr(input['name'], existing?.name ?? phone),
        email: input['email'] ? asStr(input['email']) : (existing?.email ?? null),
        localContactId: existing?.id ?? `contact-${phone}`,
        source: 'crm',
        registered: true,
        createdAt: new Date(ctxTick(ctx)).toISOString(),
        updatedAt: new Date(ctxTick(ctx)).toISOString(),
      };
      ctx.dbContacts.set(phone, {
        id: contact.localContactId,
        workspaceId: WORKSPACE_ID,
        phone,
        name: contact.name,
        email: contact.email,
        createdAt: new Date(contact.createdAt),
        updatedAt: new Date(contact.updatedAt),
      });
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'create_contact',
        phone,
        chatId: `${phone}@c.us`,
        count: ctx.dbContacts.size,
      });
      return Promise.resolve(contact);
    }),
    listChats: jest.fn().mockImplementation(() => {
      const chats = Array.from(ctx.worldChats.values())
        .map((c) => ({ ...c, pending: c.unreadCount > 0 }))
        .sort((a, b) => b.timestamp - a.timestamp);
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'list_chats',
        count: chats.length,
        pendingMessages: backlog().pendingMessages,
        pendingConversations: backlog().pendingConversations,
        connected: ctx.world.connected,
      });
      return Promise.resolve(chats);
    }),
    getChatMessages: jest.fn().mockImplementation((_wid: string, chatId: string) => {
      const normalized = normalizeChatId(chatId);
      const messages = [...(ctx.worldMessages.get(normalized) ?? [])].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'read_messages',
        phone: phoneFromChatId(normalized),
        chatId: normalized,
        count: messages.length,
      });
      return Promise.resolve(messages);
    }),
    getBacklog: jest.fn().mockImplementation(() => {
      const bl = backlog();
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'backlog',
        pendingMessages: bl.pendingMessages,
        pendingConversations: bl.pendingConversations,
        connected: bl.connected,
      });
      return Promise.resolve(bl);
    }),
    setPresence: jest
      .fn()
      .mockImplementation(
        (_wid: string, chatId: string, presence: 'typing' | 'paused' | 'seen') => {
          const normalized = normalizeChatId(chatId);
          ctx.trace.push({
            cycle: ctx.activeCycle,
            type: 'presence',
            phone: phoneFromChatId(normalized),
            chatId: normalized,
            presence,
          });
          return Promise.resolve({ ok: true, chatId: normalized, presence });
        },
      ),
    triggerSync: jest.fn().mockImplementation((_wid: string, reason: string) => {
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'sync',
        message: reason,
        connected: ctx.world.connected,
      });
      return Promise.resolve({ scheduled: true, reason });
    }),
    sendMessage: jest.fn().mockImplementation((_wid: string, phone: string, message: string) => {
      pushOutbound(ctx, phone, message);
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'send_message',
        phone,
        chatId: `${phone}@c.us`,
        message,
        pendingMessages: backlog().pendingMessages,
        pendingConversations: backlog().pendingConversations,
      });
      return Promise.resolve({ ok: true });
    }),
  };

  const providerRegistry = {
    getSessionStatus: jest.fn().mockImplementation(() => {
      ctx.trace.push({
        cycle: ctx.activeCycle,
        type: 'status',
        connected: ctx.world.connected,
        pendingMessages: backlog().pendingMessages,
        pendingConversations: backlog().pendingConversations,
      });
      return Promise.resolve({
        connected: ctx.world.connected,
        status: ctx.world.connected ? 'WORKING' : 'SCAN_QR_CODE',
        qrCode: ctx.world.connected ? undefined : ctx.world.qrCode,
        phoneNumber: ctx.world.connected ? '5511988887777' : undefined,
      });
    }),
    startSession: jest.fn().mockImplementation(() => {
      ctx.world.connected = true;
      ctx.trace.push({ cycle: ctx.activeCycle, type: 'connect', connected: true });
      return Promise.resolve({ success: true, qrCode: ctx.world.qrCode });
    }),
  };

  const stub = {} as never;
  return new KloelService(
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
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    { executeTool: jest.fn().mockResolvedValue({ success: false }) } as never,
  );
}
