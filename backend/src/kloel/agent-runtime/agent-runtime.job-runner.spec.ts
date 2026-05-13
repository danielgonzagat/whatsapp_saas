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
  return jest
    .fn()
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce(events);
}

describe('AgentRuntimeJobRunnerService', () => {
  it('claims due agent jobs, executes through KloelService, records memory, and marks success', async () => {
    const event = {
      id: 'outbox_1',
      eventType: 'agent.job.due',
      subject: 'agent_job:daily',
      payload: {
        jobKey: 'agent_job:daily',
        title: 'Daily memory audit',
        prompt: 'Review operational memory.',
        toolScope: ['search_agent_memory'],
        envelope: { allowed: true },
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelMemory: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            value: {
              kind: 'agent_job',
              title: 'Daily memory audit',
              prompt: 'Review operational memory.',
            },
            metadata: { kind: 'agent_job', nextRunAt: '2026-05-13T11:00:00.000Z' },
          })
          .mockResolvedValueOnce(null),
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
      thinkSync: jest.fn().mockResolvedValue({ response: 'Memory is current.' }),
    };
    const service = new AgentRuntimeJobRunnerService(
      prisma as never,
      brainEvents as never,
      sessions as never,
      kloel as never,
    );

    const result = await service.runPendingJobsForWorkspace('ws_1', 5);

    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(kloel.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        mode: 'chat',
        message: 'Review operational memory.',
        allowedTools: ['search_agent_memory'],
        companyContext: expect.stringContaining('<scheduled-agent-job>'),
      }),
    );
    expect(sessions.recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        channel: 'agent_job:agent_job:daily',
        assistantMessage: 'Memory is current.',
        actions: [expect.objectContaining({ toolName: 'agent.job.due', success: true })],
      }),
    );
    expect(prisma.kloelMemory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws_1',
          key: 'agent_job:daily',
          category: 'agent_job',
          type: 'scheduled',
        },
        data: expect.objectContaining({
          value: expect.objectContaining({
            lastResultStatus: 'succeeded',
            lastResultSummary: 'Memory is current.',
          }),
          metadata: expect.objectContaining({
            lastResultStatus: 'succeeded',
            lastEventId: 'outbox_1',
          }),
        }),
      }),
    );
    expect(brainEvents.markDispatchSucceeded).toHaveBeenCalledWith('outbox_1', 'ws_1');
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_key: {
            workspaceId: 'ws_1',
            key: 'agent_job_history:agent_job:daily',
          },
        },
        create: expect.objectContaining({
          workspaceId: 'ws_1',
          key: 'agent_job_history:agent_job:daily',
          category: 'agent_job_history',
          type: 'execution_log',
          value: expect.objectContaining({
            subject: 'agent_job:daily',
            history: expect.arrayContaining([
              expect.objectContaining({ status: 'succeeded', attempt: 1 }),
            ]),
          }),
        }),
      }),
    );
  });

  it('retries a failed job with backoff when attempts are below maxRetries', async () => {
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
    expect(sessions.recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessage: 'scheduled_job_failed: provider unavailable',
        actions: [expect.objectContaining({ toolName: 'agent.job.due', success: false })],
      }),
    );

    expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox_1', workspaceId: 'ws_1', status: 'processing' },
        data: expect.objectContaining({
          status: 'pending',
          payload: expect.objectContaining({
            nextRetryAt: expect.stringMatching(/^2026-/),
            lastAttemptAt: expect.stringMatching(/^2026-/),
            lastAttemptError: 'provider unavailable',
          }),
        }),
      }),
    );

    expect(brainEvents.markDispatchFailed).not.toHaveBeenCalled();
    expect(brainEvents.markDispatchSucceeded).not.toHaveBeenCalled();

    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_key: {
            workspaceId: 'ws_1',
            key: 'agent_job_history:agent_job:daily',
          },
        },
        create: expect.objectContaining({
          value: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({
                status: 'failed',
                attempt: 1,
                message: expect.stringContaining('failed_retrying'),
              }),
            ]),
          }),
        }),
      }),
    );
  });

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
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          value: expect.objectContaining({
            history: expect.any(Array),
          }),
        }),
      }),
    );
    const upsertCall = (prisma.kloelMemory.upsert as jest.Mock).mock.calls[0][0];
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
      payload: { jobKey: 'daily', title: 'Daily', prompt: 'do work', toolScope: [], envelope: null },
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

    const updateCall = (prisma.mindOutboxEvent.updateMany as jest.Mock).mock.calls[1][0];
    const payload = updateCall.data.payload;
    const nextRetryAt = new Date(payload.nextRetryAt);

    const expectedDelayMs = Math.min(60_000 * Math.pow(2, 1), 30 * 60_000);
    const expectedRetryTime = new Date(fakeNow.getTime() + expectedDelayMs);

    expect(nextRetryAt.getTime()).toBe(expectedRetryTime.getTime());

    jest.useRealTimers();
  });
});
