import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { AgentEventsService } from './agent-events.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WorkerRuntimeService } from './worker-runtime.service';
import { INBOUND_PROCESSOR, CIA_RUNTIME, CATCHUP_HISTORY } from './whatsapp.tokens';
import { WhatsappCatchupOrchestratorService } from './whatsapp-catchup-orchestrator.service';

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn().mockResolvedValue(undefined) },
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const makeWorkspace = (
  overrides: Record<string, unknown> = {},
  name = 'Test Workspace',
) => ({
  id: 'ws-1',
  name,
  providerSettings: {
    whatsappProvider: 'meta-cloud',
    whatsappApiSession: {},
    ...overrides,
  },
});

describe('WhatsappCatchupOrchestratorService', () => {
  let service: WhatsappCatchupOrchestratorService;
  let prisma: {
    workspace: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let providerRegistry: {
    getChats: jest.Mock;
    getProviderType: jest.Mock;
    getSessionStatus: jest.Mock;
    readChatMessages: jest.Mock;
    listLidMappings: jest.Mock;
  };
  let inboundProcessor: { process: jest.Mock };
  let ciaRuntime: { startBacklogRun: jest.Mock };
  let workerRuntime: { isAvailable: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let agentEvents: { publish: jest.Mock };
  let history: {
    sanitizePlaceholderContacts: jest.Mock;
    resolveBackfillCursor: jest.Mock;
    resolveWorkspaceSelfPhone: jest.Mock;
    reconcileRemoteChatState: jest.Mock;
    persistHistoricalOutboundMessage: jest.Mock;
    toInboundMessage: jest.Mock;
    isRemoteChatAwaitingReply: jest.Mock;
    rotateFallbackChatsByCursor: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue(makeWorkspace()),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    };
    providerRegistry = {
      getChats: jest.fn().mockResolvedValue([]),
      getProviderType: jest.fn().mockResolvedValue('meta-cloud'),
      getSessionStatus: jest.fn().mockResolvedValue({ connected: true, status: 'CONNECTED' }),
      readChatMessages: jest.fn().mockResolvedValue(undefined),
      listLidMappings: jest.fn().mockResolvedValue([]),
    };
    inboundProcessor = { process: jest.fn().mockResolvedValue({ deduped: false }) };
    ciaRuntime = { startBacklogRun: jest.fn().mockResolvedValue(undefined) };
    workerRuntime = { isAvailable: jest.fn().mockResolvedValue(true) };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    history = {
      sanitizePlaceholderContacts: jest.fn().mockResolvedValue(undefined),
      resolveBackfillCursor: jest.fn().mockReturnValue(null),
      resolveWorkspaceSelfPhone: jest.fn().mockResolvedValue('5511988887777'),
      reconcileRemoteChatState: jest.fn().mockResolvedValue(undefined),
      persistHistoricalOutboundMessage: jest.fn().mockResolvedValue(false),
      toInboundMessage: jest.fn().mockReturnValue(null),
      isRemoteChatAwaitingReply: jest.fn().mockReturnValue(false),
      rotateFallbackChatsByCursor: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappCatchupOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: INBOUND_PROCESSOR, useValue: inboundProcessor },
        { provide: CIA_RUNTIME, useValue: ciaRuntime },
        { provide: WorkerRuntimeService, useValue: workerRuntime },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: CATCHUP_HISTORY, useValue: history },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(WhatsappCatchupOrchestratorService);
  });

  describe('triggerCatchup', () => {
    it('schedules a catchup when no block reason exists', async () => {
      const result = await service.triggerCatchup('ws-1', 'test');
      expect(result.scheduled).toBe(true);
    });

    it('blocks catchup when catchup is disabled in lifecycle', async () => {
      prisma.workspace.findUnique.mockResolvedValue(
        makeWorkspace({ whatsappLifecycle: { catchupEnabled: false } }),
      );
      const result = await service.triggerCatchup('ws-1', 'test');
      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('catchup_disabled');
    });

    it('blocks catchup for guest workspace', async () => {
      prisma.workspace.findUnique.mockResolvedValue(
        makeWorkspace({}, 'Guest Workspace'),
      );
      const result = await service.triggerCatchup('ws-1', 'test');
      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('guest_workspace_disabled');
    });

    it('blocks catchup when recoveryBlockedReason is set', async () => {
      prisma.workspace.findUnique.mockResolvedValue(
        makeWorkspace({
          whatsappApiSession: { recoveryBlockedReason: 'please enable noweb store full_sync' },
        }),
      );
      const result = await service.triggerCatchup('ws-1', 'test');
      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('please enable noweb store full_sync');
    });

    it('returns catchup_locked when another catchup is running', async () => {
      redis.set
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null);
      const result = await service.triggerCatchup('ws-1', 'test');
      expect(result).toEqual({ scheduled: false, reason: 'catchup_locked' });
    });

    it('returns catchup_cooldown when cooldown is active', async () => {
      redis.set.mockResolvedValueOnce(null);
      const result = await service.triggerCatchup('ws-1', 'test');
      expect(result).toEqual({ scheduled: false, reason: 'catchup_cooldown' });
    });
  });

  describe('runCatchupNow', () => {
    it('blocks when catchup is disabled', async () => {
      prisma.workspace.findUnique.mockResolvedValue(
        makeWorkspace({ whatsappLifecycle: { catchupEnabled: false } }),
      );
      const result = await service.runCatchupNow('ws-1', 'manual_test');
      expect(result.scheduled).toBe(false);
      expect((result as { reason?: string }).reason).toBe('catchup_disabled');
    });

    it('runs catchup and returns summary when no chats', async () => {
      const result = await service.runCatchupNow('ws-1', 'manual_test');
      expect(result.scheduled).toBe(true);
      expect(result).toHaveProperty('importedMessages', 0);
      expect(result).toHaveProperty('touchedChats', 0);
      expect(result).toHaveProperty('processedChats', 0);
    });

    it('releases lock after run', async () => {
      const lockKey = 'whatsapp:catchup:ws-1';
      // After lock is acquired by runCatchupNow, the finally block calls
      // releaseLock which does redis.get(lk) → compares → redis.del(lk)
      redis.set.mockImplementation(async (key: string, value: string, ..._o: unknown[]) => {
        if (key === lockKey) {
          redis.get.mockResolvedValueOnce(value);
        }
        return 'OK';
      });
      await service.runCatchupNow('ws-1', 'manual_test');
      expect(redis.get).toHaveBeenCalledWith(lockKey);
    });
  });
});
