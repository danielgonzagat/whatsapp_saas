import { AgentRuntimeJobRunnerService } from './agent-runtime.job-runner';

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
        findMany: jest.fn(),
      },
    };
    const brainEvents = {
      claimPendingEvents: jest.fn().mockResolvedValue({ events: [event] }),
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
    expect(brainEvents.claimPendingEvents).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      eventType: 'agent.job.due',
      limit: 5,
    });
    expect(kloel.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        mode: 'chat',
        message: 'Review operational memory.',
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
    expect(brainEvents.markDispatchSucceeded).toHaveBeenCalledWith('outbox_1', 'ws_1');
  });

  it('marks failed jobs and persists failure memory when Kloel execution throws', async () => {
    const event = {
      id: 'outbox_1',
      eventType: 'agent.job.due',
      subject: 'agent_job:daily',
      payload: {
        jobKey: 'daily',
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
    const brainEvents = {
      claimPendingEvents: jest.fn().mockResolvedValue({ events: [event] }),
      markDispatchSucceeded: jest.fn(),
      markDispatchFailed: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = {
      recordTurn: jest.fn().mockResolvedValue('agent_turn:job'),
    };
    const kloel = {
      thinkSync: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const service = new AgentRuntimeJobRunnerService(
      { mindOutboxEvent: { findMany: jest.fn() } } as never,
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
    expect(brainEvents.markDispatchFailed).toHaveBeenCalledWith(
      'outbox_1',
      'ws_1',
      'provider unavailable',
    );
  });
});
