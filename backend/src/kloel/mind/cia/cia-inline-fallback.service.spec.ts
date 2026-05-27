import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import type { AgentStreamEvent } from '../whatsapp/agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CiaSendHelpersService } from './cia-send-helpers.service';
import { CiaInlineFallbackService } from './cia-inline-fallback.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('CiaInlineFallbackService', () => {
  let service: CiaInlineFallbackService;
  let prisma: {
    contact: { findFirst: jest.Mock };
    message: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let agentEvents: { publish: jest.Mock };
  let chatFilter: { isRecentRemoteBatch: jest.Mock; resolveInlineBacklogFallbackLimit: jest.Mock };
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
  };
  let redis: {
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    decr: jest.Mock;
    expire: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    chatFilter = {
      isRecentRemoteBatch: jest.fn().mockReturnValue(false),
      resolveInlineBacklogFallbackLimit: jest.fn().mockReturnValue(50),
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaInlineFallbackService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: CiaChatFilterService, useValue: chatFilter },
        { provide: CiaRuntimeStateService, useValue: runtimeState },
        { provide: CiaSendHelpersService, useValue: sendHelpers },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: UnifiedAgentService, useValue: {} },
      ],
    }).compile();
    service = module.get(CiaInlineFallbackService);
  });

  describe('buildPendingInboundBatch', () => {
    it('returns null when no contactId and no phone provided', async () => {
      const result = await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
      });
      expect(result).toBeNull();
    });

    it('returns null when no inbound messages and no fallback content', async () => {
      const result = await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
        phone: '+5511999999999',
      });
      expect(result).toBeNull();
    });

    it('uses fallbackMessageContent and fallbackQuotedMessageId when no real inbound messages', async () => {
      prisma.contact.findFirst.mockResolvedValueOnce({ id: 'c-1', phone: '+5511999999999' });
      prisma.message.findMany.mockResolvedValueOnce([]);

      const result = await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
        phone: '+5511999999999',
        fallbackMessageContent: 'Olá!',
        fallbackQuotedMessageId: 'ext-msg-1',
      });

      expect(result).not.toBeNull();
      expect(result?.aggregatedMessage).toBe('Olá!');
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0]?.content).toBe('Olá!');
      expect(result?.messages[0]?.quotedMessageId).toBe('ext-msg-1');
    });
  });

  describe('runBacklogInlineFallback', () => {
    it('completes immediately when conversations list is empty', async () => {
      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        [],
      );
      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(runtimeState.updateAutonomyRunStatus).toHaveBeenCalledWith(
        'ws-1',
        'run-1',
        'COMPLETED',
      );
      expect(runtimeState.finalizeSilentLiveMode).toHaveBeenCalled();
    });

    it('skips conversations with no phone', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: null,
          messages: [],
          contact: null,
        },
      ];

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );
      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });

    it('publishes a status event when starting inline fallback', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'c-1',
          messages: [{ id: 'm1', content: 'Oi', externalId: 'ext-1', direction: 'INBOUND' }],
          contact: { id: 'c-1', phone: '+5511', name: 'Alice' },
        },
      ];

      prisma.contact.findFirst.mockResolvedValueOnce({ id: 'c-1', phone: '+5511' });
      prisma.message.findMany.mockResolvedValueOnce([
        { content: 'Oi', externalId: 'ext-1', createdAt: new Date() },
      ]);
      sendHelpers.hasOutboundAction.mockReturnValueOnce(true);

      await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      const statusCalls = agentEvents.publish.mock.calls.filter((callArgs: unknown[]) => {
        const maybeEvent = callArgs[0] as AgentStreamEvent | undefined;
        return maybeEvent?.phase === 'backlog_inline_fallback';
      });
      expect(statusCalls.length).toBe(1);
      expect(statusCalls[0][0].meta.total).toBe(1);
    });
  });
});
