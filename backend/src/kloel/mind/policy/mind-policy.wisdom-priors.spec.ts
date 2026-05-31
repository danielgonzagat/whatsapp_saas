import { MindPolicyService } from './mind-policy.service';
import { WisdomRelevanceFilter } from '../../wisdom/wisdom-relevance-filter.service';
import { WisdomPatternStore } from '../../wisdom/wisdom-pattern-store.service';
import type { WisdomPattern } from '../../wisdom/wisdom.types';
import { buildBeliefs, buildPrisma } from './mind-policy.service.spec-helpers';

describe('MindPolicyService — wisdom priors (CIA Gap 9)', () => {
  function makeWisdomPattern(overrides: Partial<WisdomPattern> = {}): WisdomPattern {
    return {
      patternId: 'pat_test_1',
      description: 'Test wisdom pattern',
      applicableConditions: [],
      evidenceWorkspacesCount: 10,
      confidence: 0.8,
      signalKind: 'reply_rate',
      taxonomy: {
        verticalHint: undefined,
        tickethint: undefined,
        stageHint: undefined,
        channelHint: 'whatsapp',
      },
      ...overrides,
    };
  }

  it('shifts belief mean toward prior target when wisdom pattern matches', async () => {
    const prisma = buildPrisma();
    const beliefs = buildBeliefs([
      { mean: 0.5, variance: 0.1 },
      { mean: 0.5, variance: 0.1 },
    ]);

    const pattern = makeWisdomPattern({
      signalKind: 'reply_rate',
      confidence: 0.8,
    });

    const wisdomFilter = new WisdomRelevanceFilter();
    const wisdomStore = new WisdomPatternStore();
    wisdomStore.setPatterns([pattern]);

    const service = new MindPolicyService(
      prisma as never,
      beliefs as never,
      undefined,
      wisdomFilter,
      wisdomStore,
    );

    const result = await service.choose({
      workspaceId: 'ws-1',
      subject: 'contact:w1',
      decisionType: 'followup_timing',
      context: { channel: 'whatsapp' },
      channel: 'whatsapp',
      options: [
        {
          action: 'reply_option',
          predicate: 'P(reply|template,hour,channel)',
          context: { template: 'text', hour: 10, channel: 'whatsapp' },
        },
        { action: 'buy_option', predicate: 'P(buy|offer)', context: { offer: 'a' } },
      ],
      epsilon: 0.5,
      fallbackMinSamples: 999,
    });

    // The reply_option should be nudged (predicate contains 'reply' matching 'reply_rate')
    const replyCandidate = result.decision.candidates.find((c) => c.action === 'reply_option');
    const buyCandidate = result.decision.candidates.find((c) => c.action === 'buy_option');

    expect(replyCandidate).toBeDefined();
    expect(buyCandidate).toBeDefined();

    // With belief mean = 0.5, samples = 0, wisdomWeight = 0.5 × 0.8 = 0.4
    // nudgedMean = (0.5 × 1 + 0.4 × 1.0) / (1 + 0.4) = 0.9 / 1.4 ≈ 0.643
    expect(replyCandidate!.beliefMean).toBeCloseTo(0.9 / 1.4, 4);
    // buy_option should NOT be nudged (predicate contains 'buy', not 'reply')
    expect(buyCandidate!.beliefMean).toBe(0.5);

    // The nudge should cause reply_option to be chosen (higher mean → lower EFE)
    expect(result.chosen).toBe('reply_option');
    expect(result.decision.fallbackActive).toBe(false);
  });

  it('wisdom filter failure does not block decision — policy still chooses with no shift', async () => {
    const prisma = buildPrisma();
    const beliefs = buildBeliefs([
      { mean: 0.3, variance: 0.1 },
      { mean: 0.7, variance: 0.1 },
    ]);

    // WisdomFilter that throws on filter() call
    const brokenFilter: WisdomRelevanceFilter = {
      filter: () => {
        throw new Error('wisdom filter crash');
      },
    } as unknown as WisdomRelevanceFilter;

    const wisdomStore = new WisdomPatternStore();
    wisdomStore.setPatterns([makeWisdomPattern()]);

    const service = new MindPolicyService(
      prisma as never,
      beliefs as never,
      undefined,
      brokenFilter,
      wisdomStore,
    );

    const result = await service.choose({
      workspaceId: 'ws-1',
      subject: 'contact:w2',
      decisionType: 'followup_timing',
      context: { channel: 'whatsapp' },
      channel: 'whatsapp',
      options: [
        { action: 'action_a', predicate: 'P(reply)', context: {} },
        { action: 'action_b', predicate: 'P(reply)', context: {} },
      ],
      epsilon: 0.5,
      fallbackMinSamples: 999,
    });

    // Policy must still choose — the higher-belief option wins
    expect(result.chosen).toBe('action_b');
    expect(result.decision.fallbackActive).toBe(false);
    // No mean shift occurred (beliefs unchanged)
    const candidateA = result.decision.candidates.find((c) => c.action === 'action_a')!;
    const candidateB = result.decision.candidates.find((c) => c.action === 'action_b')!;
    expect(candidateA.beliefMean).toBe(0.3);
    expect(candidateB.beliefMean).toBe(0.7);
  });

  it('no patterns in store → no shift, policy proceeds normally', async () => {
    const prisma = buildPrisma();
    const beliefs = buildBeliefs([{ mean: 0.5, variance: 0.1 }]);

    const wisdomFilter = new WisdomRelevanceFilter();
    const wisdomStore = new WisdomPatternStore();
    // Store is empty — no patterns loaded

    const service = new MindPolicyService(
      prisma as never,
      beliefs as never,
      undefined,
      wisdomFilter,
      wisdomStore,
    );

    const result = await service.choose({
      workspaceId: 'ws-1',
      subject: 'contact:w3',
      decisionType: 'followup_timing',
      context: {},
      options: [{ action: 'only_option', predicate: 'P(reply)', context: {} }],
      epsilon: 0.5,
      fallbackMinSamples: 999,
    });

    expect(result.chosen).toBe('only_option');
    expect(result.decision.candidates[0].beliefMean).toBe(0.5);
  });
});
