jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
  buildQueueJobId: jest.fn().mockReturnValue('cia-backlog:ws-test:run-test'),
}));

import { CiaBacklogRunService } from '../cia/cia-backlog-run.service';
import { CiaChatFilterService } from '../cia/cia-chat-filter.service';
import type { PrismaMock, ProviderRegistryMock, WorkerRuntimeMock } from './cia-runtime.fixtures';

interface AutopilotQueueMock {
  add: jest.Mock;
}

interface RuntimeStateMock {
  createAutonomyRun: jest.Mock;
  updateWorkspaceAutonomy: jest.Mock;
  updateAutonomyRunStatus: jest.Mock;
  persistRuntimeSnapshot: jest.Mock;
  finalizeSilentLiveMode: jest.Mock;
  scheduleContactCatalogRefresh: jest.Mock;
  resetStaleRuntimeRunIfNeeded: jest.Mock;
  getOperationalIntelligence: jest.Mock;
  finalizeRun: jest.Mock;
}

interface InlineFallbackMock {
  buildPendingInboundBatch: jest.Mock;
  runBacklogInlineFallback: jest.Mock;
}

interface RemoteBacklogMock {
  listRemotePendingChats: jest.Mock;
  normalizeRemotePhone: jest.Mock;
  loadRemotePendingBatch: jest.Mock;
  runRemoteBacklogInlineFallback: jest.Mock;
}

function makeMockCiaBootstrap(listPending: jest.Mock, resolveKey: jest.Mock) {
  return {
    listPendingConversations: listPending,
    countPendingMessagesFromConversations: jest.fn(),
    resolveActiveSessionKey: resolveKey,
    run: jest.fn(),
  } as import('../cia/cia-bootstrap.service').CiaBootstrapService;
}

