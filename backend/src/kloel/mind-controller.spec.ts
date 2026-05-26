import { MindController } from './mind-controller';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindService } from './mind.service';
import { MindVerbalizerService } from './mind-verbalizer.service';
import type { AggressivenessDto, DecideDto, ResolveDto } from './mind-controller.dto';
import { MindObservabilityService } from './mind-observability.service';
import { MindGuardsService } from './mind/policy/mind-guards.service';
import { MindSimulatorService } from './mind-simulator.service';
import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';
import { MindGlobalPriorService } from './mind-global-prior.service';

function mockBeliefs(): jest.Mocked<MindBeliefService> {
  const service = Object.create(MindBeliefService.prototype) as jest.Mocked<MindBeliefService>;
  service.list = jest.fn();
  return service;
}

function mockPolicy(): jest.Mocked<MindPolicyService> {
  const service = Object.create(MindPolicyService.prototype) as jest.Mocked<MindPolicyService>;
  service.choose = jest.fn();
  service.harness = jest.fn();
  service.resolveOutcome = jest.fn();
  return service;
}

function mockMind(): jest.Mocked<MindService> {
  const service = Object.create(MindService.prototype) as jest.Mocked<MindService>;
  service.tick = jest.fn().mockResolvedValue({ perceived: 1 });
  service.lift = jest.fn();
  service.retrieveSimilar = jest.fn().mockResolvedValue([{ id: 'case-1', similarity: 0.9 }]);
  service.resolveAudioVsText = jest.fn().mockResolvedValue({
    choice: 'text',
    confidence: 0.5,
    fallback: false,
  });
  service.resolveCoupon = jest.fn().mockResolvedValue({
    action: 'offer_coupon',
    confidence: 0.5,
    fallback: false,
  });
  service.resolveAggressiveness = jest.fn().mockResolvedValue({
    aggressiveness: 'MEDIUM',
    confidence: 0.72,
    fallback: false,
  });
  service.resolveTone = jest.fn().mockResolvedValue({
    confidence: 0.5,
    fallback: false,
    tone: 'DIRECT',
  });
  service.resolveBestVariant = jest.fn().mockResolvedValue({
    variant: 'followup:proof',
    confidence: 0.72,
    fallback: false,
  });
  return service;
}

function mockGlobalPrior(): jest.Mocked<MindGlobalPriorService> {
  const service = Object.create(
    MindGlobalPriorService.prototype,
  ) as jest.Mocked<MindGlobalPriorService>;
  service.getPrior = jest.fn().mockResolvedValue({
    arms: [],
    decisionType: 'cart_recovery',
    meanSuccessRate: 0,
    totalPulls: 0,
  });
  return service;
}

function mockVerbalizer(): jest.Mocked<MindVerbalizerService> {
  const service = Object.create(
    MindVerbalizerService.prototype,
  ) as jest.Mocked<MindVerbalizerService>;
  service.narrate = jest.fn().mockResolvedValue('briefing');
  return service;
}

function mockObservability(): jest.Mocked<MindObservabilityService> {
  const service = Object.create(
    MindObservabilityService.prototype,
  ) as jest.Mocked<MindObservabilityService>;
  service.ask = jest.fn();
  service.bandit = jest.fn();
  service.briefing = jest.fn();
  service.concepts = jest.fn();
  service.health = jest.fn();
  service.lift = jest.fn();
  service.report = jest.fn();
  service.runtimeEvidence = jest.fn();
  service.state = jest.fn();
  service.surprise = jest.fn();
  service.trace = jest.fn();
  return service;
}

function mockGuards(): jest.Mocked<MindGuardsService> {
  const service = Object.create(MindGuardsService.prototype) as jest.Mocked<MindGuardsService>;
  service.evaluate = jest.fn().mockResolvedValue({
    action: 'reply_text',
    allowed: true,
    context: {},
    decision: 'allow',
    guardName: 'all_guards',
    reason: 'Acao aprovada pelas guardas deterministicas.',
    reasonTag: 'all_guards_passed',
  });
  return service;
}

