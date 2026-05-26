import { MindPolicyService } from './mind-policy.service';
import { WisdomRelevanceFilter } from './wisdom/wisdom-relevance-filter.service';
import { WisdomPatternStore } from './wisdom/wisdom-pattern-store.service';
import type { WisdomPattern } from './wisdom/wisdom.types';

describe('MindPolicyService', () => {
  const buildBeliefs = (beliefs: Array<{ mean: number; variance: number }>) => ({
    getOrInit: jest
      .fn()
      .mockReturnValueOnce(Promise.resolve(beliefs[0]))
      .mockReturnValueOnce(Promise.resolve(beliefs[1])),
  });

  const buildPrisma = (
    harnessRows: Array<{ outcome: number; baselineOutcome: number | null }> = [],
  ) => ({
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue(harnessRows),
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ globalPriorOptOut: false }),
    },
    mindPolicy: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          harnessRows.map((r) => ({ outcome: r.outcome, baselineOutcome: r.baselineOutcome })),
        ),
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
  });

  describe('choose', () => {
    it('seleciona a acao com menor EFE (expected free energy)', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([
        { mean: 0.4, variance: 0.3 },
        { mean: 0.8, variance: 0.02 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:1',
        decisionType: 'followup_timing',
        context: { channel: 'whatsapp' },
        baselineActionQuiet: 'short',
        options: [
          {
            action: 'explore_audio_20h',
            predicate: 'P(reply|template,hour,channel)',
            context: { template: 'audio', hour: 20, channel: 'whatsapp' },
          },
          {
            action: 'exploit_text_10h',
            predicate: 'P(reply|template,hour,channel)',
            context: { template: 'text', hour: 10, channel: 'whatsapp' },
          },
        ],
        epsilon: 0.5,
      });

      expect(result.chosen).toBe('exploit_text_10h');
      expect(result.decision.fallbackActive).toBe(false);
      expect(result.decision.fallbackReason).toBeNull();
      expect(result.decision.candidates).toHaveLength(2);
      expect(result.decision.candidates[0].efe).toBeLessThan(
        result.decision.candidates[1].efe ?? 0,
      );
      expect(prisma.mindPolicy.create).toHaveBeenCalled();
    });

    it('registra baseline explicitamente quando fornecido', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([
        { mean: 0.7, variance: 0.1 },
        { mean: 0.3, variance: 0.5 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:2',
        decisionType: 'offer_choice',
        context: {},
        baselineActionQuiet: 'no_offer',
        options: [
          { action: 'offer_a', predicate: 'P(buy|offer)', context: { offer: 'a' } },
          { action: 'offer_b', predicate: 'P(buy|offer)', context: { offer: 'b' } },
        ],
      });

      expect(result.decision.baseline).toBe('no_offer');
      expect(result.decision.baselineAction).toBe('no_offer');
    });

    it('registra baseline como pior candidato quando nao fornecido explicitamente', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([
        { mean: 0.8, variance: 0.1 },
        { mean: 0.3, variance: 0.5 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:3',
        decisionType: 'followup_timing',
        context: {},
        options: [
          { action: 'action_good', predicate: 'P(reply)', context: { variant: 'a' } },
          { action: 'action_bad', predicate: 'P(reply)', context: { variant: 'b' } },
        ],
      });

      expect(result.decision.baseline).toBe('action_bad');
    });

    it('faz fallback para baseline quando lift historico e negativo com samples suficientes', async () => {
      const harnessData = Array.from({ length: 31 }, (_, index) => ({
        outcome: index === 0 ? 1 : 0,
        baselineOutcome: 1,
      }));
      const prisma = {
        $executeRaw: jest.fn().mockResolvedValue(2),
        $queryRaw: jest.fn().mockResolvedValue(harnessData),
        mindPolicy: {
          create: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue(
            harnessData.map((row) => ({
              baselineOutcome: row.baselineOutcome,
              outcome: row.outcome,
            })),
          ),
        },
      };
      const beliefs = {
        getOrInit: jest.fn(),
      };
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:4',
        decisionType: 'followup_timing',
        context: {},
        baselineActionQuiet: 'safe_default',
        fallbackMinSamples: 4,
        options: [
          { action: 'risky_a', predicate: 'P(reply)', context: {} },
          { action: 'risky_b', predicate: 'P(reply)', context: {} },
        ],
      });

      expect(prisma.mindPolicy.findMany).toHaveBeenCalledTimes(1);
      expect(result.chosen).toBe('safe_default');
      expect(result.decision.fallbackActive).toBe(true);
      expect(result.decision.fallbackReason).toContain('lift=');
      expect(result.decision.fallbackReason).toContain('n=31');
    });

    it('NAO faz fallback quando lift e negativo mas samples insuficientes', async () => {
      const prisma = buildPrisma([
        { outcome: 0, baselineOutcome: 1 },
        { outcome: 0, baselineOutcome: 1 },
      ]);
      const beliefs = buildBeliefs([
        { mean: 0.8, variance: 0.1 },
        { mean: 0.3, variance: 0.5 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:5',
        decisionType: 'followup_timing',
        context: {},
        baselineActionQuiet: 'safe_default',
        options: [
          { action: 'action_a', predicate: 'P(reply)', context: {} },
          { action: 'action_b', predicate: 'P(reply)', context: {} },
        ],
      });

      expect(result.decision.fallbackActive).toBe(false);
    });

    it('NAO faz fallback quando lift e positivo', async () => {
      const prisma = buildPrisma([
        { outcome: 1, baselineOutcome: 0 },
        { outcome: 1, baselineOutcome: 0 },
        { outcome: 0, baselineOutcome: 0 },
        { outcome: 1, baselineOutcome: 0 },
      ]);
      const beliefs = buildBeliefs([
        { mean: 0.8, variance: 0.1 },
        { mean: 0.3, variance: 0.5 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:6',
        decisionType: 'followup_timing',
        context: {},
        baselineActionQuiet: 'safe_default',
        options: [
          { action: 'action_a', predicate: 'P(reply)', context: {} },
          { action: 'action_b', predicate: 'P(reply)', context: {} },
        ],
      });

      expect(result.decision.fallbackActive).toBe(false);
      expect(['action_a', 'action_b']).toContain(result.chosen);
    });

    it('gera calcSteps auditaveis com formula e belief values', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([
        { mean: 0.6, variance: 0.2 },
        { mean: 0.8, variance: 0.05 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:7',
        decisionType: 'followup_timing',
        context: {},
        options: [
          { action: 'action_a', predicate: 'P(reply)', context: {} },
          { action: 'action_b', predicate: 'P(reply)', context: {} },
        ],
        epsilon: 0.3,
        utilitySuccess: 1,
        utilityFail: -0.1,
      });

      expect(result.decision.calcSteps).toHaveLength(2);
      for (const step of result.decision.calcSteps) {
        expect(step.formula).toContain('EFE=-(P+E)-economicScore');
        expect(step.beliefMean).toBeGreaterThan(0);
        expect(step.beliefVariance).toBeGreaterThan(0);
        expect(step.baseEfe).toBeCloseTo(-(step.pragmatic + step.epistemic), 8);
        expect(step.economicScore).toBeGreaterThan(0);
        expect(step.efe).toBeCloseTo((step.baseEfe ?? 0) - (step.economicScore ?? 0), 8);
      }

      const winner = result.decision.candidates[0];
      expect(winner.beliefMean).toBeGreaterThan(0);
      expect(winner.beliefVariance).toBeGreaterThan(0);
      expect(winner.economicObjective).toEqual(
        expect.objectContaining({ profile: 'b2c_ecommerce' }),
      );
    });

    it('inclui epsilon e utility weights no decision para rastreabilidade', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([{ mean: 0.5, variance: 0.1 }]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:8',
        decisionType: 'test',
        context: {},
        options: [{ action: 'a', predicate: 'P(x)', context: {} }],
        epsilon: 0.7,
        utilitySuccess: 2,
        utilityFail: -0.5,
      });

      expect(result.decision.epsilon).toBe(0.7);
      expect(result.decision.utilitySuccess).toBe(2);
      expect(result.decision.utilityFail).toBe(-0.5);
    });

    it('calcula EFE negativa quando utilidade falha e negativa e variancia alta', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([
        { mean: 0.2, variance: 0.9 },
        { mean: 0.8, variance: 0.1 },
      ]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:9',
        decisionType: 'followup_timing',
        context: {},
        options: [
          { action: 'high_risk', predicate: 'P(reply)', context: {} },
          { action: 'low_risk', predicate: 'P(reply)', context: {} },
        ],
      });

      const highRisk = result.decision.candidates.find((c) => c.action === 'high_risk')!;
      const lowRisk = result.decision.candidates.find((c) => c.action === 'low_risk')!;

      expect(highRisk.pragmatic).toBeLessThan(lowRisk.pragmatic);
      expect(highRisk.epistemic).toBeGreaterThan(lowRisk.epistemic);
      expect(result.chosen).toBe('low_risk');
    });

    it('fallback para baseline automatico quando so ha uma opcao', async () => {
      const prisma = buildPrisma();
      const beliefs = buildBeliefs([{ mean: 0.5, variance: 0.1 }]);
      const service = new MindPolicyService(prisma as never, beliefs as never);

      const result = await service.choose({
        workspaceId: 'ws-1',
        subject: 'contact:10',
        decisionType: 'single',
        context: {},
        options: [{ action: 'only_option', predicate: 'P(reply)', context: {} }],
      });

      expect(result.chosen).toBe('only_option');
      expect(result.decision.baseline).toBe('only_option');
      expect(result.decision.fallbackActive).toBe(false);
    });
  });

  describe('wisdom priors (CIA Gap 9)', () => {
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
          { action: 'reply_option', predicate: 'P(reply|template,hour,channel)', context: { template: 'text', hour: 10, channel: 'whatsapp' } },
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
      const beliefs = buildBeliefs([
        { mean: 0.5, variance: 0.1 },
      ]);

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
        options: [
          { action: 'only_option', predicate: 'P(reply)', context: {} },
        ],
        epsilon: 0.5,
        fallbackMinSamples: 999,
      });

      expect(result.chosen).toBe('only_option');
      expect(result.decision.candidates[0].beliefMean).toBe(0.5);
    });
  });

  describe('resolve outcomes with real baseline', () => {
    it('estima baseline contrafactual quando o caller nao informa baselineOutcome', async () => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-1',
              workspaceId: 'ws-1',
              subject: 'contact:1',
              decisionType: 'coupon_offer',
              context: { channel: 'whatsapp', ticket: 0.2 },
              chosen: 'coupon_15',
              baseline: 'no_coupon',
              outcomeKey: 'coupon:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      await service.resolveOutcome('ws-1', 'coupon:1', 1);

      expect(tx.mindPolicy.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'policy-1',
          workspaceId: 'ws-1',
          resolvedAt: null,
        },
        data: expect.objectContaining({ outcome: 1, baselineOutcome: 0.78 }),
      });
      const updateCall = tx.mindPolicy.updateMany.mock.calls[0][0] as {
        data: { baselineOutcome: number };
      };
      expect(updateCall.data.baselineOutcome).toBeGreaterThanOrEqual(0);
      expect(updateCall.data.baselineOutcome).toBeLessThan(1);
    });

    it('calcula lift diferente de zero quando baselineOutcome diverge do outcome', async () => {
      const prisma = buildPrisma([
        { outcome: 1, baselineOutcome: 0.65 },
        { outcome: 1, baselineOutcome: 0.65 },
        { outcome: 0, baselineOutcome: 0.35 },
      ]);
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      const result = await service.harness('ws-1', 'coupon_offer');

      expect(result.mindMean).toBeCloseTo(2 / 3);
      expect(result.baselineMean).toBeCloseTo(0.55);
      expect(result.lift).toBeGreaterThan(0);
    });


    it('resolveOutcome: records global prior observation when globalPrior is injected', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-1',
              workspaceId: 'ws-1',
              subject: 'contact:1',
              decisionType: 'coupon_offer',
              context: { channel: 'whatsapp', ticket: 0.2 },
              chosen: 'coupon_15',
              baseline: 'no_coupon',
              outcomeKey: 'coupon:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await service.resolveOutcome('ws-1', 'coupon:1', 1);

      expect(recordObservation).toHaveBeenCalledTimes(1);
      expect(recordObservation).toHaveBeenCalledWith('whatsapp', 'coupon_offer', 'coupon_15', true);
    });

    it('resolveOutcome: records failure when outcome is below threshold', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-2',
              workspaceId: 'ws-1',
              subject: 'contact:2',
              decisionType: 'tom',
              context: { channel: 'whatsapp' },
              chosen: 'AGGRESSIVE',
              baseline: 'FRIENDLY',
              outcomeKey: 'tom:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await service.resolveOutcome('ws-1', 'tom:1', 0);

      expect(recordObservation).toHaveBeenCalledWith('whatsapp', 'tom', 'AGGRESSIVE', false);
    });

    it('resolveOutcome: succeeds even when recordObservation throws', async () => {
      const recordObservation = jest.fn().mockRejectedValue(new Error('DB down'));
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-3',
              workspaceId: 'ws-1',
              subject: 'contact:3',
              decisionType: 'followup_timing',
              context: { channel: 'whatsapp' },
              chosen: 'exploit_text_10h',
              baseline: 'short',
              outcomeKey: 'followup:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      // Should not throw despite recordObservation rejecting
      await expect(service.resolveOutcome('ws-1', 'followup:1', 1)).resolves.toBeUndefined();

      // Policy resolution still happened
      expect(tx.mindPolicy.updateMany).toHaveBeenCalled();
      expect(recordObservation).toHaveBeenCalled();
    });

    it('resolveOpenForSubject: records global prior observations for resolved rows', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const mindPolicy = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-1',
            workspaceId: 'ws-1',
            subject: 'contact:10',
            decisionType: 'followup_timing',
            context: { channel: 'instagram' },
            chosen: 'exploit_text_10h',
            baseline: 'short',
            outcomeKey: 'outcome:1',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const prisma = { mindPolicy, kloelMemory: { upsert: jest.fn() } };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      const count = await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:10',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(count).toBe(1);
      expect(recordObservation).toHaveBeenCalledTimes(1);
      expect(recordObservation).toHaveBeenCalledWith('instagram', 'followup_timing', 'exploit_text_10h', true);
    });

    it('resolveOpenForSubject: skips prior when channel is absent from context', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const mindPolicy = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-2',
            workspaceId: 'ws-1',
            subject: 'contact:11',
            decisionType: 'followup_timing',
            context: {},
            chosen: 'exploit_text_10h',
            baseline: 'short',
            outcomeKey: 'outcome:2',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const prisma = { mindPolicy, kloelMemory: { upsert: jest.fn() } };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:11',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(recordObservation).not.toHaveBeenCalled();
    });

    it('resolveOpenForSubject: succeeds even when recordObservation throws', async () => {
      const recordObservation = jest.fn().mockRejectedValue(new Error('DB down'));
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const mindPolicy = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-3',
            workspaceId: 'ws-1',
            subject: 'contact:12',
            decisionType: 'followup_timing',
            context: { channel: 'whatsapp' },
            chosen: 'short',
            baseline: 'short',
            outcomeKey: 'outcome:3',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const prisma = { mindPolicy, kloelMemory: { upsert: jest.fn() } };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      const count = await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:12',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(count).toBe(1);
      expect(recordObservation).toHaveBeenCalled();
    });
  });

  describe('confirmAutopilotOutcome', () => {
    it('marks resolved autopilot actions inside the response window as confirmed', async () => {
      const resolvedAt = new Date(Date.now() - 10 * 60 * 1000);
      const prisma = buildPrisma();
      prisma.mindPolicy.findMany.mockResolvedValue([
        { id: 'policy-1', context: { source: 'autopilot' }, resolvedAt },
      ]);
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      const result = await service.confirmAutopilotOutcome({
        workspaceId: 'ws-1',
        contactId: 'lead-1',
      });

      expect(result).toEqual({ confirmed: 1, unanswered: 0 });
      expect(prisma.mindPolicy.findMany).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          subject: 'contact:lead-1',
          decisionType: 'autopilot_action',
          outcome: 1,
          resolvedAt: { not: null },
        },
        select: { id: true, context: true, resolvedAt: true },
      });
      expect(prisma.mindPolicy.update).toHaveBeenCalledWith({
        where: { id: 'policy-1' },
        data: { context: { source: 'autopilot', outcomeConfidence: 'confirmed' } },
      });
    });

    it('skips rows that already have outcome confidence', async () => {
      const prisma = buildPrisma();
      prisma.mindPolicy.findMany.mockResolvedValue([
        {
          id: 'policy-1',
          context: { outcomeConfidence: 'confirmed' },
          resolvedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      ]);
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      const result = await service.confirmAutopilotOutcome({
        workspaceId: 'ws-1',
        contactId: 'lead-1',
      });

      expect(result).toEqual({ confirmed: 0, unanswered: 0 });
      expect(prisma.mindPolicy.update).not.toHaveBeenCalled();
    });
  });
});
