import {
  actionGetWorkspaceStatus,
  broadcastDecisionSource,
  buildAIPersonaData,
  buildAutopilotConfig,
  buildFlowMemoryKey,
  buildFlowMemoryValue,
  buildProductMemoryKey,
  buildProductMemoryUpdate,
  buildProductMemoryValue,
  defaultBroadcastWindowWhenMindUnavailable,
  defaultChannelChoiceWhenMindUnavailable,
  resolveBroadcastChannels,
  resolveBroadcastScheduleAt,
  resolvePredecidedBroadcastWindow,
  resolvePredecidedChannelChoice,
} from './unified-agent-actions-workspace.helpers';

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

describe('resolveBroadcastChannels', () => {
  it('returns the operator-supplied channel when source is set', () => {
    expect(resolveBroadcastChannels({ source: 'INSTAGRAM' })).toEqual(['instagram']);
  });

  it('falls back to the default channel arsenal when source is missing', () => {
    expect(resolveBroadcastChannels({})).toEqual(['whatsapp', 'instagram', 'messenger', 'email']);
  });
});

describe('resolveBroadcastScheduleAt', () => {
  const baseline = new Date('2025-01-08T10:00:00Z');

  it('returns null for pause windows', () => {
    expect(resolveBroadcastScheduleAt('pause', baseline)).toBeNull();
  });

  it('returns the current ISO timestamp for "now"', () => {
    expect(resolveBroadcastScheduleAt('now', baseline)).toBe(baseline.toISOString());
  });

  it('rolls tonight_20h forward when already past 8pm in local time', () => {
    const past8pm = new Date();
    past8pm.setHours(23, 0, 0, 0);
    const result = resolveBroadcastScheduleAt('tonight_20h', past8pm);
    expect(result).not.toBeNull();
    expect(new Date(result as string).getTime()).toBeGreaterThan(past8pm.getTime());
  });

  it('schedules tonight_20h for the same day when before 8pm local', () => {
    const before8pm = new Date();
    before8pm.setHours(10, 0, 0, 0);
    const result = resolveBroadcastScheduleAt('tonight_20h', before8pm);
    expect(result).not.toBeNull();
    const scheduled = new Date(result as string);
    expect(scheduled.getHours()).toBe(20);
    expect(scheduled.getDate()).toBe(before8pm.getDate());
  });

  it('snaps friday_21h to the next Friday', () => {
    const wednesday = new Date('2025-01-08T10:00:00Z');
    const result = resolveBroadcastScheduleAt('friday_21h', wednesday);
    expect(result && new Date(result).getDay()).toBe(5);
  });

  it('defaults to next-day 9am for unknown windows', () => {
    const result = resolveBroadcastScheduleAt('unknown', baseline);
    expect(result && new Date(result).getDate()).toBe(baseline.getDate() + 1);
  });
});

describe('resolvePredecidedChannelChoice', () => {
  it('honors predecided channel and confidence', () => {
    expect(
      resolvePredecidedChannelChoice(
        { channel: 'email', confidence: 0.9, fallback: false },
        ['whatsapp', 'email'],
      ),
    ).toEqual({ channel: 'email', confidence: 0.9, fallback: false });
  });

  it('falls back to the first available channel and zero confidence', () => {
    expect(resolvePredecidedChannelChoice(null, ['messenger', 'whatsapp'])).toEqual({
      channel: 'messenger',
      confidence: 0,
      fallback: false,
    });
  });

  it('falls back to whatsapp when no channels are available', () => {
    expect(resolvePredecidedChannelChoice(null, [])).toEqual({
      channel: 'whatsapp',
      confidence: 0,
      fallback: false,
    });
  });
});

describe('resolvePredecidedBroadcastWindow', () => {
  it('honors the predecided window verbatim', () => {
    expect(
      resolvePredecidedBroadcastWindow(
        { window: 'tonight_20h', confidence: 0.75, fallback: false },
        undefined,
      ),
    ).toEqual({ window: 'tonight_20h', confidence: 0.75, fallback: false });
  });

  it('defaults to operator_fixed when scheduleAt is provided', () => {
    expect(resolvePredecidedBroadcastWindow(null, '2025-01-08T11:00:00Z')).toEqual({
      window: 'operator_fixed',
      confidence: 0,
      fallback: false,
    });
  });

  it('defaults to now when no scheduleAt is provided', () => {
    expect(resolvePredecidedBroadcastWindow(null, undefined)).toEqual({
      window: 'now',
      confidence: 0,
      fallback: false,
    });
  });
});

