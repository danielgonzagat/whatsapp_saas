import { MindPolicyService } from './mind-policy.service';

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
    mindPolicy: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          harnessRows.map((r) => ({ outcome: r.outcome, baselineOutcome: r.baselineOutcome })),
        ),
      create: jest.fn().mockResolvedValue(undefined),
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
        expect(step.formula).toContain('EFE=-(P+E)');
        expect(step.beliefMean).toBeGreaterThan(0);
        expect(step.beliefVariance).toBeGreaterThan(0);
        expect(step.efe).toBeCloseTo(-(step.pragmatic + step.epistemic), 8);
      }

      const winner = result.decision.candidates[0];
      expect(winner.beliefMean).toBeGreaterThan(0);
      expect(winner.beliefVariance).toBeGreaterThan(0);
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
});
