import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { autopilotQueue } from '../queue/queue';

jest.mock('../queue/queue', () => {
  const mockAdd = jest.fn().mockResolvedValue(undefined);
  return { autopilotQueue: { add: mockAdd } };
});

describe('CiaRuntimeStateService', () => {
  let service: CiaRuntimeStateService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let agentEvents: { publish: jest.Mock };
  let opsAlert: { alertOnCriticalError: jest.Mock; alertOnDegradation: jest.Mock };

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      workspace: ['findUnique', 'update'],
      autonomyRun: ['create', 'updateMany'],
      autonomyExecution: ['create', 'updateMany'],
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      providerSettings: { ciaRuntime: { state: 'IDLE' } },
    });
    prisma.workspace.update.mockResolvedValue({});
    prisma.autonomyRun.create.mockResolvedValue({});
    prisma.autonomyRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.autonomyExecution.create.mockResolvedValue({ id: 'exec-1' });
    prisma.autonomyExecution.updateMany.mockResolvedValue({ count: 1 });
    type TransactionClient = Pick<typeof prisma, 'workspace' | 'autonomyRun' | 'autonomyExecution'>;
    type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;
    prisma.$transaction = jest.fn().mockImplementation(async (fn: TransactionCallback) => {
      return await fn({
        workspace: prisma.workspace,
        autonomyRun: prisma.autonomyRun,
        autonomyExecution: prisma.autonomyExecution,
      });
    });
    agentEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    opsAlert = {
      alertOnCriticalError: jest.fn(),
      alertOnDegradation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaRuntimeStateService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentEventsService, useValue: agentEvents },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();
    service = module.get(CiaRuntimeStateService);
  });

  describe('persistRuntimeSnapshot', () => {
    it('merges update into existing providerSettings.ciaRuntime', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { ciaRuntime: { state: 'IDLE', mode: 'off' } },
      });

      await service.persistRuntimeSnapshot('ws-1', { state: 'LIVE_READY' });

      expect(prisma.workspace.update).toHaveBeenCalled();
      const updateArg = prisma.workspace.update.mock.calls[0][0];
      const settings = JSON.parse(JSON.stringify(updateArg.data.providerSettings));
      expect(settings.ciaRuntime.state).toBe('LIVE_READY');
      expect(settings.ciaRuntime.mode).toBe('off');
    });

    it('returns early when workspace is not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      await service.persistRuntimeSnapshot('ws-nonexistent', { state: 'LIVE_READY' });

      expect(prisma.workspace.update).not.toHaveBeenCalled();
    });

    it('creates ciaRuntime object when none exists', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-2',
        providerSettings: {},
      });

      await service.persistRuntimeSnapshot('ws-2', { state: 'BOOTING' });

      expect(prisma.workspace.update).toHaveBeenCalled();
      const updateArg = prisma.workspace.update.mock.calls[0][0];
      const settings = JSON.parse(JSON.stringify(updateArg.data.providerSettings));
      expect(settings.ciaRuntime.state).toBe('BOOTING');
    });
  });

  describe('resetStaleRuntimeRunIfNeeded', () => {
    it('returns null when currentRunId is empty', async () => {
      const result = await service.resetStaleRuntimeRunIfNeeded(
        'ws-1',
        { currentRunId: '' },
        'test',
      );
      expect(result).toBeNull();
    });

    it('returns null when run started recently (not stale)', async () => {
      const now = new Date().toISOString();
      const result = await service.resetStaleRuntimeRunIfNeeded(
        'ws-1',
        { currentRunId: 'run-1', startedAt: now },
        'test',
      );
      expect(result).toBeNull();
    });

    it('marks run as FAILED and resets state when stale', async () => {
      const staleDate = new Date(Date.now() - 100 * 60 * 1000).toISOString();
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { ciaRuntime: { currentRunId: 'run-stale', startedAt: staleDate } },
      });

      const result = await service.resetStaleRuntimeRunIfNeeded(
        'ws-1',
        { currentRunId: 'run-stale', startedAt: staleDate },
        'test_reason',
      );

      type UpdateAutonomyRunStatusInput = {
        where: { id: string; workspaceId: string };
        data: { status: string; endedAt?: Date };
      };
      const updateManyMock = prisma.autonomyRun.updateMany as jest.Mock<
        Promise<unknown>,
        [UpdateAutonomyRunStatusInput]
      >;
      const updateManyCall = updateManyMock.mock.calls[0]?.[0];
      if (!updateManyCall) {
        throw new Error('Expected autonomyRun.updateMany to be called');
      }
      expect(updateManyCall.where).toEqual({ id: 'run-stale', workspaceId: 'ws-1' });
      expect(updateManyCall.data.status).toBe('FAILED');
      expect(updateManyCall.data.endedAt).toBeInstanceOf(Date);
      expect(result).not.toBeNull();
      expect(result?.state).toBe('LIVE_READY');
      expect(result?.currentRunId).toBeNull();
      expect(result?.staleRunRecoveredFrom).toBe('run-stale');
    });
  });

  describe('scheduleContactCatalogRefresh', () => {
    it('adds catalog-contacts-30d job to autopilot queue', async () => {
      const mockedAutopilotQueue = autopilotQueue as { add: jest.Mock };
      const result = await service.scheduleContactCatalogRefresh('ws-1', 'boot_complete');
      expect(result.scheduled).toBe(true);
      expect(mockedAutopilotQueue.add).toHaveBeenCalledWith(
        'catalog-contacts-30d',
        expect.objectContaining({ workspaceId: 'ws-1' }),
        expect.objectContaining({ removeOnComplete: true }),
      );
    });

    it('returns scheduled=false when job is already waiting', async () => {
      const mockedAutopilotQueue = autopilotQueue as { add: jest.Mock };
      mockedAutopilotQueue.add.mockRejectedValueOnce(new Error('Job is already waiting'));
      const result = await service.scheduleContactCatalogRefresh('ws-1', 'boot_complete');
      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('already_waiting');
      expect(opsAlert.alertOnDegradation).toHaveBeenCalled();
    });
  });

  describe('createAutonomyRun', () => {
    it('creates autonomy run with RUNNING status', async () => {
      await service.createAutonomyRun('run-1', 'ws-1', 'BACKLOG', { key: 'value' });
      expect(prisma.autonomyRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'run-1',
          workspaceId: 'ws-1',
          mode: 'BACKLOG',
          status: 'RUNNING',
          meta: { key: 'value' },
        }),
      });
    });
  });
});
