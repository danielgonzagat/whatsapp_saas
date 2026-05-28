import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

describe('buildMindSignals — global priors warm-start (PI-K16-A)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const makePrior = (predicate: string, mean: number, samples: number) => ({
    predicate,
    mean,
    samples,
  });

  it('attaches globalPriors when service returns priors', async () => {
    const listTopPriors = jest
      .fn()
      .mockResolvedValue([
        makePrior('user_responds_to_promo', 0.73, 420),
        makePrior('lead_converts_within_7d', 0.41, 315),
      ]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindGlobalPriorService: { listTopPriors },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(listTopPriors).toHaveBeenCalledWith(5);
    expect(result.globalPriors).toEqual([
      { predicate: 'user_responds_to_promo', mean: 0.73, samples: 420 },
      { predicate: 'lead_converts_within_7d', mean: 0.41, samples: 315 },
    ]);
  });

  it('does NOT attach globalPriors when service returns empty array', async () => {
    const listTopPriors = jest.fn().mockResolvedValue([]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindGlobalPriorService: { listTopPriors },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.globalPriors).toBeUndefined();
  });

  it('omits globalPriors key when mindGlobalPriorService is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.globalPriors).toBeUndefined();
  });

  it('omits globalPriors key when listTopPriors is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindGlobalPriorService: {},
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.globalPriors).toBeUndefined();
  });

  it('logs warn and omits key when service throws', async () => {
    const listTopPriors = jest.fn().mockRejectedValue(new Error('db offline'));

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindGlobalPriorService: { listTopPriors },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_global_prior_skipped',
      expect.objectContaining({ reason: 'db offline' }),
    );
    expect(result.globalPriors).toBeUndefined();
  });

  it('coexists with beliefs and other mind signals', async () => {
    const listTopPriors = jest.fn().mockResolvedValue([makePrior('user_clicks_cta', 0.28, 150)]);
    const getActiveBeliefs = jest
      .fn()
      .mockResolvedValue([
        { subject: 'lead-1', predicate: 'interested_in_produto_x', mean: 0.85, variance: 0.1 },
      ]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindBeliefService: { getActiveBeliefs },
        mindGlobalPriorService: { listTopPriors },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.beliefs).toBeDefined();
    expect(result.globalPriors).toBeDefined();
    expect(result.globalPriors).toHaveLength(1);
  });
});
