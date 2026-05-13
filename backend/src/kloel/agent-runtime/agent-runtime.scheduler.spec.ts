import { AgentRuntimeSchedulerService } from './agent-runtime.scheduler';

describe('AgentRuntimeSchedulerService', () => {
  it('audits due interval jobs and advances next run time', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_1',
            workspaceId: 'ws_1',
            key: 'agent_job:daily',
            value: {
              kind: 'agent_job',
              title: 'Daily audit',
              prompt: 'Review memory',
              schedule: {
                kind: 'interval',
                runAt: '2026-05-13T09:59:00.000Z',
                everyMinutes: 60,
              },
              toolScope: ['search_agent_memory'],
              enabled: true,
              lastRunAt: null,
            },
          },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      mindOutboxEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'outbox_1' }),
      },
    };
    const policy = {
      buildEnvelope: jest.fn().mockReturnValue({
        id: 'env_1',
        allowed: true,
        riskLevel: 'normal',
      }),
    };
    const service = new AgentRuntimeSchedulerService(prisma as never, policy as never);

    await service.auditDueJobs();

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws_1',
          action: 'KLOEL_AGENT_JOB_DUE',
          resourceId: 'agent_job:daily',
        }),
      }),
    );
    expect(prisma.mindOutboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: 'ws_1',
            idempotencyKey: 'agent_job:daily:2026-05-13T09:59:00.000Z',
          },
        },
        create: expect.objectContaining({
          workspaceId: 'ws_1',
          eventType: 'agent.job.due',
          subject: 'agent_job:daily',
          status: 'pending',
          occurredAt: new Date('2026-05-13T09:59:00.000Z'),
        }),
      }),
    );
    expect(prisma.kloelMemory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mem_1', workspaceId: 'ws_1', key: 'agent_job:daily' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            nextRunAt: '2026-05-13T11:00:00.000Z',
            enabled: true,
          }),
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('pauses an existing scheduled job without deleting its stored payload', async () => {
    const prisma = {
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue({
          value: {
            kind: 'agent_job',
            title: 'Daily audit',
            prompt: 'Review memory',
            schedule: {
              kind: 'interval',
              runAt: '2026-05-13T09:59:00.000Z',
              everyMinutes: 60,
            },
            toolScope: ['search_agent_memory'],
            enabled: true,
            lastRunAt: null,
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AgentRuntimeSchedulerService(
      prisma as never,
      { buildEnvelope: jest.fn() } as never,
    );

    const result = await service.setJobEnabled({
      workspaceId: 'ws_1',
      jobId: 'agent_job:daily',
      enabled: false,
    });

    expect(result).toEqual({ ok: true, key: 'agent_job:daily', enabled: false });
    expect(prisma.kloelMemory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws_1',
          key: 'agent_job:daily',
          category: 'agent_job',
          type: 'scheduled',
        },
        data: expect.objectContaining({
          value: expect.objectContaining({ enabled: false }),
          metadata: expect.objectContaining({ enabled: false }),
        }),
      }),
    );
  });

  it('lists execution snapshots for scheduled jobs', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            key: 'agent_job:daily',
            value: {
              kind: 'agent_job',
              title: 'Daily audit',
              prompt: 'Review memory',
              schedule: {
                kind: 'interval',
                runAt: '2026-05-13T11:00:00.000Z',
                everyMinutes: 60,
              },
              toolScope: ['search_agent_memory'],
              enabled: true,
              lastRunAt: '2026-05-13T10:00:00.000Z',
              lastResultAt: '2026-05-13T10:00:10.000Z',
              lastResultStatus: 'succeeded',
              lastError: null,
            },
          },
        ]),
      },
    };
    const service = new AgentRuntimeSchedulerService(
      prisma as never,
      { buildEnvelope: jest.fn() } as never,
    );

    const jobs = await service.listJobs('ws_1');

    expect(jobs).toEqual([
      expect.objectContaining({
        key: 'agent_job:daily',
        lastRunAt: '2026-05-13T10:00:00.000Z',
        lastResultAt: '2026-05-13T10:00:10.000Z',
        lastResultStatus: 'succeeded',
        lastError: null,
      }),
    ]);
  });

  it('returns job_not_found when a scheduled job cannot be parsed', async () => {
    const prisma = {
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    const service = new AgentRuntimeSchedulerService(
      prisma as never,
      { buildEnvelope: jest.fn() } as never,
    );

    const result = await service.setJobEnabled({
      workspaceId: 'ws_1',
      jobId: 'missing',
      enabled: false,
    });

    expect(result).toEqual({
      ok: false,
      key: 'agent_job:missing',
      enabled: false,
      reason: 'job_not_found',
    });
    expect(prisma.kloelMemory.updateMany).not.toHaveBeenCalled();
  });
});
