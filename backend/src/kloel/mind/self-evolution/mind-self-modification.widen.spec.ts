import { MindSelfModificationService } from './mind-self-modification.service';

/**
 * Covers item 3: widening opportunity detection so the self-evolution loop is
 * not starved. Two axes:
 *  - the recurrence floor drop (NOW 2, env-tunable) makes sparse prod windows
 *    actually yield predicate-recurrent-miss opportunities;
 *  - the flag-gated belief-drift + bandit-underperformance signals surface
 *    opportunities from durable learning state when KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS=true.
 */
describe('MindSelfModificationService — widened opportunity detection (item 3)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('surfaces a recurrent-miss at 2 occurrences (floor lowered from 3) with widen flag OFF', async () => {
    delete process.env.KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS;
    const prisma = {
      mindPrediction: {
        findMany: jest.fn().mockResolvedValue([
          { predicate: 'P(reply|template,hour)', surprise: 0.9 },
          { predicate: 'P(reply|template,hour)', surprise: 1.1 },
        ]),
      },
      // Intentionally NO mindBelief / mindBanditArm — proves the widen path is
      // not touched when the flag is off.
    };
    const service = new MindSelfModificationService(prisma as never);

    const proposal = await service.proposeOptimization('ws-floor');

    const recurrent = proposal.opportunities.find((o) => o.kind === 'predicate-recurrent-miss');
    expect(recurrent).toBeDefined();
    expect(recurrent?.rationale).toContain('P(reply|template,hour)');
  });

  it('does NOT query belief/bandit tables when the widen flag is off', async () => {
    delete process.env.KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS;
    const beliefFindMany = jest.fn();
    const banditFindMany = jest.fn();
    const prisma = {
      mindPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      mindBelief: { findMany: beliefFindMany },
      mindBanditArm: { findMany: banditFindMany },
    };
    const service = new MindSelfModificationService(prisma as never);

    const proposal = await service.proposeOptimization('ws-off');

    expect(proposal.opportunities).toEqual([]);
    expect(beliefFindMany).not.toHaveBeenCalled();
    expect(banditFindMany).not.toHaveBeenCalled();
  });

  it('surfaces belief-drift and bandit-underperformance when the widen flag is on', async () => {
    process.env.KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS = 'true';
    const prisma = {
      mindPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      mindBelief: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ predicate: 'P(churn|silence)', variance: 0.4, samples: 30 }]),
      },
      mindBanditArm: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ decisionType: 'reply', arm: 'aggressive', pulls: 40, wins: 4 }]),
      },
    };
    const service = new MindSelfModificationService(prisma as never);

    const proposal = await service.proposeOptimization('ws-on');

    const drift = proposal.opportunities.find((o) => o.kind === 'belief-drift');
    const bandit = proposal.opportunities.find((o) => o.kind === 'bandit-underperformance');
    expect(drift).toBeDefined();
    expect(drift?.estimatedImpact).toBe('high'); // variance 0.4 >= 0.35
    expect(drift?.rationale).toContain('P(churn|silence)');
    expect(bandit).toBeDefined();
    expect(bandit?.rationale).toContain('reply');
    // win-rate 4/40 = 10% <= 0.1 → high impact
    expect(bandit?.estimatedImpact).toBe('high');
  });

  it('degrades gracefully when belief/bandit tables are absent on the prisma surface', async () => {
    process.env.KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS = 'true';
    const prisma = {
      mindPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      // no mindBelief / mindBanditArm methods at all
    };
    const service = new MindSelfModificationService(prisma as never);

    await expect(service.proposeOptimization('ws-degraded')).resolves.toEqual({
      opportunities: [],
    });
  });

  it('skips well-performing arms and converged beliefs (conservative gates)', async () => {
    process.env.KLOEL_SELF_EVOLUTION_WIDEN_SIGNALS = 'true';
    const prisma = {
      mindPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      mindBelief: {
        // low variance / too few samples → not a drift candidate
        findMany: jest.fn().mockResolvedValue([]),
      },
      mindBanditArm: {
        findMany: jest.fn().mockResolvedValue([
          { decisionType: 'reply', arm: 'good', pulls: 50, wins: 45 }, // 90% win-rate
        ]),
      },
    };
    const service = new MindSelfModificationService(prisma as never);

    const proposal = await service.proposeOptimization('ws-healthy');
    expect(proposal.opportunities).toEqual([]);
  });
});
