import { AgentRuntimeContextCompressorService } from './agent-runtime.context-compressor';

function makePrisma() {
  return {
    kloelMemory: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

function makeMemoryManager() {
  return {
    onPreCompress: jest.fn().mockResolvedValue('<provider-insight>known checkout gap</provider-insight>'),
  };
}

describe('AgentRuntimeContextCompressorService', () => {
  it('detects when a message set exceeds the compression budget', () => {
    const service = new AgentRuntimeContextCompressorService(
      makePrisma() as never,
      makeMemoryManager() as never,
    );

    expect(
      service.shouldCompress(
        [
          { role: 'user', content: 'a'.repeat(200) },
          { role: 'assistant', content: 'b'.repeat(200) },
        ],
        300,
      ),
    ).toBe(true);
  });

  it('builds and persists a reference-only compressed context summary', async () => {
    const prisma = makePrisma();
    const memoryManager = makeMemoryManager();
    const service = new AgentRuntimeContextCompressorService(
      prisma as never,
      memoryManager as never,
    );

    const result = await service.compressAndPersist({
      workspaceId: 'ws_1',
      sessionId: 'thread_1',
      activeTask: 'recover checkout',
      messages: [
        { role: 'user', content: 'checkout failed', createdAt: '2026-05-13T00:00:00.000Z' },
        { role: 'assistant', content: 'I inspected checkout.' },
        { role: 'tool', toolName: 'test', content: 'npm test passed' },
        { role: 'assistant', content: 'pending webhook proof' },
      ],
    });

    expect(result?.summary).toContain('REFERENCE ONLY');
    expect(result?.summary).toContain('## Active Task');
    expect(result?.summary).toContain('recover checkout');
    expect(result?.summary).toContain('known checkout gap');
    expect(memoryManager.onPreCompress).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      sessionId: 'thread_1',
      messages: [
        { role: 'user', content: 'checkout failed' },
        { role: 'assistant', content: 'I inspected checkout.' },
        { role: 'tool', content: 'npm test passed' },
        { role: 'assistant', content: 'pending webhook proof' },
      ],
    });
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_key: { workspaceId: 'ws_1', key: 'agent_compressed_context:thread_1' } },
        update: expect.objectContaining({
          category: 'agent_curated',
          type: 'context_summary',
          content: expect.stringContaining('REFERENCE ONLY'),
        }),
      }),
    );
  });

  it('loads a persisted compressed context with source freshness metadata', async () => {
    const prisma = makePrisma();
    const updatedAt = new Date();
    prisma.kloelMemory.findUnique.mockResolvedValue({
      key: 'agent_compressed_context:thread_1',
      content: 'summary',
      value: { messageCount: 4 },
      updatedAt,
    });
    const service = new AgentRuntimeContextCompressorService(
      prisma as never,
      makeMemoryManager() as never,
    );

    const result = await service.loadCompressedContext('ws_1', 'thread_1');

    expect(result).toEqual(
      expect.objectContaining({
        key: 'agent_compressed_context:thread_1',
        workspaceId: 'ws_1',
        sessionId: 'thread_1',
        summary: 'summary',
        messageCount: 4,
      }),
    );
    expect(result?.source.truthMode).toBe('observed');
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_key: { workspaceId: 'ws_1', key: 'agent_compressed_context:thread_1' } },
      }),
    );
  });
});
