import { AgentRuntimeMemoryCuratorService } from './agent-runtime.memory-curator';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    kloelMemory: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      ...overrides,
    },
  };
}

describe('AgentRuntimeMemoryCuratorService', () => {
  it('persists failed tool outcomes as curated operational memory', async () => {
    const prisma = makePrisma();
    const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

    const key = await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'dashboard:chat',
      userMessage: 'run job',
      assistantMessage: 'scheduled_job_failed: timeout',
      threadId: 'thread_1',
      actions: [{ toolName: 'agent.job.due', success: false, result: { error: 'timeout' } }],
    });

    expect(key).toMatch(/^agent_curated_turn:/);
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_key: expect.objectContaining({ workspaceId: 'ws_1' }),
        }),
        create: expect.objectContaining({
          category: 'agent_curated',
          type: 'action_failure',
          content: expect.stringContaining('failedTools=agent.job.due'),
          metadata: expect.objectContaining({
            kind: 'agent_curated_turn',
            insightKind: 'action_failure',
            threadId: 'thread_1',
          }),
        }),
      }),
    );
  });

  it('persists unresolved operational context without saving ordinary turns', async () => {
    const prisma = makePrisma();
    const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

    const unresolvedKey = await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      contactId: 'contact_1',
      userMessage: 'checkout',
      assistantMessage: 'Webhook proof is pending.',
    });
    const ordinaryKey = await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      userMessage: 'hello',
      assistantMessage: 'Olá.',
    });

    expect(unresolvedKey).toMatch(/^agent_curated_turn:/);
    expect(ordinaryKey).toBeNull();
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns null instead of throwing when persistence fails', async () => {
    const prisma = makePrisma();
    prisma.kloelMemory.upsert.mockRejectedValue(new Error('db down'));
    const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

    const key = await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'dashboard:chat',
      userMessage: 'blocked',
      assistantMessage: 'blocked by policy',
    });

    expect(key).toBeNull();
  });

  it('includes confidence and retentionScore in curated memory value', async () => {
    const prisma = makePrisma();
    const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

    await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      userMessage: 'checkout',
      assistantMessage: 'Webhook proof is pending.',
    });

    expect(prisma.kloelMemory.upsert).toHaveBeenCalled();
    const callArg = prisma.kloelMemory.upsert.mock.calls[0][0];
    expect(typeof callArg.create.value.confidence).toBe('number');
    expect(typeof callArg.create.value.retentionScore).toBe('number');
    expect(typeof callArg.create.metadata.curatedConfidence).toBe('number');
    expect(typeof callArg.create.metadata.ttlMs).toBe('number');
    expect(typeof callArg.create.metadata.retentionScore).toBe('number');
  });

  it('assigns higher confidence to action_failure than unresolved context', async () => {
    const prisma = makePrisma();
    const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

    await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      userMessage: 'test',
      assistantMessage: 'Webhook proof is pending.',
    });
    const unresolvedCall = prisma.kloelMemory.upsert.mock.calls[0][0];

    await curator.curateTurnOutcome({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      userMessage: 'test',
      assistantMessage: 'failed',
      actions: [{ toolName: 'send_message', success: false }],
    });
    const failureCall = prisma.kloelMemory.upsert.mock.calls[1][0];

    const unresolvedC = (unresolvedCall.create.value as Record<string, unknown>)
      .confidence as number;
    const failureC = (failureCall.create.value as Record<string, unknown>).confidence as number;
    expect(failureC).toBeGreaterThan(unresolvedC);
  });

  describe('cleanupStaleMemories', () => {
    it('returns empty hygiene result when no curated memories exist', async () => {
      const prisma = makePrisma();
      const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

      const result = await curator.cleanupStaleMemories('ws_1');

      expect(result.inspected).toBe(0);
      expect(result.expired).toBe(0);
      expect(result.retained).toBe(0);
      expect(result.staleKeys).toEqual([]);
      expect(result.errors).toBe(0);
    });

    it('marks retired memories with low retention as expired', async () => {
      const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      const prisma = makePrisma({
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_a',
            key: 'agent_curated_turn:abc123',
            createdAt: oldDate,
            metadata: { ttlMs: 90 * 24 * 60 * 60 * 1000, retentionScore: 0.1 },
          },
        ]),
      });
      const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

      const result = await curator.cleanupStaleMemories('ws_1', { minRetentionScore: 0.3 });

      expect(result.inspected).toBe(1);
      expect(result.expired).toBe(1);
      expect(result.staleKeys).toContain('agent_curated_turn:abc123');
      expect(prisma.kloelMemory.update).toHaveBeenCalledTimes(1);
      const updateCall = prisma.kloelMemory.update.mock.calls[0][0];
      expect(updateCall).toMatchObject({
        where: { id: 'mem_a' },
        data: {
          metadata: {
            hygieneState: 'retired',
          },
        },
      });
      expect(typeof updateCall.data.metadata.retiredAt).toBe('string');
    });

    it('retains fresh memories', async () => {
      const freshDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const prisma = makePrisma({
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_fresh',
            key: 'agent_curated_turn:fresh',
            createdAt: freshDate,
            metadata: { ttlMs: 180 * 24 * 60 * 60 * 1000, retentionScore: 0.5 },
          },
        ]),
      });
      const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

      const result = await curator.cleanupStaleMemories('ws_1');

      expect(result.inspected).toBe(1);
      expect(result.expired).toBe(0);
      expect(result.retained).toBe(1);
    });

    it('handles prisma errors gracefully', async () => {
      const prisma = makePrisma({
        findMany: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

      const result = await curator.cleanupStaleMemories('ws_1');

      expect(result.errors).toBe(1);
      expect(result.completedAt).toBeDefined();
    });

    it('respects maxItems option', async () => {
      const prisma = makePrisma();
      const curator = new AgentRuntimeMemoryCuratorService(prisma as never);

      await curator.cleanupStaleMemories('ws_1', { maxItems: 10 });

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });
  });
});
