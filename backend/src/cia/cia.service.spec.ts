jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn() },
}));

import { CiaService } from './cia.service';

describe('CiaService', () => {
  let prisma: {
    kloelMemory: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    accountProofSnapshot: {
      findFirst: jest.Mock;
    };
    conversationProofSnapshot: {
      findFirst: jest.Mock;
    };
  };
  let runtime: {
    getOperationalIntelligence: jest.Mock;
    activateAutopilotTotal: jest.Mock;
    resumeConversationAutonomy: jest.Mock;
  };
  let agentEvents: {
    getRecent: jest.Mock;
    publish: jest.Mock;
  };
  let accountAgent: {
    getRuntime: jest.Mock;
    getCapabilityRegistry: jest.Mock;
    getConversationActionRegistry: jest.Mock;
    listApprovals: jest.Mock;
    approveCatalogApproval: jest.Mock;
    rejectCatalogApproval: jest.Mock;
    listInputSessions: jest.Mock;
    getWorkItems: jest.Mock;
    respondToInputSession: jest.Mock;
  };
  let service: CiaService;

  beforeEach(() => {
    prisma = {
      kloelMemory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      accountProofSnapshot: {
        findFirst: jest.fn(),
      },
      conversationProofSnapshot: {
        findFirst: jest.fn(),
      },
    };
    runtime = {
      getOperationalIntelligence: jest.fn(),
      activateAutopilotTotal: jest.fn(),
      resumeConversationAutonomy: jest.fn(),
    };
    agentEvents = {
      getRecent: jest.fn().mockReturnValue([]),
      publish: jest.fn().mockResolvedValue(undefined),
    };
    accountAgent = {
      getRuntime: jest.fn(),
      getCapabilityRegistry: jest.fn(),
      getConversationActionRegistry: jest.fn(),
      listApprovals: jest.fn(),
      approveCatalogApproval: jest.fn(),
      rejectCatalogApproval: jest.fn(),
      listInputSessions: jest.fn(),
      getWorkItems: jest.fn(),
      respondToInputSession: jest.fn(),
    };

    service = new CiaService(
      prisma as never,
      runtime as never,
      agentEvents as never,
      accountAgent as never,
    );
  });

  it('ignores malformed human_task payloads instead of spreading string characters', async () => {
    prisma.kloelMemory.findMany.mockResolvedValue([
      {
        id: 'mem-1',
        workspaceId: 'ws-1',
        category: 'human_task',
        key: 'task-1',
        value: 'malformed-task-payload',
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      },
    ]);

    const tasks = await service.getHumanTasks('ws-1');

    expect(tasks).toEqual([
      {
        memoryId: 'mem-1',
        key: 'task-1',
        status: 'OPEN',
      },
    ]);
    expect(tasks[0]).not.toHaveProperty('0');
    expect(tasks[0]).not.toHaveProperty('1');
  });

  it('normalizes malformed metadata before persisting approved human tasks', async () => {
    prisma.kloelMemory.findMany.mockResolvedValue([
      {
        id: 'mem-1',
        workspaceId: 'ws-1',
        category: 'human_task',
        key: 'task-1',
        value: {
          id: 'task-1',
          status: 'OPEN',
        },
        metadata: 'broken-metadata',
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      },
    ]);

    await service.approveHumanTask('ws-1', 'task-1', { resume: false });

    expect(prisma.kloelMemory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            status: 'RESOLVED',
            resolvedAt: expect.any(String),
          }),
        }),
      }),
    );

    const metadata = prisma.kloelMemory.update.mock.calls[0]?.[0]?.data?.metadata;
    expect(metadata).not.toHaveProperty('0');
    expect(metadata).not.toHaveProperty('1');
  });
});
