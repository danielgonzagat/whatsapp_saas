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
    metaConnection: {
      findMany: jest.Mock;
    };
    integration: {
      findMany: jest.Mock;
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
  let mind: {
    lift: jest.Mock;
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
      metaConnection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
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
    mind = {
      lift: jest.fn().mockResolvedValue(null),
    };

    service = new CiaService(
      prisma as never,
      runtime as never,
      agentEvents as never,
      accountAgent as never,
      mind as never,
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

  describe('getSurface subtitle', () => {
    const baseIntelligence = {
      workspaceName: 'Test Workspace',
      runtime: { state: 'RUNNING' },
      autonomy: null,
      businessState: null,
      marketSignals: [],
      humanTasks: [],
      demandStates: [],
      insights: [],
    };

    beforeEach(() => {
      runtime.getOperationalIntelligence.mockResolvedValue(baseIntelligence);
      accountAgent.getRuntime.mockResolvedValue(null);
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelMemory.findUnique.mockResolvedValue(null);
      prisma.accountProofSnapshot.findFirst.mockResolvedValue(null);
      accountAgent.getCapabilityRegistry.mockReturnValue([]);
      accountAgent.getConversationActionRegistry.mockReturnValue([]);
    });

    it('uses neutral subtitle when no channels are connected', async () => {
      prisma.metaConnection.findMany.mockResolvedValue([]);
      prisma.integration.findMany.mockResolvedValue([]);

      const surface = await service.getSurface('ws-1');

      expect(surface.subtitle).toBe('Cuidando do seu negócio');
    });

    it('uses WhatsApp-specific subtitle when only WhatsApp is connected', async () => {
      prisma.metaConnection.findMany.mockResolvedValue([
        {
          whatsappPhoneNumberId: '5511999999999',
          whatsappBusinessId: '123',
          instagramAccountId: null,
          pageId: null,
        },
      ]);
      prisma.integration.findMany.mockResolvedValue([]);

      const surface = await service.getSurface('ws-1');

      expect(surface.subtitle).toBe('Cuidando do seu negócio no WhatsApp');
    });

    it('uses Instagram subtitle when only Instagram is connected', async () => {
      prisma.metaConnection.findMany.mockResolvedValue([
        {
          whatsappPhoneNumberId: null,
          whatsappBusinessId: null,
          instagramAccountId: '12345',
          pageId: null,
        },
      ]);
      prisma.integration.findMany.mockResolvedValue([]);

      const surface = await service.getSurface('ws-1');

      expect(surface.subtitle).toBe('Cuidando do seu negócio no Instagram');
    });

    it('uses Facebook subtitle when only Facebook is connected', async () => {
      prisma.metaConnection.findMany.mockResolvedValue([
        {
          whatsappPhoneNumberId: null,
          whatsappBusinessId: null,
          instagramAccountId: null,
          pageId: 'fb-page-123',
        },
      ]);
      prisma.integration.findMany.mockResolvedValue([]);

      const surface = await service.getSurface('ws-1');

      expect(surface.subtitle).toBe('Cuidando do seu negócio no Facebook');
    });

    it('uses omnichannel subtitle when multiple channels are connected', async () => {
      prisma.metaConnection.findMany.mockResolvedValue([
        {
          whatsappPhoneNumberId: '5511999999999',
          whatsappBusinessId: '123',
          instagramAccountId: '12345',
          pageId: 'fb-page-123',
        },
      ]);
      prisma.integration.findMany.mockResolvedValue([]);

      const surface = await service.getSurface('ws-1');

      expect(surface.subtitle).toBe('Orquestrando seus canais de venda');
    });

    it('combines MetaConnection and Integration channels without duplicates', async () => {
      prisma.metaConnection.findMany.mockResolvedValue([
        {
          whatsappPhoneNumberId: '5511999999999',
          whatsappBusinessId: '123',
          instagramAccountId: null,
          pageId: null,
        },
      ]);
      prisma.integration.findMany.mockResolvedValue([{ type: 'INSTAGRAM' }, { type: 'STRIPE' }]);

      const surface = await service.getSurface('ws-1');

      expect(surface.subtitle).toBe('Orquestrando seus canais de venda');
    });

    it('keeps subtitles channel neutral', async () => {
      const subtitles: string[] = [];
      const scenarios = [
        { meta: null, integrations: [] },
        { meta: { whatsappPhoneNumberId: 'x', pageId: 'y' }, integrations: [] },
        { meta: { instagramAccountId: 'z' }, integrations: [] },
        { meta: null, integrations: [{ type: 'INSTAGRAM' }] },
      ];

      for (const scenario of scenarios) {
        prisma.metaConnection.findMany.mockResolvedValue(scenario.meta ? [scenario.meta] : []);
        prisma.integration.findMany.mockResolvedValue(scenario.integrations);
        const surface = await service.getSurface('ws-1');
        subtitles.push(surface.subtitle);
      }

      const hardcodedFound = subtitles.some((s) =>
        s.toLowerCase().includes('trabalhando no seu whatsapp'),
      );
      expect(hardcodedFound).toBe(false);
    });
  });

  describe('MIND delegation', () => {
    const baseIntelligence = {
      workspaceName: 'Test Workspace',
      runtime: { state: 'RUNNING' },
      autonomy: null,
      businessState: null,
      marketSignals: [],
      humanTasks: [],
      demandStates: [],
      insights: [],
    };

    beforeEach(() => {
      runtime.getOperationalIntelligence.mockResolvedValue(baseIntelligence);
      accountAgent.getRuntime.mockResolvedValue(null);
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelMemory.findUnique.mockResolvedValue(null);
      prisma.accountProofSnapshot.findFirst.mockResolvedValue(null);
      prisma.metaConnection.findMany.mockResolvedValue([]);
      prisma.integration.findMany.mockResolvedValue([]);
      accountAgent.getCapabilityRegistry.mockReturnValue([]);
      accountAgent.getConversationActionRegistry.mockReturnValue([]);
    });

    it('includes mindLift in surface when MIND lift returns data', async () => {
      mind.lift.mockResolvedValue({
        n: 42,
        mindMean: 0.78,
        baselineMean: 0.65,
        lift: 0.2,
        pZScore: 1.96,
      });

      const surface = await service.getSurface('ws-1');

      expect(surface).toHaveProperty('mindLift');
      expect(surface.mindLift).toEqual({
        decisionType: 'followup_timing',
        n: 42,
        mindMean: 0.78,
        baselineMean: 0.65,
        lift: 0.2,
        pZScore: 1.96,
      });
    });

    it('returns null mindLift when MIND lift fails gracefully', async () => {
      mind.lift.mockRejectedValue(new Error('MIND not available'));

      const surface = await service.getSurface('ws-1');

      expect(surface).toHaveProperty('mindLift');
      expect(surface.mindLift).toBeNull();
    });

    it('returns null mindLift when MIND lift returns null', async () => {
      mind.lift.mockResolvedValue(null);

      const surface = await service.getSurface('ws-1');

      expect(surface.mindLift).toBeNull();
    });

    it('delegates to mind.lift with correct workspace id', async () => {
      mind.lift.mockResolvedValue(null);

      await service.getSurface('ws-42');

      expect(mind.lift).toHaveBeenCalledWith('ws-42', 'followup_timing');
    });

    it('getSurface completes even when mind.lift throws', async () => {
      mind.lift.mockRejectedValue(new Error('connection refused'));

      const surface = await service.getSurface('ws-1');

      expect(surface.title).toBe('KLOEL');
      expect(surface.state).toBe('RUNNING');
      expect(surface.mindLift).toBeNull();
    });
  });
});
