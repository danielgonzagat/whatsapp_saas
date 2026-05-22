import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CiaSendHelpersService } from './cia-send-helpers.service';
import { CiaRemoteBacklogService } from './cia-remote-backlog.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import type { WahaChatSummary } from '../whatsapp/providers/whatsapp-api.provider';
import type { AgentStreamEvent } from '../whatsapp/agent-events.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('CiaRemoteBacklogService', () => {
  let service: CiaRemoteBacklogService;
  let prisma: { contact: { findFirst: jest.Mock }; message: { findMany: jest.Mock } };
  let providerRegistry: { getChats: jest.Mock; getMessages: jest.Mock };
  let agentEvents: { publish: jest.Mock };
  let chatFilter: {
    normalizeChats: jest.Mock;
    selectRemotePendingChats: jest.Mock;
    isRecentRemoteBatch: jest.Mock;
  };
  let runtimeState: {
    updateAutonomyRunStatus: jest.Mock;
    finalizeSilentLiveMode: jest.Mock;
    persistRuntimeSnapshot: jest.Mock;
    updateWorkspaceAutonomy: jest.Mock;
    scheduleContactCatalogRefresh: jest.Mock;
  };
  let sendHelpers: {
    getSharedReplyLockKey: jest.Mock;
    redisSetNx: jest.Mock;
    releaseSharedReplyLock: jest.Mock;
    hasOutboundAction: jest.Mock;
    buildInlineFallbackReply: jest.Mock;
    sendCiaMessageWithDailyLimit: jest.Mock;
    normalizeRemoteTimestamp: jest.Mock;
    extractRemoteSenderName: jest.Mock;
    buildRemoteHistorySummary: jest.Mock;
  };
  let redis: {
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    decr: jest.Mock;
    expire: jest.Mock;
  };
  let whatsappService: { syncRemoteContactProfile: jest.Mock };

  beforeEach(async () => {
    prisma = {
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
    };
    providerRegistry = {
      getChats: jest.fn().mockResolvedValue({ chats: [] }),
      getMessages: jest.fn().mockResolvedValue([]),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    chatFilter = {
      normalizeChats: jest.fn().mockReturnValue([]),
      selectRemotePendingChats: jest.fn().mockReturnValue([]),
      isRecentRemoteBatch: jest.fn().mockReturnValue(false),
    };
    runtimeState = {
      updateAutonomyRunStatus: jest.fn().mockResolvedValue(undefined),
      finalizeSilentLiveMode: jest.fn().mockResolvedValue(undefined),
      persistRuntimeSnapshot: jest.fn().mockResolvedValue(undefined),
      updateWorkspaceAutonomy: jest.fn().mockResolvedValue(undefined),
      scheduleContactCatalogRefresh: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      incr: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
    };
    sendHelpers = {
      getSharedReplyLockKey: jest.fn().mockReturnValue('autopilot:reply:ws-1:c-1'),
      redisSetNx: jest.fn().mockResolvedValue(true),
      releaseSharedReplyLock: jest.fn().mockResolvedValue(undefined),
      hasOutboundAction: jest.fn().mockReturnValue(false),
      buildInlineFallbackReply: jest.fn().mockReturnValue('Oi, sou da Kloel!'),
      sendCiaMessageWithDailyLimit: jest
        .fn()
        .mockResolvedValue({ success: true, messageId: 'msg-1' }),
      normalizeRemoteTimestamp: jest.fn().mockReturnValue(new Date().toISOString()),
      extractRemoteSenderName: jest.fn().mockReturnValue('Test User'),
      buildRemoteHistorySummary: jest.fn().mockReturnValue('cliente: Oi'),
    };
    whatsappService = { syncRemoteContactProfile: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaRemoteBacklogService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: CiaChatFilterService, useValue: chatFilter },
        { provide: CiaRuntimeStateService, useValue: runtimeState },
        { provide: CiaSendHelpersService, useValue: sendHelpers },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: UnifiedAgentService, useValue: {} },
        { provide: WHATSAPP_MESSAGING, useValue: whatsappService },
      ],
    }).compile();
    service = module.get(CiaRemoteBacklogService);
  });

  describe('normalizeRemotePhone', () => {
    it('extracts digits from WAHA chat ID format', () => {
      const result = service.normalizeRemotePhone('5511999999999@c.us');
      expect(result).toBe('5511999999999');
    });

    it('handles hyphens and spaces in chat IDs', () => {
      const result = service.normalizeRemotePhone('55-11-99999-9999@c.us');
      expect(result).toBe('5511999999999');
    });

    it('returns empty string for non-matching chat IDs', () => {
      const result = service.normalizeRemotePhone('invalid');
      expect(result).toBe('');
    });
  });

  describe('listRemotePendingChats', () => {
    it('fetches chats from provider and normalizes them', async () => {
      providerRegistry.getChats.mockResolvedValueOnce({
        chats: [{ id: '5511999999999@c.us', unreadCount: 1, lastMessage: { content: 'Oi' } }],
      });
      chatFilter.selectRemotePendingChats.mockReturnValueOnce([
        { id: '5511999999999@c.us', unreadCount: 1, lastMessage: { content: 'Oi' } },
      ]);

      const result = await service.listRemotePendingChats('ws-1', 'session-key', 10);

      expect(providerRegistry.getChats).toHaveBeenCalledWith('session-key');
      expect(chatFilter.selectRemotePendingChats).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('5511999999999@c.us');
    });

    it('clamps limit to [1, 200]', async () => {
      const chats300: WahaChatSummary[] = Array.from({ length: 300 }, (_, i) => ({
        id: `${i}@c.us`,
      }));
      providerRegistry.getChats.mockResolvedValueOnce({ chats: chats300 });
      chatFilter.selectRemotePendingChats.mockReturnValueOnce(chats300);

      const result = await service.listRemotePendingChats('ws-1', 'session-key', 0);
      expect(result.length).toBe(1);

      providerRegistry.getChats.mockResolvedValueOnce({ chats: chats300 });
      chatFilter.selectRemotePendingChats.mockReturnValueOnce(chats300.slice(0, 200));
      const result2 = await service.listRemotePendingChats('ws-1', 'session-key', 999);
      expect(result2.length).toBeLessThanOrEqual(200);
    });
  });

  describe('runRemoteBacklogInlineFallback', () => {
    it('completes when no chats are provided', async () => {
      const result = await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        [],
        'session-key',
      );
      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(runtimeState.finalizeSilentLiveMode).toHaveBeenCalledWith(
        'ws-1',
        'remote_inline_backlog_completed',
        'run-1',
      );
    });

    it('publishes a status event with the remote fallback phase', async () => {
      const chats: WahaChatSummary[] = [
        { id: '5511999999999@c.us', unreadCount: 3, lastMessage: { content: 'Oi, tudo bem?' } },
      ];

      jest.spyOn(service, 'loadRemotePendingBatch').mockResolvedValueOnce(null);

      await service.runRemoteBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        chats,
        'session-key',
      );

      const statusCalls = agentEvents.publish.mock.calls.filter((callArgs: unknown[]) => {
        const maybeEvent = callArgs[0] as AgentStreamEvent | undefined;
        return maybeEvent?.phase === 'backlog_remote_inline_fallback';
      });
      expect(statusCalls.length).toBe(1);
      expect(statusCalls[0][0].meta.total).toBe(1);
    });
  });
});
