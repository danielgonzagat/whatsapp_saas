import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CiaInlineFallbackService } from './cia-inline-fallback.service';
import { CiaRemoteBacklogService } from './cia-remote-backlog.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { WorkerRuntimeService } from '../whatsapp/worker-runtime.service';
import { WhatsAppCatchupService } from '../whatsapp/whatsapp-catchup.service';
import { CiaBacklogRunService } from './cia-backlog-run.service';
import { AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB } from '../contracts/autopilot-jobs';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('CiaBacklogRunService', () => {
  let service: CiaBacklogRunService;
  let prisma: { workspace: { findUnique: jest.Mock } };
  let providerRegistry: { getSessionStatus: jest.Mock; getChats: jest.Mock };
  let agentEvents: { publish: jest.Mock };
  let chatFilter: {
    resolveInlineBacklogFallbackLimit: jest.Mock;
    normalizeChats: jest.Mock;
    selectRemotePendingChats: jest.Mock;
  };
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

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          providerSettings: {},
        }),
      },
    };
    providerRegistry = {
      getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      getChats: jest.fn().mockResolvedValue({ chats: [] }),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    chatFilter = {
      resolveInlineBacklogFallbackLimit: jest.fn().mockReturnValue(50),
      normalizeChats: jest.fn().mockReturnValue([]),
      selectRemotePendingChats: jest.fn().mockReturnValue([]),
    };
    runtimeState = {
      createAutonomyRun: jest.fn().mockResolvedValue(undefined),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaBacklogRunService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: CiaChatFilterService, useValue: chatFilter },
        { provide: CiaRuntimeStateService, useValue: runtimeState },
        { provide: WorkerRuntimeService, useValue: workerRuntime },
        { provide: CiaInlineFallbackService, useValue: inlineFallback },
        { provide: CiaRemoteBacklogService, useValue: remoteBacklog },
        { provide: CiaBootstrapService, useValue: bootstrapService },
        { provide: WhatsAppCatchupService, useValue: {} },
      ],
    }).compile();
    service = module.get(CiaBacklogRunService);
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
