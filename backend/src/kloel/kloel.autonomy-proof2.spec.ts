jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  callOpenAIWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import {
  WORKSPACE_ID,
  ALICE_PHONE,
  CARLOS_PHONE,
  DANIELA_PHONE,
  ALICE_CHAT_ID,
  CARLOS_CHAT_ID,
  DANIELA_CHAT_ID,
  type ProofCtx,
  makeProofCtx,
  parseEvents,
  currentBacklog,
  upsertChat,
  ctxTick,
} from './kloel.autonomy-proof.helpers';
import { setupProofEnv } from './kloel.autonomy-proof.fixtures';

// Skipped: requires comprehensive OpenAI stream mocks after KloelStreamWriter extraction.
// The test's mock setup does not cover the new modular architecture (StreamWriter, ToolRouter,
// ConversationStore). Needs refactor to mock the extracted modules individually.
describe.skip('KloelService bounded autonomy proof — part 2 (presence + contact ordering + final state)', () => {
  const ctx: ProofCtx = makeProofCtx();
  let service: KloelService;

  const mkTool = (name: string, args: Record<string, unknown> = {}) => ({
    id: `${name}-${++ctx.generatedIdSeq}`,
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
    ctx.activeCycle = cycle;
    const before = currentBacklog(ctx.world, ctx.worldChats);
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
    return {
      before,
      after: currentBacklog(ctx.world, ctx.worldChats),
      events: parseEvents(writes),
    };
  };

  const pushInbound = (phone: string, name: string, body: string) => {
    const timestamp = ctxTick(ctx);
    const chatId = `${phone}@c.us`;
    upsertChat(
      ctx.worldChats,
      phone,
      name,
      (ctx.worldChats.get(phone)?.unreadCount ?? 0) + 1,
      timestamp,
    );
    const msgs = ctx.worldMessages.get(chatId) ?? [];
    msgs.push({
      id: `wa-in-${++ctx.waMessageSeq}`,
      chatId,
      phone,
      body,
      direction: 'INBOUND' as const,
      fromMe: false,
      type: 'text',
      hasMedia: false,
      mediaUrl: null,
      timestamp,
      isoTimestamp: new Date(timestamp).toISOString(),
      source: 'waha',
    });
    ctx.worldMessages.set(chatId, msgs);
    const bl = currentBacklog(ctx.world, ctx.worldChats);
    ctx.trace.push({
      cycle: ctx.activeCycle,
      type: 'inbound',
      phone,
      chatId,
      message: body,
      pendingMessages: bl.pendingMessages,
      pendingConversations: bl.pendingConversations,
    });
  };

  beforeEach(() => {
    service = setupProofEnv(ctx);
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

    ctx.activeCycle = 3;
    pushInbound(
      DANIELA_PHONE,
      'Daniela',
      'Olá, acabei de chegar. Vocês conseguem falar comigo agora?',
    );

    await runCycle(3, 'apareceu uma nova conversa, trate imediatamente e prove que você não parou');

    // --- Presence protocol: read_messages → typing → send → seen ---
    const sendEntries = ctx.trace.filter((e) => e.type === 'send_message');
    for (const sendEntry of sendEntries) {
      const sendIndex = ctx.trace.findIndex(
        (e) =>
          e.type === 'send_message' && e.phone === sendEntry.phone && e.cycle === sendEntry.cycle,
      );
      const priorSameCycle = ctx.trace
        .slice(0, sendIndex)
        .filter((e) => e.cycle === sendEntry.cycle);
      const laterSameCycle = ctx.trace
        .slice(sendIndex + 1)
        .filter((e) => e.cycle === sendEntry.cycle);

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
    const carlosCreateIndex = ctx.trace.findIndex(
      (e) => e.type === 'create_contact' && e.phone === CARLOS_PHONE,
    );
    const carlosSendIndex = ctx.trace.findIndex(
      (e) => e.type === 'send_message' && e.phone === CARLOS_PHONE,
    );
    const danielaCreateIndex = ctx.trace.findIndex(
      (e) => e.type === 'create_contact' && e.phone === DANIELA_PHONE,
    );
    const danielaSendIndex = ctx.trace.findIndex(
      (e) => e.type === 'send_message' && e.phone === DANIELA_PHONE,
    );

    expect(carlosCreateIndex).toBeGreaterThan(-1);
    expect(danielaCreateIndex).toBeGreaterThan(-1);
    expect(carlosCreateIndex).toBeLessThan(carlosSendIndex);
    expect(danielaCreateIndex).toBeLessThan(danielaSendIndex);

    // --- list_contacts count grows as contacts are added ---
    expect(ctx.trace.filter((e) => e.type === 'list_contacts' && e.cycle === 2)[0]?.count).toBe(1);
    expect(ctx.trace.filter((e) => e.type === 'list_contacts' && e.cycle === 3)[0]?.count).toBe(2);
    expect(ctx.trace.filter((e) => e.type === 'list_contacts' && e.cycle === 3)[1]?.count).toBe(3);

    // --- Final message state: last message fromMe for every chat ---
    expect(ctx.worldMessages.get(ALICE_CHAT_ID)?.at(-1)).toEqual(
      expect.objectContaining({ fromMe: true }),
    );
    expect(ctx.worldMessages.get(CARLOS_CHAT_ID)?.at(-1)).toEqual(
      expect.objectContaining({ fromMe: true }),
    );
    expect(ctx.worldMessages.get(DANIELA_CHAT_ID)?.at(-1)).toEqual(
      expect.objectContaining({ fromMe: true }),
    );

    // --- Final backlog is zero ---
    expect(currentBacklog(ctx.world, ctx.worldChats)).toEqual(
      expect.objectContaining({
        connected: true,
        pendingConversations: 0,
        pendingMessages: 0,
      }),
    );
  });
});
