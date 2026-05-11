import { CiaInlineFallbackService } from './cia-inline-fallback.service';
import { CiaChatFilterService } from './cia-chat-filter.service';

interface PrismaMock {
  message: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  contact: { findFirst: jest.Mock; findUnique: jest.Mock };
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

describe('CiaInlineFallbackService', () => {
  let prisma: PrismaMock;
  let agentEvents: { publish: jest.Mock };
  let chatFilter: CiaChatFilterService;
  let runtimeState: RuntimeStateMock;
  let sendHelpers: SendHelpersMock;
  let unifiedAgent: UnifiedAgentMock;
  let service: CiaInlineFallbackService;

  beforeEach(() => {
    prisma = {
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
      },
    };

    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    chatFilter = new CiaChatFilterService();

    runtimeState = {
      updateAutonomyRunStatus: jest.fn(),
      finalizeSilentLiveMode: jest.fn(),
    };

    sendHelpers = {
      getSharedReplyLockKey: jest.fn().mockReturnValue('autopilot:reply:mock-key'),
      redisSetNx: jest.fn().mockResolvedValue(true),
      releaseSharedReplyLock: jest.fn().mockResolvedValue(undefined),
      sendCiaMessageWithDailyLimit: jest
        .fn()
        .mockResolvedValue({ success: true, messageId: 'sent-1' }),
      buildInlineFallbackReply: jest.fn().mockReturnValue('Fallback reply'),
      hasOutboundAction: jest.fn().mockReturnValue(false),
      normalizeRemoteTimestamp: jest.fn(),
      extractRemoteSenderName: jest.fn(),
      buildRemoteHistorySummary: jest.fn(),
    };

    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        reply: 'Agente respondeu',
        response: null,
        actions: [],
      }),
      buildQuotedReplyPlan: jest
        .fn()
        .mockResolvedValue([{ quotedMessageId: 'q1', text: 'Agente respondeu' }]),
    };

    service = new CiaInlineFallbackService(
      prisma as never,
      agentEvents as never,
      chatFilter,
      runtimeState as never,
      sendHelpers as never,
      unifiedAgent as never,
    );
  });

  describe('buildPendingInboundBatch', () => {
    it('returns null when both contactId and phone are missing', async () => {
      const result = await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
      });
      expect(result).toBeNull();
    });

    it('aggregates multiple inbound messages with numbered prefix', async () => {
      prisma.message.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.message.findMany.mockResolvedValue([
        { content: 'Primeira', externalId: 'e1', createdAt: new Date() },
        { content: 'Segunda', externalId: 'e2', createdAt: new Date() },
      ]);

      const result = await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
      });

      expect(result).not.toBeNull();
      expect(result!.aggregatedMessage).toContain('[1]');
      expect(result!.aggregatedMessage).toContain('[2]');
      expect(result!.messages).toHaveLength(2);
    });

    it('uses fallback content when no inbound messages found', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        fallbackMessageContent: 'fallback text',
        fallbackQuotedMessageId: 'fb-1',
      });

      expect(result).not.toBeNull();
      expect(result!.aggregatedMessage).toBe('fallback text');
    });

    it('queries only inbound messages after the last outbound', async () => {
      const lastOutboundDate = new Date('2026-03-19T10:00:00.000Z');
      prisma.message.findFirst.mockResolvedValue({ createdAt: lastOutboundDate });

      await service.buildPendingInboundBatch({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
      });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            direction: 'INBOUND',
            createdAt: { gt: lastOutboundDate },
          }),
        }),
      );
    });

    it('tenant isolation: filters by workspaceId in all queries', async () => {
      await service.buildPendingInboundBatch({
        workspaceId: 'ws-tenant-b',
        contactId: 'contact-1',
      });

      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant-b' }),
        }),
      );
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant-b' }),
        }),
      );
    });
  });

  describe('runBacklogInlineFallback', () => {
    it('returns early with zero processed when conversations array is empty', async () => {
      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        [],
      );

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(runtimeState.finalizeSilentLiveMode).toHaveBeenCalled();
    });

    it('processes an inbound conversation and acquires a reply lock', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi, tudo bem?',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(true);

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(result.processed).toBeGreaterThan(0);
      expect(sendHelpers.redisSetNx).toHaveBeenCalled();
      expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          channel: 'whatsapp',
          context: expect.objectContaining({ source: 'cia_backlog_inline' }),
        }),
      );
    });

    it('skips conversation when reply lock cannot be acquired', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(false);

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });

    it('skips conversation when no valid phone or message content', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '', name: 'NoPhone' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
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

    it('publishes inline fallback status events before and after processing', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(true);

      await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'backlog_inline_fallback',
          workspaceId: 'ws-1',
        }),
      );
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'backlog_inline_done',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('releases reply lock when processing fails', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(true);
      unifiedAgent.processIncomingMessage.mockRejectedValue(new Error('AI failure'));

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(sendHelpers.releaseSharedReplyLock).toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });

    it('skips when unifiedAgent returns empty reply with no reply plan', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(true);
      unifiedAgent.processIncomingMessage.mockResolvedValue({
        reply: '',
        response: '',
        actions: [],
      });
      unifiedAgent.buildQuotedReplyPlan.mockResolvedValue([]);
      sendHelpers.buildInlineFallbackReply.mockReturnValue('');

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(result.skipped).toBe(1);
    });

    it('skips when outbound action is detected and send fails', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(true);
      sendHelpers.hasOutboundAction.mockReturnValue(true);

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(result.processed).toBe(1);
    });

    it('counts as skipped when sendCiaMessageWithDailyLimit returns an error', async () => {
      const conversations = [
        {
          id: 'conv-1',
          contactId: 'contact-1',
          contact: { id: 'contact-1', phone: '5511999999999', name: 'Alice' },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              content: 'Oi',
              externalId: 'ext-1',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      sendHelpers.redisSetNx.mockResolvedValue(true);
      sendHelpers.sendCiaMessageWithDailyLimit.mockResolvedValue({ error: 'send failed' });

      const result = await service.runBacklogInlineFallback(
        'ws-1',
        'run-1',
        'reply_all_recent_first',
        conversations,
      );

      expect(result.skipped).toBe(1);
    });
  });
});
