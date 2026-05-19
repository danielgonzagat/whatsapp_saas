import { CiaInlineFallbackService } from '../cia/cia-inline-fallback.service';
import { CiaChatFilterService } from '../cia/cia-chat-filter.service';
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
});
