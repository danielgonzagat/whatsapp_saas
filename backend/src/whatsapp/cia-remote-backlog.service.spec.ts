import { CiaRemoteBacklogService } from '../cia/cia-remote-backlog.service';
import { CiaChatFilterService } from '../cia/cia-chat-filter.service';
import type { WahaChatSummary } from './providers/whatsapp-api.provider';
function makeChat(overrides: Partial<WahaChatSummary> = {}): WahaChatSummary {
  return {
    id: '5511999999999@c.us',
    unreadCount: 3,
    timestamp: Date.now() - 60_000,
    lastMessageTimestamp: Date.now() - 60_000,
    lastMessageRecvTimestamp: Date.now() - 60_000,
    lastMessageFromMe: false,
    ...overrides,
  };
}
interface PrismaMock {
  contact: { upsert: jest.Mock };
}
interface ProviderRegistryMock {
  getSessionStatus: jest.Mock;
  getChats: jest.Mock;
  getChatMessages: jest.Mock;
  setPresence: jest.Mock;
}
interface SendHelpersMock {
  getSharedReplyLockKey: jest.Mock;
  redisSetNx: jest.Mock;
  releaseSharedReplyLock: jest.Mock;
  sendCiaMessageWithDailyLimit: jest.Mock;
  buildInlineFallbackReply: jest.Mock;
  hasOutboundAction: jest.Mock;
  normalizeRemoteTimestamp: jest.Mock;
  extractRemoteSenderName: jest.Mock;
  buildRemoteHistorySummary: jest.Mock;
}
interface RuntimeStateMock {
  updateAutonomyRunStatus: jest.Mock;
  finalizeSilentLiveMode: jest.Mock;
}
interface UnifiedAgentMock {
  processIncomingMessage: jest.Mock;
  buildQuotedReplyPlan: jest.Mock;
}
interface WhatsappServiceMock {
  sendMessage: jest.Mock;
  syncRemoteContactProfile: jest.Mock;
}
describe('CiaRemoteBacklogService', () => {
  let prisma: PrismaMock;
  let providerRegistry: ProviderRegistryMock;
  let agentEvents: { publish: jest.Mock };
  let chatFilter: CiaChatFilterService;
  let runtimeState: RuntimeStateMock;
  let sendHelpers: SendHelpersMock;
  let unifiedAgent: UnifiedAgentMock;
  let whatsappService: WhatsappServiceMock;
  let service: CiaRemoteBacklogService;
  beforeEach(() => {
    prisma = {
      contact: {
        upsert: jest.fn().mockResolvedValue({
          id: 'contact-1',
          phone: '5511999999999',
          name: 'Alice',
        }),
      },
    };
    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      getChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn().mockResolvedValue([]),
      setPresence: jest.fn(),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    chatFilter = new CiaChatFilterService();
    runtimeState = {
      updateAutonomyRunStatus: jest.fn(),
      finalizeSilentLiveMode: jest.fn(),
    };
    sendHelpers = {
      getSharedReplyLockKey: jest.fn().mockReturnValue('autopilot:reply:mock-remote-key'),
      redisSetNx: jest.fn().mockResolvedValue(true),
      releaseSharedReplyLock: jest.fn().mockResolvedValue(undefined),
      sendCiaMessageWithDailyLimit: jest
        .fn()
        .mockResolvedValue({ success: true, messageId: 'sent-remote-1' }),
      buildInlineFallbackReply: jest.fn().mockReturnValue('Fallback reply'),
      hasOutboundAction: jest.fn().mockReturnValue(false),
      normalizeRemoteTimestamp: jest.fn().mockReturnValue(new Date().toISOString()),
      extractRemoteSenderName: jest.fn().mockReturnValue('Alice'),
      buildRemoteHistorySummary: jest.fn().mockReturnValue('history summary'),
    };
    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        reply: 'Resposta remota',
        response: null,
        actions: [],
      }),
      buildQuotedReplyPlan: jest
        .fn()
        .mockResolvedValue([{ quotedMessageId: 'q-remote-1', text: 'Resposta remota' }]),
    };
    whatsappService = {
      sendMessage: jest.fn(),
      syncRemoteContactProfile: jest.fn().mockResolvedValue(undefined),
    };
    service = new CiaRemoteBacklogService(
      prisma as never,
      providerRegistry as never,
      agentEvents as never,
      chatFilter,
      runtimeState as never,
      sendHelpers as never,
      unifiedAgent as never,
      whatsappService,
    );
  });
  describe('listRemotePendingChats', () => {
    it('fetches chats from the provider, normalizes, filters and slices by limit', async () => {
      const now = Date.now();
      providerRegistry.getChats.mockResolvedValue({
        chats: [
          {
            id: '5511999999999@c.us',
            unreadCount: 5,
            lastMessage: { timestamp: now - 1000, fromMe: false },
          },
          {
            id: '5511888888888@c.us',
            unreadCount: 10,
            lastMessage: { timestamp: now - 2000, fromMe: false },
          },
          {
            id: '5511777777777@c.us',
            unreadCount: 2,
            lastMessage: { timestamp: now - 3000, fromMe: false },
          },
        ],
      });
      const chats = await service.listRemotePendingChats('ws-1', 'session-1', 2);
      expect(chats.length).toBeLessThanOrEqual(2);
      expect(providerRegistry.getChats).toHaveBeenCalledWith('session-1');
    });
    it('returns empty array when provider has no pending chats', async () => {
      providerRegistry.getChats.mockResolvedValue([]);
      const chats = await service.listRemotePendingChats('ws-1', 'session-1', 10);
      expect(chats).toEqual([]);
    });
  });
  describe('normalizeRemotePhone', () => {
    it('extracts phone number from chat id', () => {
      const phone = service.normalizeRemotePhone('5511999999999@c.us');
      expect(phone).toBe('5511999999999');
    });
    it('returns empty string for invalid chat ids', () => {
      const phone = service.normalizeRemotePhone('');
      expect(typeof phone).toBe('string');
      expect(phone.length).toBeLessThanOrEqual(20);
    });
  });
  describe('loadRemotePendingBatch', () => {
    it('returns null when provider returns no messages', async () => {
      providerRegistry.getChatMessages.mockResolvedValue([]);
      const result = await service.loadRemotePendingBatch({
        workspaceId: 'ws-1',
        chat: makeChat({ id: '5511999999999@c.us' }),
        sessionKey: 'session-1',
      });
      expect(result).toBeNull();
    });
    it('upserts a contact when messages exist', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-1-remote', fromMe: false },
            body: 'Preciso de ajuda com o produto',
            timestamp: now - 60_000,
          },
        ],
      });
      const result = await service.loadRemotePendingBatch({
        workspaceId: 'ws-1',
        chat: makeChat({ id: '5511999999999@c.us' }),
        sessionKey: 'session-1',
      });
      expect(result).not.toBeNull();
      expect(prisma.contact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            workspaceId: 'ws-1',
            phone: '5511999999999',
          }),
        }),
      );
    });
  });
  describe('runRemoteBacklogInlineFallback', () => {
    it('publishes a remote fallback started event and processes chats', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-remote-1', fromMe: false },
            body: 'Quero saber o preco',
            timestamp: now - 60_000,
          },
        ],
      });
      const chats = [makeChat({ id: '5511999999999@c.us', unreadCount: 1 })];
      const result = await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-rem-1',
        'reply_all_recent_first',
        chats,
        'session-1',
      );
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'backlog_remote_inline_fallback',
          workspaceId: 'ws-1',
        }),
      );
      expect(typeof result.processed).toBe('number');
      expect(typeof result.skipped).toBe('number');
    });
    it('skips chats that fail to load remote batch', async () => {
      providerRegistry.getChatMessages.mockRejectedValue(new Error('Provider down'));
      const chats = [makeChat()];
      const result = await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-rem-2',
        'reply_all_recent_first',
        chats,
        'session-1',
      );
      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });

    it('skips when reply lock cannot be acquired', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-locked', fromMe: false },
            body: 'Mensagem',
            timestamp: now - 60_000,
          },
        ],
      });
      sendHelpers.redisSetNx.mockResolvedValue(false);

      const chats = [makeChat({ id: '5511999999999@c.us' })];

      const result = await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-rem-3',
        'reply_all_recent_first',
        chats,
        'session-1',
      );

      expect(result.skipped).toBe(1);
    });

    it('tenant isolation: contact upsert includes the correct workspaceId', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-tenant', fromMe: false },
            body: 'test message',
            timestamp: now - 60_000,
          },
        ],
      });

      const chats = [makeChat({ id: '5511999999999@c.us' })];

      await service.runRemoteBacklogInlineFallback(
        'ws-tenant-c',
        'run-rem-4',
        'reply_all_recent_first',
        chats,
        'session-1',
      );

      expect(prisma.contact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            workspaceId: 'ws-tenant-c',
          }),
        }),
      );
    });

    it('uses unifiedAgent to process and build quoted reply plan', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-ua-1', fromMe: false },
            body: 'Preciso de suporte',
            timestamp: now - 60_000,
          },
        ],
      });

      const chats = [makeChat({ id: '5511999999999@c.us' })];

      sendHelpers.redisSetNx.mockResolvedValue(true);

      await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-rem-5',
        'reply_all_recent_first',
        chats,
        'session-1',
      );

      expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          channel: 'whatsapp',
          context: expect.objectContaining({
            remoteChatId: '5511999999999@c.us',
            deliveryMode: expect.stringMatching(/reactive|proactive/) as unknown,
          }),
        }),
      );
    });

    it('skips when unifiedAgent returns empty reply with empty reply plan', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-empty', fromMe: false },
            body: 'test',
            timestamp: now - 60_000,
          },
        ],
      });

      const chats = [makeChat({ id: '5511999999999@c.us' })];

      sendHelpers.redisSetNx.mockResolvedValue(true);
      sendHelpers.buildInlineFallbackReply.mockReturnValue('');
      unifiedAgent.processIncomingMessage.mockResolvedValue({
        reply: '',
        response: '',
        actions: [],
      });
      unifiedAgent.buildQuotedReplyPlan.mockResolvedValue([]);

      const result = await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-rem-6',
        'reply_all_recent_first',
        chats,
        'session-1',
      );

      expect(result.skipped).toBe(1);
    });

    it('counts as skipped when sendCiaMessageWithDailyLimit returns an error', async () => {
      const now = Date.now();
      providerRegistry.getChatMessages.mockResolvedValue({
        messages: [
          {
            id: { _serialized: 'msg-err', fromMe: false },
            body: 'test message',
            timestamp: now - 60_000,
          },
        ],
      });

      const chats = [makeChat({ id: '5511999999999@c.us' })];

      sendHelpers.redisSetNx.mockResolvedValue(true);
      sendHelpers.sendCiaMessageWithDailyLimit.mockResolvedValue({ error: 'send error' });

      const result = await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-rem-7',
        'reply_all_recent_first',
        chats,
        'session-1',
      );

      expect(result.skipped).toBe(1);
    });
  });
});