describe('CiaBacklogRunService', () => {
  let prisma: PrismaMock;
  let providerRegistry: ProviderRegistryMock;
  let agentEvents: { publish: jest.Mock };
  let chatFilter: CiaChatFilterService;
  let runtimeState: RuntimeStateMock;
  let workerRuntime: WorkerRuntimeMock;
  let inlineFallback: InlineFallbackMock;
  let remoteBacklog: RemoteBacklogMock;
  let bootstrapService: ReturnType<typeof makeMockCiaBootstrap>;
  let catchupService: { runCatchupNow: jest.Mock };
  let listPending: jest.Mock;
  let resolveKey: jest.Mock;
  let service: CiaBacklogRunService;
  let autopilotQueue: AutopilotQueueMock;

  beforeEach(() => {
    const mockModule = jest.requireMock('../queue/queue');
    autopilotQueue = { add: mockModule.autopilotQueue.add };
    autopilotQueue.add.mockClear();

    prisma = {
      $transaction: jest.fn(),
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {
            autopilot: { enabled: false },
            autonomy: { autoBootstrapOnConnected: true },
            ciaRuntime: {},
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      contact: { findUnique: jest.fn(), findFirst: jest.fn() },
      message: { findFirst: jest.fn(), findMany: jest.fn() },
      kloelMemory: { findUnique: jest.fn(), findMany: jest.fn() },
      systemInsight: { findMany: jest.fn() },
    };

    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      getChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn(),
      setPresence: jest.fn(),
    };

    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    chatFilter = new CiaChatFilterService();

    runtimeState = {
      createAutonomyRun: jest.fn().mockResolvedValue(undefined),
      updateWorkspaceAutonomy: jest.fn().mockResolvedValue(undefined),
      updateAutonomyRunStatus: jest.fn().mockResolvedValue(undefined),
      persistRuntimeSnapshot: jest.fn(),
      finalizeSilentLiveMode: jest.fn(),
      scheduleContactCatalogRefresh: jest.fn(),
      resetStaleRuntimeRunIfNeeded: jest.fn(),
      getOperationalIntelligence: jest.fn(),
      finalizeRun: jest.fn(),
    };

    workerRuntime = { isAvailable: jest.fn().mockResolvedValue(true) };

    inlineFallback = {
      buildPendingInboundBatch: jest.fn(),
      runBacklogInlineFallback: jest.fn().mockResolvedValue({
        processed: 1,
        skipped: 0,
        message: 'Fallback ok',
      }),
    };

    remoteBacklog = {
      listRemotePendingChats: jest.fn().mockResolvedValue([]),
      normalizeRemotePhone: jest.fn().mockReturnValue('5511999999999'),
      loadRemotePendingBatch: jest.fn(),
      runRemoteBacklogInlineFallback: jest.fn().mockResolvedValue({
        processed: 1,
        skipped: 0,
        message: 'Remote fallback ok',
      }),
    };

    listPending = jest.fn().mockResolvedValue([
      {
        id: 'conv-1',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        unreadCount: 3,
        lastMessageAt: new Date(),
        contactId: 'contact-1',
        contact: { id: 'contact-1', phone: '5511999991111', name: 'Alice' },
        messages: [{ id: 'm1', direction: 'INBOUND', createdAt: new Date(), content: 'Oi' }],
        operational: { pending: true },
      },
    ]);

    resolveKey = jest.fn().mockResolvedValue('ws-1');
    bootstrapService = makeMockCiaBootstrap(listPending, resolveKey);
    catchupService = { runCatchupNow: jest.fn().mockResolvedValue({ scheduled: true }) };

    service = new CiaBacklogRunService(
      prisma as never,
      providerRegistry as never,
      agentEvents as never,
      chatFilter,
      runtimeState as never,
      workerRuntime as never,
      inlineFallback as never,
      remoteBacklog as never,
      bootstrapService,
      catchupService as never,
    );
  });

  describe('startBacklogRun', () => {
    it('refuses to start when WhatsApp is disconnected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'DISCONNECTED',
      });

      const result = await service.startBacklogRun('ws-a');

      expect(result.queued).toBe(false);
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          workspaceId: 'ws-a',
          phase: 'backlog_start',
        }),
      );
    });

    it('queues a BullMQ job when worker is available and conversations exist', async () => {
      const result = await service.startBacklogRun('ws-a', 'reply_all_recent_first', 10);

      expect(result.queued).toBe(true);
      expect(autopilotQueue.add).toHaveBeenCalledWith(
        'sweep-unread-conversations',
        expect.objectContaining({
          workspaceId: 'ws-a',
          limit: 10,
        }),
        expect.objectContaining({ removeOnComplete: true }),
      );
    });

    it('falls back to inline execution when the worker is unavailable', async () => {
      workerRuntime.isAvailable.mockResolvedValue(false);

      await service.startBacklogRun('ws-a', 'reply_all_recent_first', 10);

      expect(inlineFallback.runBacklogInlineFallback).toHaveBeenCalledWith(
        'ws-a',
        expect.any(String) as string,
        'reply_all_recent_first',
        expect.any(Array) as Array<unknown>,
      );
    });

    it('enters live-only mode (reply_only_new) without sweeping backlog', async () => {
      const result = await service.startBacklogRun('ws-a', 'reply_only_new');

      expect(result.queued).toBe(true);
      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          workspaceId: 'ws-a',
          phase: 'live_ready',
        }),
      );
      expect(autopilotQueue.add).not.toHaveBeenCalled();
    });

    it('triggers catchup when local DB has no pending conversations', async () => {
      listPending.mockResolvedValue([]);

      await service.startBacklogRun('ws-a', 'reply_all_recent_first', 10);

      expect(catchupService.runCatchupNow).toHaveBeenCalledWith(
        'ws-a',
        expect.stringContaining('cia_backlog') as unknown,
      );
    });

    it('falls back to remote backlog when local DB and catchup yield no conversations', async () => {
      listPending.mockResolvedValue([]);
      catchupService.runCatchupNow.mockResolvedValue({ scheduled: false });
      resolveKey.mockResolvedValue('session-xyz');
      remoteBacklog.listRemotePendingChats.mockResolvedValue([
        {
          id: '5511999999999@c.us',
          unreadCount: 2,
          timestamp: Date.now(),
          lastMessageTimestamp: Date.now(),
          lastMessageRecvTimestamp: Date.now(),
          lastMessageFromMe: false,
        },
      ]);

      await service.startBacklogRun('ws-a', 'reply_all_recent_first', 10);

      expect(remoteBacklog.listRemotePendingChats).toHaveBeenCalledWith(
        'ws-a',
        'session-xyz',
        expect.any(Number) as number,
      );
      expect(remoteBacklog.runRemoteBacklogInlineFallback).toHaveBeenCalled();
    });

    it('publishes a status event with totalQueued count meta', async () => {
      await service.startBacklogRun('ws-a', 'prioritize_hot', 20, {
        autoStarted: false,
      });

      expect(agentEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          phase: 'backlog_start',
          meta: expect.objectContaining({
            totalQueued: expect.any(Number) as number,
            mode: 'prioritize_hot',
          }),
        }),
      );
    });
  });

  describe('ensureBacklogCoverage', () => {
    it('calls the helper with correct deps', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {
          autonomy: { mode: 'FULL', autoBootstrapOnConnected: true },
          ciaRuntime: { state: 'LIVE_READY' },
        },
      });

      const bootstrapFn = jest.fn().mockResolvedValue({ connected: true });
      const startHb = jest.fn().mockResolvedValue(undefined);
      const stopHb = jest.fn().mockResolvedValue(undefined);

      const result = await service.ensureBacklogCoverage(
        'ws-a',
        { triggeredBy: 'scheduler' },
        bootstrapFn,
        startHb,
        stopHb,
      );

      expect(result).toEqual(
        expect.objectContaining({
          action: expect.stringMatching(
            /backlog_started|idle|catalog_scheduled|skipped/,
          ) as unknown,
        }),
      );
    });
  });
});
