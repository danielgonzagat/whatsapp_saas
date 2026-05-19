/**
 * Pagination, deduplication, lock contention, lookback edge and provider-error
 * specs for WhatsAppCatchupService. Extracted from
 * whatsapp-catchup.service.spec.ts to keep both files under the architecture
 * touched-file cap. Behavior under test is unchanged — see
 * whatsapp-catchup.service.spec.ts for the broader catchup suite.
 */

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('./whatsapp-catchup-config', () => {
  const actual = jest.requireActual<typeof import('./whatsapp-catchup-config')>(
    './whatsapp-catchup-config',
  );
  return {
    ...actual,
    CATCHUP_MAX_MESSAGES_PER_CHAT: 2,
  };
});

const { autopilotQueue: _autopilotQueue } = jest.requireMock('../queue/queue');

import type { InboundMessage } from './inbound-processor.service';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { CATCHUP_MAX_MESSAGES_PER_CHAT } from './whatsapp-catchup-config';
import {
  applyCatchupEnvDefaults,
  buildCatchupMocks,
  buildCatchupService,
  type CatchupAgentEventsMock,
  type CatchupCiaRuntimeMock,
  type CatchupInboundProcessorMock,
  type CatchupInboxMock,
  type CatchupPrismaMock,
  type CatchupProviderRegistryMock,
  type CatchupRedisMock,
  type CatchupWorkerRuntimeMock,
  runCatchup,
} from './whatsapp-catchup.service.spec-helpers';

describe('WhatsAppCatchupService — pagination & error paths', () => {
  const originalEnv = { ...process.env };

  let prisma: CatchupPrismaMock;
  let providerRegistry: CatchupProviderRegistryMock;
  let inboundProcessor: CatchupInboundProcessorMock;
  let inbox: CatchupInboxMock;
  let redis: CatchupRedisMock;
  let agentEvents: CatchupAgentEventsMock;
  let ciaRuntime: CatchupCiaRuntimeMock;
  let workerRuntime: CatchupWorkerRuntimeMock;

  const buildService = (): WhatsAppCatchupService =>
    buildCatchupService({
      prisma,
      providerRegistry,
      inboundProcessor,
      inbox,
      redis,
      agentEvents,
      ciaRuntime,
      workerRuntime,
    });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    applyCatchupEnvDefaults();

    const mocks = buildCatchupMocks();
    prisma = mocks.prisma;
    providerRegistry = mocks.providerRegistry;
    inboundProcessor = mocks.inboundProcessor;
    inbox = mocks.inbox;
    redis = mocks.redis;
    agentEvents = mocks.agentEvents;
    ciaRuntime = mocks.ciaRuntime;
    workerRuntime = mocks.workerRuntime;

    // Constrain to a single chat so per-test mocks operate on a deterministic
    // single-pass scope (matches the original spec's per-test expectations).
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511999999999@c.us',
        unreadCount: 3,
        timestamp: Date.now() - 60 * 60 * 1000,
      },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('drains pagination correctly by resuming with cursor after prior offset', async () => {
    const pageSize = CATCHUP_MAX_MESSAGES_PER_CHAT;
    const buildPage = (page: number, count: number) =>
      Array.from({ length: count }, (_item, index) => {
        const messageNumber = page * pageSize + index + 1;
        return {
          id: `p${page + 1}-m${index + 1}`,
          from: '5511999999999@c.us',
          body: `Page ${page + 1} Msg ${index + 1}`,
          type: 'chat',
          timestamp: Date.now() - (messageNumber + 1) * 60 * 1000,
        };
      });

    // Bump unreadCount above the sum the pagination test produces so the
    // catchup loop keeps fetching pages until the provider returns fewer
    // messages than maxMessagesPerChat (i.e. exhausts the cursor) instead
    // of stopping early once unreadCount has been satisfied.
    providerRegistry.getChats.mockResolvedValue([
      {
        id: '5511999999999@c.us',
        unreadCount: pageSize * 3,
        timestamp: Date.now() - 60 * 60 * 1000,
      },
    ]);
    let _callCount = 0;
    providerRegistry.getChatMessages.mockImplementation(
      async (
        _workspaceId: string,
        _chatId: string,
        options?: { limit?: number; offset?: number },
      ) => {
        _callCount += 1;
        const offset = options?.offset || 0;
        if (offset === 0) {
          return buildPage(0, pageSize);
        }
        if (offset === pageSize) {
          return buildPage(1, pageSize);
        }
        if (offset === pageSize * 2) {
          return buildPage(2, 1);
        }
        return [];
      },
    );

    const service = buildService();
    await runCatchup(service, 'ws-1', 'pagination_test', 'lock-token');

    expect(providerRegistry.getChatMessages).toHaveBeenCalledWith('ws-1', '5511999999999@c.us', {
      limit: pageSize,
      offset: 0,
    });
    expect(providerRegistry.getChatMessages).toHaveBeenCalledWith('ws-1', '5511999999999@c.us', {
      limit: pageSize,
      offset: pageSize,
    });
    expect(providerRegistry.getChatMessages).toHaveBeenCalledWith('ws-1', '5511999999999@c.us', {
      limit: pageSize,
      offset: pageSize * 2,
    });
    expect(inboundProcessor.process).toHaveBeenCalledTimes(pageSize * 2 + 1);
  });

  it('deduplicates messages on retry by skipping previously seen IDs within same catchup run', async () => {
    const seenIds: string[] = [];
    inboundProcessor.process.mockImplementation(async (msg: InboundMessage) => {
      seenIds.push(msg.providerMessageId);
      return {
        deduped:
          seenIds.indexOf(msg.providerMessageId) > seenIds.lastIndexOf(msg.providerMessageId)
            ? false
            : true,
      };
    });
    providerRegistry.getChatMessages.mockResolvedValue([
      {
        id: 'dup-msg-1',
        from: '5511999999999@c.us',
        body: 'Original',
        type: 'chat',
        timestamp: Date.now() - 30 * 60 * 1000,
      },
      {
        id: 'dup-msg-1',
        from: '5511999999999@c.us',
        body: 'Duplicate (same ID)',
        type: 'chat',
        timestamp: Date.now() - 25 * 60 * 1000,
      },
    ]);

    const service = buildService();
    await runCatchup(service, 'ws-1', 'dedup_test', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledTimes(1);
    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageId: 'dup-msg-1',
        text: 'Original',
      }),
    );
  });

  it('handles lock contention by releasing lock token on completion or error', async () => {
    const token = 'lock-stub-1';
    redis.get.mockResolvedValueOnce(token);
    redis.get.mockResolvedValueOnce(token);

    const service = buildService();
    await runCatchup(service, 'ws-1', 'lock_test', token);

    expect(redis.get).toHaveBeenCalledWith('whatsapp:catchup:ws-1');
    expect(redis.del).toHaveBeenCalledWith('whatsapp:catchup:ws-1');
  });

  it('handles provider error path by persisting error state and publishing error event', async () => {
    const providerError = new Error('Provider rate limit exceeded');
    providerRegistry.getChats.mockRejectedValueOnce(providerError);

    const service = buildService();

    await expect(runCatchup(service, 'ws-1', 'provider_error_test', 'lock-token')).rejects.toThrow(
      'Provider rate limit exceeded',
    );

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              lastCatchupError: expect.stringContaining('Provider rate limit exceeded'),
              lastCatchupFailedAt: expect.stringMatching(/.+/),
            }),
          }),
        }),
      }),
    );
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phase: 'sync_error',
        type: 'error',
      }),
    );
    expect(redis.del).toHaveBeenCalledWith('whatsapp:catchup:ws-1');
  });
});
