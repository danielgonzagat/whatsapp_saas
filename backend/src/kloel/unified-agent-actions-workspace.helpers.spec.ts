import { actionGetWorkspaceStatus } from './unified-agent-actions-workspace.helpers';

type ActionDeps = Parameters<typeof actionGetWorkspaceStatus>[0];

describe('actionGetWorkspaceStatus helper', () => {
  const workspaceId = 'ws-1';

  function buildHarness(overrides: Partial<ActionDeps['prisma']> = {}) {
    const workspaceFindUnique = jest
      .fn<Promise<{ providerSettings: unknown }>, [unknown]>()
      .mockResolvedValue({
        providerSettings: {
          whatsappProvider: 'meta',
          whatsappApiSession: { status: 'connected', sessionName: 'session-1' },
          autopilot: { enabled: true, mode: 'assist' },
        },
      });
    const contactCount = jest.fn<Promise<number>, [unknown]>().mockResolvedValue(12);
    const messageCount = jest.fn<Promise<number>, [unknown]>().mockResolvedValue(34);
    const flowCount = jest.fn<Promise<number>, [unknown]>().mockResolvedValue(2);
    const productCount = jest.fn<Promise<number>, [unknown]>().mockResolvedValue(5);
    const prisma = {
      workspace: {
        findUnique: workspaceFindUnique,
      },
      contact: { count: contactCount },
      message: { count: messageCount },
      flow: { count: flowCount },
      product: { count: productCount },
      ...overrides,
    } as ActionDeps['prisma'];
    return { prisma, workspaceFindUnique, flowCount };
  }

  it('returns requested connections and metrics with healthy status', async () => {
    const { prisma } = buildHarness();

    const result = await actionGetWorkspaceStatus({
      workspaceId,
      args: {},
      prisma,
    });

    expect(result).toMatchObject({
      success: true,
      workspaceId,
      connections: {
        whatsapp: {
          provider: 'meta',
          status: 'connected',
          sessionId: 'session-1',
        },
        autopilot: {
          enabled: true,
          mode: 'assist',
        },
      },
      metrics: {
        totalContacts: 12,
        totalMessages: 34,
        activeFlows: 2,
        products: 5,
      },
      health: {
        status: 'healthy',
        warnings: [],
      },
    });
  });

  it('computes health from live state even when connections and metrics are hidden', async () => {
    const workspaceFindUnique = jest
      .fn<Promise<{ providerSettings: unknown }>, [unknown]>()
      .mockResolvedValue({ providerSettings: {} });
    const flowCount = jest.fn<Promise<number>, [unknown]>().mockResolvedValue(0);
    const { prisma } = buildHarness({
      workspace: {
        findUnique: workspaceFindUnique,
      } as ActionDeps['prisma']['workspace'],
      flow: {
        count: flowCount,
      } as ActionDeps['prisma']['flow'],
    });

    const result = await actionGetWorkspaceStatus({
      workspaceId,
      args: { includeConnections: false, includeMetrics: false, includeHealth: true },
      prisma,
    });

    expect(result.connections).toBeUndefined();
    expect(result.metrics).toBeUndefined();
    expect(result.health).toMatchObject({
      status: 'warning',
      warnings: ['WhatsApp não conectado', 'Nenhum fluxo ativo'],
    });
    expect(workspaceFindUnique).toHaveBeenCalledTimes(1);
    expect(flowCount).toHaveBeenCalledWith({ where: { workspaceId, isActive: true } });
  });
});
