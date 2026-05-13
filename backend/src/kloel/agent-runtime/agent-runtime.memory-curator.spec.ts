import { AgentRuntimeMemoryCuratorService } from './agent-runtime.memory-curator';

function makePrisma() {
  return {
    kloelMemory: {
      upsert: jest.fn().mockResolvedValue({}),
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
});
