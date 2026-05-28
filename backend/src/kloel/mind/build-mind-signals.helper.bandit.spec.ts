import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

describe('buildMindSignals — bandit strategy (PI-K14-B)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('attaches strategy when bandit returns an arm', async () => {
    const selectArm = jest.fn().mockResolvedValue({
      arm: 'social_proof',
      confidence: 0.72,
      rationale: 'Exploiting arm "social_proof" (mean reward 72% over 45 pulls)',
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindBanditService: { selectArm },
        logger: mockLogger,
      },
      'ws-1',
      'quero vender mais',
    );

    expect(selectArm).toHaveBeenCalledWith('ws-1', 'chat_strategy');
    expect(result.strategy).toEqual({
      arm: 'social_proof',
      confidence: 0.72,
      rationale: 'Exploiting arm "social_proof" (mean reward 72% over 45 pulls)',
    });
  });

  it('does NOT attach strategy when mindBanditService is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.strategy).toBeUndefined();
  });

  it('does NOT attach strategy when selectArm returns null', async () => {
    const selectArm = jest.fn().mockResolvedValue(null);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindBanditService: { selectArm },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.strategy).toBeUndefined();
  });

  it('tolerates selectArm failure gracefully (logs and skips)', async () => {
    const selectArm = jest.fn().mockRejectedValue(new Error('bandit db offline'));

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindBanditService: { selectArm },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_mind_bandit_skipped',
      expect.objectContaining({ reason: 'bandit db offline' }),
    );
    expect(result.strategy).toBeUndefined();
  });

  it('fills default rationale when bandit result omits rationale', async () => {
    const selectArm = jest.fn().mockResolvedValue({
      arm: 'scarcity',
      confidence: 0.55,
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindBanditService: { selectArm },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.strategy).toEqual({
      arm: 'scarcity',
      confidence: 0.55,
      rationale: 'Bandit selected arm "scarcity"',
    });
  });

  it('coexists with other mind signals (riskClass still populates)', async () => {
    const selectArm = jest.fn().mockResolvedValue({
      arm: 'ancoragem',
      confidence: 0.68,
      rationale: 'Exploiting arm "ancoragem"',
    });
    const classify = jest.fn().mockReturnValue({
      class: 'R1' as const,
      autonomyMode: 'allowed_alone' as const,
      requiredEvidenceLevel: 'N1' as const,
      rollback: ['revert_locally'],
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindBanditService: { selectArm },
        riskClassService: { classify },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.strategy).toBeDefined();
    expect(result.riskClass).toBeDefined();
    expect(result.strategy!.arm).toBe('ancoragem');
    expect(result.riskClass!.tier).toBe('R1');
  });
});
