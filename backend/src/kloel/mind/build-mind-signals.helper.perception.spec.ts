import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

describe('buildMindSignals — perception (PI-K16-C)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const stubbedPerception = {
    subject: 'pricing',
    intent: 'purchase_intent',
    salience: 0.65,
    semanticContext: {
      source: 'chat',
      channel: 'kloel_chat',
      workspaceId: 'ws-1',
      length: 21,
      hasQuestion: true,
      hasUrgency: false,
    },
  };

  it('attaches perception when mindPerceptionService is present', async () => {
    const perceive = jest.fn().mockReturnValue(stubbedPerception);
    const result = await buildMindSignals(
      { prisma: mockPrisma(), mindPerceptionService: { perceive }, logger: mockLogger },
      'ws-1',
      'quanto custa o curso?',
    );
    expect(perceive).toHaveBeenCalledWith({
      source: 'chat',
      channel: 'kloel_chat',
      raw: 'quanto custa o curso?',
      workspaceId: 'ws-1',
    });
    expect(result.perception).toEqual(stubbedPerception);
  });

  it('omits perception key when mindPerceptionService is absent', async () => {
    const result = await buildMindSignals(
      { prisma: mockPrisma(), logger: mockLogger },
      'ws-1',
      'oi tudo bem?',
    );
    expect(result.perception).toBeUndefined();
  });

  it('omits perception key when perceive is absent', async () => {
    const result = await buildMindSignals(
      { prisma: mockPrisma(), mindPerceptionService: {}, logger: mockLogger },
      'ws-1',
      'hello',
    );
    expect(result.perception).toBeUndefined();
  });

  it('logs warn and omits key when perceive throws', async () => {
    const perceive = jest.fn().mockImplementation(() => {
      throw new Error('perception engine offline');
    });
    const result = await buildMindSignals(
      { prisma: mockPrisma(), mindPerceptionService: { perceive }, logger: mockLogger },
      'ws-1',
      'quero comprar',
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_mind_perception_skipped',
      expect.objectContaining({ reason: 'perception engine offline' }),
    );
    expect(result.perception).toBeUndefined();
  });

  it('coexists with other mind signals', async () => {
    const perceive = jest.fn().mockReturnValue(stubbedPerception);
    const selectArm = jest
      .fn()
      .mockResolvedValue({ arm: 'social_proof', confidence: 0.72, rationale: 'Exploiting' });
    const classify = jest.fn().mockReturnValue({
      class: 'R1',
      autonomyMode: 'allowed_alone',
      requiredEvidenceLevel: 'N1',
      rollback: ['revert_locally'],
    });
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindPerceptionService: { perceive },
        mindBanditService: { selectArm },
        riskClassService: { classify },
        logger: mockLogger,
      },
      'ws-1',
      'quero comprar',
    );
    expect(result.perception).toBeDefined();
    expect(result.strategy).toBeDefined();
    expect(result.riskClass).toBeDefined();
  });
});