describe('Mind-unavailable defaults', () => {
  it('defaultChannelChoiceWhenMindUnavailable falls back to first channel', () => {
    expect(defaultChannelChoiceWhenMindUnavailable(['email'])).toEqual({
      channel: 'email',
      confidence: 0,
      fallback: true,
    });
  });

  it('defaultBroadcastWindowWhenMindUnavailable reflects scheduleAt presence', () => {
    expect(defaultBroadcastWindowWhenMindUnavailable('2025-01-08T11:00:00Z')).toEqual({
      window: 'operator_fixed',
      confidence: 0,
      fallback: true,
    });
    expect(defaultBroadcastWindowWhenMindUnavailable(undefined)).toEqual({
      window: 'now',
      confidence: 0,
      fallback: true,
    });
  });
});

describe('AI persona and autopilot builders', () => {
  const now = new Date('2025-01-08T10:00:00Z');

  it('buildAIPersonaData fills in defaults when args are sparse', () => {
    expect(buildAIPersonaData({}, now)).toEqual({
      name: 'KLOEL',
      personality: 'Profissional, amigável e focada em resultados',
      tone: 'friendly',
      language: 'pt-BR',
      useEmojis: true,
      updatedAt: now.toISOString(),
    });
  });

  it('buildAIPersonaData passes through operator overrides', () => {
    expect(buildAIPersonaData({ name: 'Atendente', tone: 'casual', useEmojis: false }, now)).toEqual(
      {
        name: 'Atendente',
        personality: 'Profissional, amigável e focada em resultados',
        tone: 'casual',
        language: 'pt-BR',
        useEmojis: false,
        updatedAt: now.toISOString(),
      },
    );
  });

  it('buildAutopilotConfig defaults mode to full and workingHoursOnly to false', () => {
    expect(buildAutopilotConfig({ enabled: true }, now)).toEqual({
      enabled: true,
      mode: 'full',
      workingHoursOnly: false,
      updatedAt: now.toISOString(),
      updatedBy: 'kloel-ai',
    });
  });
});

describe('Product memory builders', () => {
  const now = new Date('2025-01-08T10:00:00Z');

  it('buildProductMemoryKey slugifies the name with a timestamp prefix', () => {
    expect(buildProductMemoryKey({ name: 'Hello World' }, now)).toBe(
      `product_${now.getTime()}_hello_world`,
    );
  });

  it('buildProductMemoryValue defaults description, category, and active', () => {
    expect(buildProductMemoryValue({ name: 'X', price: 10 }, now)).toEqual({
      name: 'X',
      price: 10,
      description: '',
      category: 'default',
      imageUrl: null,
      paymentLink: null,
      active: true,
      createdAt: now.toISOString(),
    });
  });

  it('buildProductMemoryUpdate merges partial fields and stamps updatedAt', () => {
    const current = { name: 'old', price: 1 } as Record<string, unknown>;
    const result = buildProductMemoryUpdate(current, { price: 2, active: false }, now);
    expect(result).toMatchObject({
      name: 'old',
      price: 2,
      active: false,
      updatedAt: now.toISOString(),
    });
  });
});

describe('Flow memory builders', () => {
  const now = new Date('2025-01-08T10:00:00Z');

  it('buildFlowMemoryKey slugifies the flow name', () => {
    expect(buildFlowMemoryKey({ name: 'Welcome New' }, now)).toBe(
      `flow_${now.getTime()}_welcome_new`,
    );
  });

  it('buildFlowMemoryValue normalizes nulls and defaults', () => {
    expect(buildFlowMemoryValue({ name: 'F', trigger: 'keyword' }, now)).toEqual({
      name: 'F',
      trigger: 'keyword',
      triggerValue: null,
      steps: [],
      active: true,
      createdAt: now.toISOString(),
    });
  });
});

describe('broadcastDecisionSource', () => {
  it('tags orchestrator-predecided when true', () => {
    expect(broadcastDecisionSource(true)).toBe('orchestrator_predecided');
  });

  it('tags legacy_action_decision otherwise', () => {
    expect(broadcastDecisionSource(false)).toBe('legacy_action_decision');
  });
});
