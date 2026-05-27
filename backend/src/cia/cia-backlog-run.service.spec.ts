import { CiaBacklogRunService } from './cia-backlog-run.service';
import { AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB } from '../contracts/autopilot-jobs';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('CiaBacklogRunService', () => {
  let service: CiaBacklogRunService;
  let prisma: { workspace: { findUnique: jest.Mock } };
  let providerRegistry: { getSessionStatus: jest.Mock };
  let agentEvents: { publish: jest.Mock };
  let chatFilter: Record<string, jest.Mock>;
  let runtimeState: {
    createAutonomyRun: jest.Mock;
    updateWorkspaceAutonomy: jest.Mock;
    updateAutonomyRunStatus: jest.Mock;
    persistRuntimeSnapshot: jest.Mock;
    scheduleContactCatalogRefresh: jest.Mock;
  };
  let workerRuntime: { isAvailable: jest.Mock };
  let inlineFallback: { runBacklogInlineFallback: jest.Mock };
  let remoteBacklog: {
    listRemotePendingChats: jest.Mock;
    runRemoteBacklogInlineFallback: jest.Mock;
  };
  let bootstrapService: {
    listPendingConversations: jest.Mock;
    resolveActiveSessionKey: jest.Mock;
  };
  let catchupService: Record<string, jest.Mock>;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          autonomyMode: 'reply_all_recent_first',
        }),
      },
    };
    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    chatFilter = {
      applyFilter: jest.fn().mockResolvedValue(true),
      resolveInlineBacklogFallbackLimit: jest.fn().mockReturnValue(20),
    };
    runtimeState = {
      createAutonomyRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
      updateWorkspaceAutonomy: jest.fn().mockResolvedValue(undefined),
      updateAutonomyRunStatus: jest.fn().mockResolvedValue(undefined),
      persistRuntimeSnapshot: jest.fn().mockResolvedValue(undefined),
      scheduleContactCatalogRefresh: jest.fn().mockResolvedValue(undefined),
    };
    workerRuntime = { isAvailable: jest.fn().mockResolvedValue(true) };
    inlineFallback = {
      runBacklogInlineFallback: jest
        .fn()
        .mockResolvedValue({ processed: 0, skipped: 0, message: '' }),
    };
    remoteBacklog = {
      listRemotePendingChats: jest.fn().mockResolvedValue([]),
      runRemoteBacklogInlineFallback: jest
        .fn()
        .mockResolvedValue({ processed: 0, skipped: 0, message: '' }),
    };
    bootstrapService = {
      listPendingConversations: jest.fn().mockResolvedValue([]),
      resolveActiveSessionKey: jest.fn().mockResolvedValue('session-key'),
    };
    catchupService = {};

    // Direct constructor call — bypasses NestJS DI to avoid metadata
    // resolution issues when run in isolation with forwardRef.
    service = new CiaBacklogRunService(
      prisma as never,
      providerRegistry as never,
      agentEvents as never,
      chatFilter as never,
      runtimeState as never,
      workerRuntime as never,
      inlineFallback as never,
      remoteBacklog as never,
      bootstrapService as never,
      catchupService as never,
    );
  });

  describe('startBacklogRun', () => {
    it('aborts when WhatsApp is not connected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValueOnce({
        connected: false,
        status: 'DISCONNECTED',
      });

      const result = await service.startBacklogRun('ws-1', 'reply_all_recent_first');

      expect(result.queued).toBe(false);
      expect(result.message).toMatch(/WhatsApp.*conectado/i);
      expect(runtimeState.createAutonomyRun).not.toHaveBeenCalled();
    });

    it('returns immediately for reply_only_new mode without queueing', async () => {
      const result = await service.startBacklogRun('ws-1', 'reply_only_new');

      expect(result.queued).toBe(true);
      expect(result.mode).toBe('reply_only_new');
      expect(runtimeState.updateAutonomyRunStatus).toHaveBeenCalledWith(
        'ws-1',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        'COMPLETED',
      );
    });

    it('falls back to inline when worker is unavailable', async () => {
      workerRuntime.isAvailable.mockResolvedValueOnce(false);
      bootstrapService.listPendingConversations.mockResolvedValueOnce([
        {
          id: 'conv-1',
          status: 'OPEN',
          contactId: 'c-1',
          contact: { id: 'c-1', phone: '+5511', name: 'Alice' },
          messages: [{ id: 'm1', content: 'Oi', direction: 'INBOUND' }],
          operational: { pending: true },
        },
      ]);
      inlineFallback.runBacklogInlineFallback.mockResolvedValueOnce({
        processed: 1,
        skipped: 0,
        message: 'Fallback inline concluído.',
      });

      const result = await service.startBacklogRun('ws-1', 'reply_all_recent_first');

      expect(result.inlineFallback).toBe(true);
      expect(result.processedInline).toBe(1);
      expect(inlineFallback.runBacklogInlineFallback).toHaveBeenCalled();
    });

    it('queues job to BullMQ when worker is available and conversations exist', async () => {
      bootstrapService.listPendingConversations.mockResolvedValueOnce([
        {
          id: 'conv-1',
          status: 'OPEN',
          contactId: 'c-1',
          contact: { id: 'c-1', phone: '+5511', name: 'Alice' },
          messages: [],
          operational: { pending: true },
        },
      ]);

      const { autopilotQueue } = await import('../queue/queue');
      const result = await service.startBacklogRun('ws-1', 'reply_all_recent_first');

      expect(result.queued).toBe(true);
      expect(autopilotQueue.add).toHaveBeenCalledWith(
        AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
        expect.objectContaining({ workspaceId: 'ws-1' }),
        expect.objectContaining({ removeOnComplete: true }),
      );
    });
  });
});
