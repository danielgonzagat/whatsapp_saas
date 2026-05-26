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
  it('accumulates history entries across multiple executions', async () => {
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

    const existingHistory = {
      subject: 'agent_job:daily',
      eventType: 'agent.job.due',
      jobKey: 'agent_job:daily',
      history: [
        {
          attempt: 1,
          status: 'failed' as const,
          startedAt: '2026-05-12T10:00:00.000Z',
          finishedAt: '2026-05-12T10:01:00.000Z',
          message: 'failed_retrying: old error',
          error: 'old error',
          eventId: 'old_outbox',
          idempotencyKey: 'agent_job:daily:old',
        },
      ],
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
          .mockResolvedValueOnce({ value: existingHistory }),
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

    await service.runPendingJobsForWorkspace('ws_1');

    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          value: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({ attempt: 1, status: 'failed', error: 'old error' }),
              expect.objectContaining({ attempt: 1, status: 'failed' }),
            ]),
          }),
        }),
      }),
    );
    const upsertArgs = prisma.kloelMemory.upsert.mock.calls[0][0];
    expect(Array.isArray(upsertArgs.update.value.history)).toBe(true);
    const upsertCall = (prisma.kloelMemory.upsert).mock.calls[0][0];
    const history = upsertCall.update.value.history;
    expect(history).toHaveLength(2);
  });

  it('handles failed dead-letter persistence gracefully', async () => {
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
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockRejectedValueOnce(new Error('db unavailable')),
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
        data: expect.objectContaining({ status: 'dead_lettered' }),
      }),
    );
  });

  it('handles missing prompt by marking dispatch failed immediately', async () => {
    const event = {
      id: 'outbox_1',
      eventType: 'agent.job.due',
      subject: 'agent_job:empty',
      payload: {
        jobKey: 'agent_job:empty',
        title: 'Empty job',
        prompt: '',
        toolScope: [],
        envelope: null,
      },
      idempotencyKey: 'agent_job:empty:1',
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelMemory: { findUnique: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const brainEvents = {
      claimPendingEvents: jest.fn(),
      markDispatchSucceeded: jest.fn(),
      markDispatchFailed: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = { recordTurn: jest.fn() };
    const kloel = { thinkSync: jest.fn() };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    const result = await service.runPendingJobsForWorkspace('ws_1');

    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
    expect(brainEvents.markDispatchFailed).toHaveBeenCalledWith(
      'outbox_1',
      'ws_1',
      'missing_agent_job_prompt',
    );
    expect(kloel.thinkSync).not.toHaveBeenCalled();
  });

  it('computes exponential backoff capped at MAX_BACKOFF_MS', async () => {
    const event = {
      id: 'outbox_1',
      eventType: 'agent.job.due',
      subject: 'agent_job:daily',
      payload: {
        jobKey: 'daily',
        title: 'Daily',
        prompt: 'do work',
        toolScope: [],
        envelope: null,
      },
      idempotencyKey: 'agent_job:daily:1',
      occurredAt: new Date('2026-05-13T10:00:00.000Z'),
      attempts: 2,
      lastError: null,
    };

    const fakeNow = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(fakeNow);

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
          .mockResolvedValueOnce({ value: { kind: 'agent_job' }, metadata: {} })
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
    const sessions = { recordTurn: jest.fn().mockResolvedValue('t') };
    const kloel = { thinkSync: jest.fn().mockRejectedValue(new Error('fail')) };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    await service.runPendingJobsForWorkspace('ws_1');

    const updateCall = (prisma.mindOutboxEvent.updateMany).mock.calls[1][0];
    const payload = updateCall.data.payload;
    const nextRetryAt = new Date(payload.nextRetryAt);

    const expectedDelayMs = Math.min(60_000 * Math.pow(2, 1), 30 * 60_000);
    const expectedRetryTime = new Date(fakeNow.getTime() + expectedDelayMs);

    expect(nextRetryAt.getTime()).toBe(expectedRetryTime.getTime());

    jest.useRealTimers();
  });
});
