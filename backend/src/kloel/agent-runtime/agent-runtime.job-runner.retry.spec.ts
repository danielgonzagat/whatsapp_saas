import { AgentRuntimeJobRunnerService } from './agent-runtime.job-runner';

function makePendingRows(rows: Array<{ id: string; payload: Record<string, unknown> }>) {
  return jest.fn().mockResolvedValue(rows);
}

function makeClaimUpdate() {
  return jest.fn().mockResolvedValue({ count: 1 });
}

function makeClaimedEvents(
  events: Array<{
    id: string;
    eventType: string;
    subject: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    occurredAt: Date;
    attempts: number;
    lastError: string | null;
  }>,
) {
  return jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce(events);
}

describe('AgentRuntimeJobRunnerService', () => {
  it('dead-letters a job after max retries are exhausted', async () => {
    const event = {
      id: 'outbox_1',
      eventType: 'agent.job.due',
      subject: 'agent_job:daily',
      payload: {
        jobKey: 'agent_job:daily',
        title: 'Daily memory audit',
        prompt: 'Review operational memory.',
        toolScope: [],
        envelope: null,
      },
      idempotencyKey: 'agent_job:daily:2026-05-13T10:00:00.000Z',
      occurredAt: new Date('2026-05-13T10:00:00.000Z'),
      attempts: 3,
      lastError: 'previous error',
    };

    const prisma = {
      mindOutboxEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'outbox_1', payload: event.payload }])
          .mockResolvedValueOnce([event]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelMemory: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            value: { kind: 'agent_job', title: 'Daily memory audit' },
            metadata: {},
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'history_1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit_1' }) },
    };
    const brainEvents = {
      claimPendingEvents: jest.fn(),
      markDispatchSucceeded: jest.fn(),
      markDispatchFailed: jest.fn(),
    };
    const sessions = {
      recordTurn: jest.fn().mockResolvedValue('agent_turn:job'),
    };
    const kloel = {
      thinkSync: jest.fn().mockRejectedValue(new Error('persistent failure')),
    };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    const result = await service.runPendingJobsForWorkspace('ws_1');

    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1 });

    expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox_1', workspaceId: 'ws_1', status: 'processing' },
        data: expect.objectContaining({
          status: 'dead_lettered',
          lastError: 'persistent failure',
        }),
      }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws_1',
          action: 'KLOEL_AGENT_JOB_DEAD_LETTERED',
          resourceId: 'agent_job:daily',
          details: expect.objectContaining({
            eventId: 'outbox_1',
            attempts: 3,
            lastError: 'persistent failure',
          }),
        }),
      }),
    );

    expect(brainEvents.markDispatchFailed).not.toHaveBeenCalled();
    expect(brainEvents.markDispatchSucceeded).not.toHaveBeenCalled();

    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({
                status: 'dead_lettered',
                attempt: 3,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('filters out pending events whose nextRetryAt has not yet elapsed', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const prisma = {
      mindOutboxEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'outbox_1',
              payload: {
                jobKey: 'job_future',
                nextRetryAt: '2026-05-13T11:00:00.000Z',
              },
            },
            {
              id: 'outbox_2',
              payload: {
                jobKey: 'job_no_retry',
              },
            },
            {
              id: 'outbox_3',
              payload: {
                jobKey: 'job_past',
                nextRetryAt: '2026-05-13T09:00:00.000Z',
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'outbox_2',
              eventType: 'agent.job.due',
              subject: 'agent_job:job_no_retry',
              payload: { jobKey: 'job_no_retry', prompt: 'do work' },
              idempotencyKey: 'agent_job:job_no_retry:1',
              occurredAt: now,
              attempts: 1,
              lastError: null,
            },
            {
              id: 'outbox_3',
              eventType: 'agent.job.due',
              subject: 'agent_job:job_past',
              payload: { jobKey: 'job_past', prompt: 'do work' },
              idempotencyKey: 'agent_job:job_past:1',
              occurredAt: now,
              attempts: 1,
              lastError: null,
            },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'history_1' }),
      },
      auditLog: { create: jest.fn() },
    };
    const brainEvents = {
      claimPendingEvents: jest.fn(),
      markDispatchSucceeded: jest.fn().mockResolvedValue(undefined),
      markDispatchFailed: jest.fn(),
    };
    const sessions = {
      recordTurn: jest.fn().mockResolvedValue('agent_turn:job'),
    };
    const kloel = {
      thinkSync: jest.fn().mockResolvedValue({ response: 'ok' }),
    };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    const result = await service.runPendingJobsForWorkspace('ws_1', 5);

    expect(result).toEqual({ claimed: 2, succeeded: 2, failed: 0 });

    expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['outbox_2', 'outbox_3'] },
          workspaceId: 'ws_1',
          eventType: 'agent.job.due',
          status: 'pending',
        },
      }),
    );

    jest.useRealTimers();
  });

  it('skips all events in a workspace when none are past their nextRetryAt', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const prisma = {
      mindOutboxEvent: {
        findMany: jest.fn().mockResolvedValueOnce([
          {
            id: 'outbox_1',
            payload: {
              jobKey: 'job_future',
              nextRetryAt: '2026-05-13T12:00:00.000Z',
            },
          },
        ]),
        updateMany: jest.fn(),
      },
      kloelMemory: { findUnique: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const brainEvents = {
      claimPendingEvents: jest.fn(),
      markDispatchSucceeded: jest.fn(),
      markDispatchFailed: jest.fn(),
    };
    const sessions = { recordTurn: jest.fn() };
    const kloel = { thinkSync: jest.fn() };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    const result = await service.runPendingJobsForWorkspace('ws_1', 5);

    expect(result).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(prisma.mindOutboxEvent.updateMany).not.toHaveBeenCalled();
    expect(kloel.thinkSync).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('handles failed retry persistence by logging and not crashing', async () => {
    const event = {
      id: 'outbox_1',
      eventType: 'agent.job.due',
      subject: 'agent_job:daily',
      payload: {
        jobKey: 'agent_job:daily',
        title: 'Daily memory audit',
        prompt: 'Review operational memory.',
        toolScope: [],
        envelope: null,
      },
      idempotencyKey: 'agent_job:daily:2026-05-13T10:00:00.000Z',
      occurredAt: new Date('2026-05-13T10:00:00.000Z'),
      attempts: 1,
      lastError: null,
    };

    const prisma = {
      mindOutboxEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'outbox_1', payload: event.payload }])
          .mockResolvedValueOnce([event]),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockRejectedValueOnce(new Error('db down')),
      },
      kloelMemory: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            value: { kind: 'agent_job', title: 'Daily memory audit' },
            metadata: {},
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'history_1' }),
      },
      auditLog: { create: jest.fn() },
    };
    const brainEvents = {
      claimPendingEvents: jest.fn(),
      markDispatchSucceeded: jest.fn(),
      markDispatchFailed: jest.fn(),
    };
    const sessions = {
      recordTurn: jest.fn().mockResolvedValue('agent_turn:job'),
    };
    const kloel = {
      thinkSync: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    const result = await service.runPendingJobsForWorkspace('ws_1');

    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
  });
});
