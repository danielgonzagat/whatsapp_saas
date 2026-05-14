import { AgentRuntimeDelegationService } from './agent-runtime.delegation';
function makeDelegationValue(params: {
  parentSessionId: string;
  childSessionId?: string | null;
  task?: string;
  toolScope?: string[];
  status?: string;
  resultSummary?: string | null;
  error?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}) {
  return {
    kind: 'agent_delegation',
    parentSessionId: params.parentSessionId,
    childSessionId: params.childSessionId ?? null,
    task: params.task ?? 'Run audit',
    toolScope: params.toolScope ?? ['search_agent_memory'],
    status: params.status ?? 'pending',
    resultSummary: params.resultSummary ?? null,
    error: params.error ?? null,
    metadata: null,
    createdAt: params.createdAt ?? '2026-05-13T10:00:00.000Z',
    completedAt: params.completedAt ?? null,
  };
}
describe('AgentRuntimeDelegationService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('creates a pending delegation', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const prisma = {
      kloelMemory: {
        create: jest.fn().mockResolvedValue({
          id: 'mem_1',
          workspaceId: 'ws_1',
          key: 'agent_delegation:del_1',
          value: makeDelegationValue({
            parentSessionId: 'sess_parent',
            createdAt: '2026-05-13T10:00:00.000Z',
          }),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.create({
      workspaceId: 'ws_1',
      parentSessionId: 'sess_parent',
      task: 'Run audit',
      toolScope: ['search_agent_memory'],
    });
    expect(record.status).toBe('pending');
    expect(record.parentSessionId).toBe('sess_parent');
    expect(record.childSessionId).toBeNull();
    expect(record.task).toBe('Run audit');
    expect(record.toolScope).toEqual(['search_agent_memory']);
    expect(record.resultSummary).toBeNull();
    expect(record.error).toBeNull();
    expect(record.completedAt).toBeNull();
  });
  it('creates an accepted delegation when childSessionId is pre-assigned', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const prisma = {
      kloelMemory: {
        create: jest.fn().mockResolvedValue({
          id: 'mem_1',
          workspaceId: 'ws_1',
          key: 'agent_delegation:del_2',
          value: makeDelegationValue({
            parentSessionId: 'sess_parent',
            childSessionId: 'sess_child_1',
            status: 'accepted',
            createdAt: '2026-05-13T10:00:00.000Z',
          }),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.create({
      workspaceId: 'ws_1',
      parentSessionId: 'sess_parent',
      task: 'Run audit',
      toolScope: ['search_agent_memory'],
      childSessionId: 'sess_child_1',
    });
    expect(record.status).toBe('accepted');
    expect(record.childSessionId).toBe('sess_child_1');
  });
  it('accepts a pending delegation', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const value = makeDelegationValue({
      parentSessionId: 'sess_parent',
      status: 'pending',
    });
    const updateManyMock = jest
      .fn<{ count: number }, [Record<string, unknown>]>()
      .mockResolvedValue({ count: 1 });
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_1',
            workspaceId: 'ws_1',
            key: 'agent_delegation:del_3',
            value,
          },
        ]),
        updateMany: updateManyMock,
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.accept({
      workspaceId: 'ws_1',
      parentSessionId: 'sess_parent',
      childSessionId: 'sess_child_2',
    });
    expect(record).not.toBeNull();
    expect(record?.status).toBe('accepted');
    expect(record?.childSessionId).toBe('sess_child_2');
    const updateCall = updateManyMock.mock.calls[0][0];
    const whereArg = updateCall.where as Record<string, unknown>;
    expect(whereArg.workspaceId).toBe('ws_1');
    expect(whereArg.key).toBe('agent_delegation:del_3');
    expect(whereArg.category).toBe('agent_delegation');
    expect(whereArg.type).toBe('delegation');
    const dataArg = updateCall.data as Record<string, unknown>;
    const valueArg = dataArg.value as Record<string, unknown>;
    expect(valueArg.status).toBe('accepted');
    expect(valueArg.childSessionId).toBe('sess_child_2');
  });
  it('returns null when accepting with no pending delegation', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.accept({
      workspaceId: 'ws_1',
      parentSessionId: 'sess_parent',
      childSessionId: 'sess_child',
    });
    expect(record).toBeNull();
  });
  it('transitions an accepted delegation to running', async () => {
    const now = new Date('2026-05-13T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const value = makeDelegationValue({
      parentSessionId: 'sess_parent',
      childSessionId: 'sess_child',
      status: 'accepted',
      createdAt: '2026-05-13T10:00:00.000Z',
    });
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_1',
            workspaceId: 'ws_1',
            key: 'agent_delegation:del_4',
            value,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.transitionToRunning({
      workspaceId: 'ws_1',
      childSessionId: 'sess_child',
    });
    expect(record).not.toBeNull();
    expect(record?.status).toBe('running');
  });
  it('does not transition to running from non-accepted status', async () => {
    const value = makeDelegationValue({
      parentSessionId: 'sess_parent',
      childSessionId: 'sess_child',
      status: 'pending',
    });
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_1',
            workspaceId: 'ws_1',
            key: 'agent_delegation:del_5',
            value,
          },
        ]),
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.transitionToRunning({
      workspaceId: 'ws_1',
      childSessionId: 'sess_child',
    });
    expect(record).toBeNull();
  });
  it('completes with summary', async () => {
    const now = new Date('2026-05-13T10:01:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const value = makeDelegationValue({
      parentSessionId: 'sess_parent',
      childSessionId: 'sess_child',
      status: 'running',
    });
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mem_1',
            workspaceId: 'ws_1',
            key: 'agent_delegation:del_6',
            value,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AgentRuntimeDelegationService(prisma as never);
    const record = await service.completeWithSummary({
      workspaceId: 'ws_1',
      childSessionId: 'sess_child',
      resultSummary: 'Audit found 3 issues, fixed 2.',
    });
    expect(record).not.toBeNull();
    expect(record?.status).toBe('completed');
    expect(record?.resultSummary).toBe('Audit found 3 issues, fixed 2.');
    expect(record?.completedAt).toBe('2026-05-13T10:01:00.000Z');
    expect(record?.error).toBeNull();
  });
});