function simulationReport() {
  return {
    decisionDetails: [
      {
        baseline: '30m',
        candidateCount: 2,
        chosen: '30m',
        decisionType: 'followup_timing',
        matchedBaseline: true,
      },
    ],
    quality: { checks: [], failed: 0, passed: 5, total: 5 },
    replay: {
      baselineMatches: 1,
      baselineMatchRate: 1,
      outcomes: [{ baseline: '30m', chosen: '30m', decisionType: 'followup_timing' }],
      totalDecisions: 1,
      workspaceId: 'ws-test',
    },
    summary: {
      baselineMatchRate: 1,
      decisionsThatChoseBaseline: 1,
      overallVerdict: 'clean' as const,
      qualityFailed: 0,
      qualityPassed: 5,
      totalDecisions: 1,
    },
    workspaceId: 'ws-test',
  };
}

function mockSimulator(): jest.Mocked<MindSimulatorService> {
  const service = Object.create(
    MindSimulatorService.prototype,
  ) as jest.Mocked<MindSimulatorService>;
  service.simulate = jest.fn().mockReturnValue(simulationReport());
  service.simulateFromDecisions = jest.fn().mockReturnValue(simulationReport());
  service.reportToMarkdown = jest.fn().mockReturnValue('# MIND Simulation Report\n\nmock');
  service.reportToJson = jest.fn().mockReturnValue('{}');
  return service;
}

function mockSynthetic(): jest.Mocked<MindSyntheticGeneratorService> {
  const service = Object.create(
    MindSyntheticGeneratorService.prototype,
  ) as jest.Mocked<MindSyntheticGeneratorService>;
  service.setSeed = jest.fn();
  service.generateCandidates = jest.fn().mockReturnValue([]);
  service.generateDecision = jest.fn().mockReturnValue({
    baseline: '30m',
    candidates: [
      { action: '5m', beliefMean: 0.3, beliefVariance: 0.2 },
      { action: '30m', beliefMean: 0.7, beliefVariance: 0.1 },
    ],
    decisionType: 'followup_timing',
    epsilon: 0.5,
    utilityFail: -0.2,
    utilitySuccess: 1,
    workspaceId: '',
  });
  service.generateActionContexts = jest.fn().mockReturnValue([
    { action: '5m', context: { contactOptOut: false, supportsAudio: true } },
    { action: '30m', context: { contactOptOut: false, supportsAudio: true } },
  ]);
  service.generateScenario = jest.fn().mockReturnValue({ decisions: [], workspaceId: 'ws-test' });
  service.generateScenarios = jest.fn().mockReturnValue([]);
  return service;
}

function buildController(params?: {
  beliefs?: jest.Mocked<MindBeliefService>;
  guards?: jest.Mocked<MindGuardsService>;
  mind?: jest.Mocked<MindService>;
  policy?: jest.Mocked<MindPolicyService>;
  verbalizer?: jest.Mocked<MindVerbalizerService>;
  simulator?: jest.Mocked<MindSimulatorService>;
  synthetic?: jest.Mocked<MindSyntheticGeneratorService>;
  globalPrior?: jest.Mocked<MindGlobalPriorService>;
}): MindController {
  return new MindController(
    params?.beliefs ?? mockBeliefs(),
    params?.policy ?? mockPolicy(),
    params?.mind ?? mockMind(),
    params?.verbalizer ?? mockVerbalizer(),
    mockObservability(),
    params?.guards ?? mockGuards(),
    params?.simulator ?? mockSimulator(),
    params?.synthetic ?? mockSynthetic(),
    params?.globalPrior ?? mockGlobalPrior(),
  );
}

