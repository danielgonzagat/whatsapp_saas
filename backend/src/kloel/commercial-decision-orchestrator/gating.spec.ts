import { checkPipelineGate } from './gating';

function makePrisma(overrides: {
  pipelineState?: { state: string; fallbackRate1h: number } | null;
  decisionOutcomeCount?: number;
}) {
  return {
    pipelineState: {
      findUnique: jest.fn().mockResolvedValue(overrides.pipelineState),
      update: jest.fn().mockResolvedValue({ state: 'active', fallbackRate1h: 0 }),
    },
    decisionOutcome: {
      count: jest.fn().mockResolvedValue(overrides.decisionOutcomeCount ?? 0),
    },
  } as never;
}
describe('checkPipelineGate', () => {
  const envKey = 'COMMERCIAL_ORCHESTRATOR_AUTO_GRADUATE';
  const originalEnv = process.env[envKey];

  beforeEach(() => {
    delete process.env[envKey];
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = originalEnv;
    }
  });  it('returns legacy mode when pipelineState is legacy', async () => {
    const prisma = makePrisma({
      pipelineState: { state: 'legacy', fallbackRate1h: 0 },
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('legacy');
    if (result.mode === 'legacy') {
      expect(result.decision.actions).toEqual([]);
      expect(result.decision.trace.delegatedToLegacy).toBe(true);
    }
  });  it('returns active mode when pipelineState is already active', async () => {
    const prisma = makePrisma({
      pipelineState: { state: 'active', fallbackRate1h: 0 },
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('active');
  });  it('returns shadow when pipelineState is shadow and flag is off', async () => {
    process.env[envKey] = 'false';

    const prisma = makePrisma({
      pipelineState: { state: 'shadow', fallbackRate1h: 0 },
      decisionOutcomeCount: 30,
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('shadow');
    expect(prisma.pipelineState.update).not.toHaveBeenCalled();
  });  it('stays shadow with 29 positive-lift outcomes when flag is on', async () => {
    process.env[envKey] = 'true';

    const prisma = makePrisma({
      pipelineState: { state: 'shadow', fallbackRate1h: 0 },
      decisionOutcomeCount: 29,
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('shadow');
    expect(prisma.pipelineState.update).not.toHaveBeenCalled();
  });  it('graduates to active with 30 positive-lift outcomes when flag is on', async () => {
    process.env[envKey] = 'true';

    const prisma = makePrisma({
      pipelineState: { state: 'shadow', fallbackRate1h: 0 },
      decisionOutcomeCount: 30,
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('active');
    expect(prisma.pipelineState.update).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      data: expect.objectContaining({ state: 'active' }),
    });
  });  it('stays shadow with 30+ outcomes when flag is absent (default false)', async () => {
    delete process.env[envKey];

    const prisma = makePrisma({
      pipelineState: { state: 'shadow', fallbackRate1h: 0 },
      decisionOutcomeCount: 40,
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('shadow');
    expect(prisma.pipelineState.update).not.toHaveBeenCalled();
  });  it('does not query decisionOutcome when pipeline is already active', async () => {
    process.env[envKey] = 'true';

    const prisma = makePrisma({
      pipelineState: { state: 'active', fallbackRate1h: 0 },
    });

    const result = await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(result.mode).toBe('active');
    expect(prisma.decisionOutcome.count).not.toHaveBeenCalled();
  });  it('filters count by correct decision types: tom, message_format, objection_response', async () => {
    process.env[envKey] = 'true';

    const prisma = makePrisma({
      pipelineState: { state: 'shadow', fallbackRate1h: 0 },
      decisionOutcomeCount: 30,
    });

    await checkPipelineGate(prisma, 'ws-1', 'whatsapp');

    expect(prisma.decisionOutcome.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: { in: ['tom', 'message_format', 'objection_response'] },
          wonVsBaseline: true,
        }),
      }),
    );
  });});