describe('MindController', () => {
  it('exposes tick and narration through the service layer', async () => {
    const controller = buildController();

    await expect(controller.tick('ws-1')).resolves.toEqual({ perceived: 1 });
    await expect(controller.narrate('ws-1')).resolves.toEqual({ briefing: 'briefing' });
  });

  it('propagates tick and narrate service failures', async () => {
    const mind = mockMind();
    const verbalizer = mockVerbalizer();
    const tickError = new Error('tick_failed');
    const narrateError = new Error('narrate_failed');
    mind.tick.mockRejectedValueOnce(tickError);
    verbalizer.narrate.mockRejectedValueOnce(narrateError);

    const controller = buildController({ mind, verbalizer });

    await expect(controller.tick('ws-1')).rejects.toThrow(tickError);
    await expect(controller.narrate('ws-1')).rejects.toThrow(narrateError);
  });

  it('passes workspace id through tick and narrate exactly', async () => {
    const mind = mockMind();
    const verbalizer = mockVerbalizer();
    const controller = buildController({ mind, verbalizer });

    await controller.tick('ws-exact');
    await controller.narrate('ws-exact');

    expect(mind.tick).toHaveBeenCalledWith('ws-exact');
    expect(verbalizer.narrate).toHaveBeenCalledWith('ws-exact');
  });

  it('delegates decide body to policy.choose with workspaceId', async () => {
    const policy = mockPolicy();
    const body: DecideDto = {
      context: {},
      decisionType: 'cia_aggressiveness',
      options: [{ action: 'test', context: {}, predicate: 'p' }],
      subject: 'x',
    };
    policy.choose.mockResolvedValue({ chosen: 'test', decision: {} as never });

    const controller = buildController({ policy });
    await controller.decide('ws-1', body);

    expect(policy.choose).toHaveBeenCalledWith({ workspaceId: 'ws-1', ...body });
  });

  it('delegates resolve body to policy.resolveOutcome', async () => {
    const policy = mockPolicy();
    const body: ResolveDto = { outcome: 0.5, outcomeKey: 'k1' };

    const controller = buildController({ policy });
    const result = await controller.resolve('ws-1', body);

    expect(policy.resolveOutcome).toHaveBeenCalledWith('ws-1', 'k1', 0.5, undefined);
    expect(result).toEqual({ ok: true });
  });

  it('exposes deterministic MIND guard evaluation through an authenticated endpoint', async () => {
    const guards = mockGuards();
    const controller = buildController({ guards });

    const result = await controller.evaluateGuard('ws-1', {
      action: 'coupon_10',
      context: { maxDiscountPercent: 20, discountPercent: 10 },
      decisionType: 'coupon_offer',
    });

    expect(guards.evaluate).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'coupon_10',
      context: { maxDiscountPercent: 20, discountPercent: 10 },
      decisionType: 'coupon_offer',
    });
    expect(result).toEqual(expect.objectContaining({ allowed: true }));
  });

  it('delegates aggressiveness body to mind.resolveAggressiveness', async () => {
    const mind = mockMind();
    const body: AggressivenessDto = {
      domain: 'whatsapp_sales',
      repliedRate: 0.4,
      revenuePerSignal: 9.99,
      soldRate: 0.12,
    };

    const controller = buildController({ mind });
    const result = await controller.aggressiveness('ws-1', body);

    expect(mind.resolveAggressiveness).toHaveBeenCalledWith(
      'ws-1',
      'whatsapp_sales',
      0.12,
      0.4,
      9.99,
    );
    expect(result).toEqual({ aggressiveness: 'MEDIUM', confidence: 0.72, fallback: false });
  });

  it('delegates additional MIND decisions through dedicated endpoints', async () => {
    const mind = mockMind();
    const controller = buildController({ mind });

    await controller.audioVsText('ws-1', { audioRatio: 0.2, channel: 'instagram' });
    await controller.tone('ws-1', {
      channel: 'whatsapp',
      repliedRate: 0.4,
      segment: 'premium',
      soldRate: 0.2,
    });
    await controller.coupon('ws-1', {
      priceBand: 'over_300',
      segment: 'premium',
      soldRate: 0.08,
    });

    expect(mind.resolveAudioVsText).toHaveBeenCalledWith('ws-1', 'instagram', 0.2);
    expect(mind.resolveTone).toHaveBeenCalledWith('ws-1', 'whatsapp', 0.4, 0.2, 'premium');
    expect(mind.resolveCoupon).toHaveBeenCalledWith('ws-1', 'over_300', 0.08, 'premium');
  });

  it('exposes backend-first MIND observability endpoints', async () => {
    const mind = mockMind();
    const observability = mockObservability();
    const globalPrior = mockGlobalPrior();
    observability.bandit.mockResolvedValue({ arms: [], decisionType: 'cart_recovery' } as never);
    const controller = new MindController(
      mockBeliefs(),
      mockPolicy(),
      mind,
      mockVerbalizer(),
      observability,
      mockGuards(),
      mockSimulator(),
      mockSynthetic(),
      globalPrior,
    );

    await controller.bandit('ws-1', 'cart_recovery');
    await controller.globalPriorForDecision('cart_recovery');
    await controller.similarCases('ws-1', {
      caseType: 'cart_recovery',
      features: { channel: 'email' },
      limit: 5,
      text: 'lead pediu desconto',
    });

    expect(observability.bandit).toHaveBeenCalledWith('ws-1', 'cart_recovery');
    expect(globalPrior.getPrior).toHaveBeenCalledWith('cart_recovery');
    expect(mind.retrieveSimilar).toHaveBeenCalledWith({
      caseType: 'cart_recovery',
      features: { channel: 'email' },
      limit: 5,
      text: 'lead pediu desconto',
      workspaceId: 'ws-1',
    });
  });

  it('exposes runtime evidence by query and workspace route', async () => {
    const observability = mockObservability();
    observability.runtimeEvidence.mockResolvedValue({
      deterministicPipeline: { percentDeterministic: 100 },
      workspace: { id: 'ws-1' },
    } as never);
    const controller = buildController({});
    Object.assign(controller, { observability });

    await expect(controller.runtimeEvidenceByQuery('ws-1')).resolves.toEqual({
      deterministicPipeline: { percentDeterministic: 100 },
      workspace: { id: 'ws-1' },
    });
    await controller.runtimeEvidence('ws-2');

    expect(observability.runtimeEvidence).toHaveBeenNthCalledWith(1, 'ws-1');
    expect(observability.runtimeEvidence).toHaveBeenNthCalledWith(2, 'ws-2');
    expect(() => controller.runtimeEvidenceByQuery('')).toThrow('workspaceId_required');
  });

  describe('variantDecision (worker → backend internal endpoint)', () => {
    const ORIGINAL_ENV = { ...process.env };
    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it('accepts caller without header when INTERNAL_API_KEY is unset and NODE_ENV != production (dev convenience)', async () => {
      delete process.env.INTERNAL_API_KEY;
      process.env.NODE_ENV = 'development';
      const mind = mockMind();
      const controller = buildController({ mind });
      const body = { flow: 'followup', variantIds: ['a', 'b'] } as never;
      await expect(controller.variantDecision('ws-1', body, undefined)).resolves.toEqual({
        variant: 'followup:proof',
        confidence: 0.72,
        fallback: false,
      });
      expect(mind.resolveBestVariant).toHaveBeenCalledWith('ws-1', 'followup', ['a', 'b'], undefined);
    });

    it('REFUSES caller (503) when INTERNAL_API_KEY is unset and NODE_ENV=production (fail-closed)', async () => {
      delete process.env.INTERNAL_API_KEY;
      process.env.NODE_ENV = 'production';
      const controller = buildController();
      const body = { flow: 'followup', variantIds: ['a', 'b'] } as never;
      await expect(controller.variantDecision('ws-1', body, 'anything')).rejects.toThrow(
        /INTERNAL_API_KEY not configured/,
      );
    });

    it('accepts caller with matching internal key when key is configured', async () => {
      process.env.INTERNAL_API_KEY = 'secret-key';
      const mind = mockMind();
      const controller = buildController({ mind });
      const body = { flow: 'payment_recovery', variantIds: ['x', 'y'] } as never;
      await expect(controller.variantDecision('ws-2', body, 'secret-key')).resolves.toMatchObject({
        variant: 'followup:proof',
      });
      expect(mind.resolveBestVariant).toHaveBeenCalledWith('ws-2', 'payment_recovery', ['x', 'y'], undefined);
    });

    it('rejects caller with wrong internal key', async () => {
      process.env.INTERNAL_API_KEY = 'secret-key';
      const controller = buildController();
      const body = { flow: 'followup', variantIds: ['v1'] } as never;
      await expect(controller.variantDecision('ws-3', body, 'wrong-key')).rejects.toThrow(
        /Invalid internal key/,
      );
    });

    it('rejects caller with missing internal key when key is configured', async () => {
      process.env.INTERNAL_API_KEY = 'secret-key';
      const controller = buildController();
      const body = { flow: 'followup', variantIds: ['v1'] } as never;
      await expect(controller.variantDecision('ws-4', body, undefined)).rejects.toThrow(
        /Invalid internal key/,
      );
    });

    it('passes through context when provided', async () => {
      delete process.env.INTERNAL_API_KEY;
      const mind = mockMind();
      const controller = buildController({ mind });
      const body = {
        flow: 'followup',
        variantIds: ['a'],
        context: { domain: 'fitness', intent: 'reschedule' },
      } as never;
      await controller.variantDecision('ws-5', body, undefined);
      expect(mind.resolveBestVariant).toHaveBeenCalledWith(
        'ws-5',
        'followup',
        ['a'],
        { domain: 'fitness', intent: 'reschedule' },
      );
    });
  });
});
