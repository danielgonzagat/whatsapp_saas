import { AuthorizationGatewayService } from './authorization.gateway';
import { BeliefUpdateService } from './belief-update';
import { DiscoveryNarrativeBuilderService } from './discovery-narrative.builder';
import { ExperimentRunnerService } from './experiment-runner';
import { HypothesisFormulatorService } from './hypothesis-formulator';
import { MarketEntryDecisionService } from './market-entry-decision.service';
import { MicroExperimentDesignerService } from './micro-experiment.designer';
import { ObservationCollectorService } from './observation.collector';
import { ProofEvaluatorService } from './proof-evaluator';
import type {
  SpineSignal,
  Hypothesis,
  MicroExperiment,
  Observation,
  ProofEvaluation,
} from './types';
import { SpineEmitterService } from '../spine/spine-emitter.service';

function makeSignal(overrides: Partial<SpineSignal> = {}): SpineSignal {
  return {
    eventName: 'commerce.lead.went_silent',
    workspaceId: 'ws-1',
    truthMode: 'observed',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Hypproof module (UTP-HYPPROOF-001..009)', () => {
  describe('HypothesisFormulatorService (HYPPROOF-001)', () => {
    const svc = new HypothesisFormulatorService();

    it('generates hypothesis for lead silence signal', () => {
      const signals = [makeSignal({ eventName: 'commerce.lead.went_silent' })];
      const result = svc.formulate(signals);
      expect(result).toHaveLength(1);
      expect(result[0]!.domain).toBe('lead_response');
      expect(result[0]!.status).toBe('pending');
      expect(result[0]!.confidence).toBeGreaterThan(0.5);
      expect(result[0]!.marketEntryId).toBe('producer-validation-infoproduct-direct-checkout');
      expect(result[0]!.commercialStage).toBe('validacao');
      expect(result[0]!.flagshipJourney).toContain('lead inseguro');
      expect(result[0]!.payablePain).toContain('perder lead quente');
    });

    it('generates hypothesis for churn risk signal', () => {
      const signals = [makeSignal({ eventName: 'commerce.post_sale.churn_risk_detected' })];
      const result = svc.formulate(signals);
      expect(result).toHaveLength(1);
      expect(result[0]!.domain).toBe('churn_prevention');
    });

    it('generates hypothesis for objection raised signal', () => {
      const signals = [makeSignal({ eventName: 'commerce.lead.objection_raised' })];
      const result = svc.formulate(signals);
      expect(result).toHaveLength(1);
      expect(result[0]!.domain).toBe('lead_response');
      expect(result[0]!.payablePain).toContain('responder objecao');
    });

    it('returns empty for signals without matching patterns', () => {
      const signals = [
        makeSignal({ eventName: 'commerce.lead.replied' }),
        makeSignal({ eventName: 'commerce.payment.approved' }),
      ];
      const result = svc.formulate(signals);
      expect(result).toHaveLength(0);
    });

    it('returns empty for empty signal list', () => {
      expect(svc.formulate([])).toHaveLength(0);
    });

    it('generates multiple hypotheses for multiple matching signals', () => {
      const signals = [
        makeSignal({ eventName: 'commerce.lead.went_silent' }),
        makeSignal({ eventName: 'commerce.post_sale.churn_risk_detected' }),
        makeSignal({ eventName: 'commerce.crm.stage_changed' }),
      ];
      const result = svc.formulate(signals);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('MicroExperimentDesignerService (HYPPROOF-002)', () => {
    const svc = new MicroExperimentDesignerService();

    it('designs experiment for valid hypothesis', () => {
      const hypothesis: Hypothesis = {
        id: 'hyp-1',
        workspaceId: 'ws-1',
        statement: 'Test hypothesis',
        domain: 'lead_response',
        sourceEventId: 'commerce.lead.went_silent',
        confidence: 0.7,
        truthMode: 'observed',
        generatedAt: new Date().toISOString(),
        status: 'pending',
      };
      const result = svc.design(hypothesis);
      expect(result).not.toBeNull();
      expect(result!.hypothesisId).toBe('hyp-1');
      expect(result!.targetMetric).toBe('lead_reengagement_rate');
      expect(result!.riskAssessment).toBe('safe');
      expect(result!.riskClass).toBe('R1');
      expect(result!.autonomyMode).toBe('alone');
      expect(result!.proofLevelTarget).toBe('N3');
      expect(result!.commercialWork).toContain('decide whether to wait');
      expect(result!.noFaithProofSignal).toContain('concrete next-step');
      expect(result!.leadLeavesBetterCheck).toContain('fake urgency');
    });

    it('rejects hypothesis with unknown domain', () => {
      const hypothesis: Hypothesis = {
        id: 'hyp-x',
        workspaceId: 'ws-1',
        statement: 'Unknown domain',
        domain: 'unknown_domain',
        sourceEventId: 'x',
        confidence: 0.7,
        truthMode: 'observed',
        generatedAt: new Date().toISOString(),
        status: 'pending',
      };
      expect(svc.design(hypothesis)).toBeNull();
    });

    it('rejects hypothesis with confidence below threshold', () => {
      const hypothesis: Hypothesis = {
        id: 'hyp-low',
        workspaceId: 'ws-1',
        statement: 'Low confidence',
        domain: 'lead_response',
        sourceEventId: 'x',
        confidence: 0.2,
        truthMode: 'inferred',
        generatedAt: new Date().toISOString(),
        status: 'pending',
      };
      expect(svc.design(hypothesis)).toBeNull();
    });
  });

  describe('MarketEntryDecisionService (HYPPROOF-009)', () => {
    const svc = new MarketEntryDecisionService(
      new HypothesisFormulatorService(),
      new MicroExperimentDesignerService(),
    );

    it('turns lead silence into a safe owner decision before contacting the lead', () => {
      const result = svc.decideFromSignals([
        makeSignal({ eventName: 'commerce.lead.went_silent', workspaceId: 'ws-1' }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.marketEntryId).toBe('producer-validation-infoproduct-direct-checkout');
      expect(result[0]!.shouldContactLeadNow).toBe(false);
      expect(result[0]!.ownerDecision).toContain('risk=R1');
      expect(result[0]!.ownerDecision).toContain('autonomy=alone');
      expect(result[0]!.nextSafeStep).toContain('concrete next-step');
      expect(result[0]!.uncertaintyStatement).toContain('not observed user proof yet');
      expect(result[0]!.validationNeeded).toContain('Lead interessado');
    });

    it('ignores non-market-entry hypotheses', () => {
      const result = svc.decideFromSignals([
        makeSignal({ eventName: 'commerce.post_sale.churn_risk_detected', workspaceId: 'ws-1' }),
      ]);

      expect(result).toHaveLength(0);
    });
  });

  describe('AuthorizationGatewayService (HYPPROOF-003)', () => {
    const svc = new AuthorizationGatewayService(undefined);

    it('authorizes safe experiment', async () => {
      const experiment: MicroExperiment = {
        id: 'exp-1',
        hypothesisId: 'hyp-1',
        workspaceId: 'ws-1',
        description: 'Test experiment',
        riskAssessment: 'safe',
        targetMetric: 'test_metric',
        evidenceThreshold: 3,
        maxDurationMs: 60000,
        designedAt: new Date().toISOString(),
        correlationId: 'corr-1',
      };
      const decision = await svc.authorize(experiment);
      expect(decision.authorized).toBe(true);
      expect(decision.authorityLevel).toBe('advisory');
    });

    it('rejects high-risk experiment', async () => {
      const experiment: MicroExperiment = {
        id: 'exp-2',
        hypothesisId: 'hyp-2',
        workspaceId: 'ws-1',
        description: 'High risk',
        riskAssessment: 'high',
        targetMetric: 'test_metric',
        evidenceThreshold: 3,
        maxDurationMs: 60000,
        designedAt: new Date().toISOString(),
        correlationId: 'corr-2',
      };
      const decision = await svc.authorize(experiment);
      expect(decision.authorized).toBe(false);
      expect(decision.authorityLevel).toBe('human_required');
    });

    it('rejects experiment with zero evidence threshold', async () => {
      const experiment: MicroExperiment = {
        id: 'exp-3',
        hypothesisId: 'hyp-3',
        workspaceId: 'ws-1',
        description: 'Zero evidence',
        riskAssessment: 'safe',
        targetMetric: 'test_metric',
        evidenceThreshold: 0,
        maxDurationMs: 60000,
        designedAt: new Date().toISOString(),
        correlationId: 'corr-3',
      };
      const decision = await svc.authorize(experiment);
      expect(decision.authorized).toBe(false);
    });
  });

  describe('ExperimentRunnerService (HYPPROOF-004)', () => {
    const svc = new ExperimentRunnerService();

    const experiment: MicroExperiment = {
      id: 'exp-1',
      hypothesisId: 'hyp-1',
      workspaceId: 'ws-1',
      description: 'Test',
      riskAssessment: 'safe',
      targetMetric: 'test_metric',
      evidenceThreshold: 3,
      maxDurationMs: 60000,
      designedAt: new Date().toISOString(),
      correlationId: 'corr-1',
    };

    const auth = {
      request: {
        experimentId: 'exp-1',
        hypothesisId: 'hyp-1',
        workspaceId: 'ws-1',
        riskAssessment: 'safe' as const,
        requestedAt: new Date().toISOString(),
        reason: 'ok',
      },
      authorized: true,
      authorityLevel: 'advisory' as const,
      reason: 'ok',
      decidedAt: new Date().toISOString(),
    };

    it('starts experiment run when authorized', () => {
      const run = svc.start(experiment, auth);
      expect(run).not.toBeNull();
      expect(run!.status).toBe('running');
      expect(run!.workspaceId).toBe('ws-1');
    });

    it('rejects start when not authorized', () => {
      const run = svc.start(experiment, { ...auth, authorized: false });
      expect(run).toBeNull();
    });

    it('returns existing run on duplicate start (idempotency)', () => {
      const run1 = svc.start(experiment, auth);
      const run2 = svc.start(experiment, auth);
      expect(run2).not.toBeNull();
      expect(run2!.id).toBe(run1!.id);
    });

    it('completes run successfully', () => {
      const run = svc.start(experiment, auth)!;
      const completed = svc.complete(run.id, 'ws-1');
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.completedAt).not.toBeNull();
    });

    it('marks run as failed', () => {
      const run = svc.start(experiment, auth)!;
      const failed = svc.fail(run.id, 'ws-1', 'test error');
      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('test error');
    });
  });

  describe('ObservationCollectorService (HYPPROOF-005)', () => {
    const svc = new ObservationCollectorService();

    const run = {
      id: 'run-1',
      experimentId: 'exp-1',
      hypothesisId: 'hyp-1',
      workspaceId: 'ws-1',
      correlationId: 'corr-1',
      status: 'running' as const,
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    it('collects observations from raw data', () => {
      const raw = [
        { metricName: 'replies', observedValue: 12, confidence: 0.9 },
        { metricName: 'replies', observedValue: 15, confidence: 0.85 },
      ];
      const result = svc.collect(run, 10, raw);
      expect(result).toHaveLength(2);
      expect(result[0]!.delta).toBe(2);
      expect(result[0]!.evidenceCount).toBe(2);
    });

    it('returns empty for zero raw observations', () => {
      const result = svc.collect(run, 10, []);
      expect(result).toHaveLength(0);
    });

    it('clamps confidence to [0, 1] range', () => {
      const raw = [
        { metricName: 'replies', observedValue: 10, confidence: 1.5 },
        { metricName: 'replies', observedValue: 10, confidence: -0.5 },
      ];
      const result = svc.collect(run, 10, raw);
      expect(result).toHaveLength(2);
      expect(result[0]!.confidence).toBe(1);
      expect(result[1]!.confidence).toBe(0);
    });
  });

  describe('ProofEvaluatorService (HYPPROOF-006)', () => {
    const svc = new ProofEvaluatorService();

    it('returns confirmed verdict for strong positive delta', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          runId: 'run-1',
          experimentId: 'exp-1',
          workspaceId: 'ws-1',
          correlationId: 'corr-1',
          metricName: 'replies',
          baselineValue: 10,
          observedValue: 12,
          delta: 0.15,
          confidence: 0.8,
          truthMode: 'observed',
          evidenceCount: 3,
          observedAt: new Date().toISOString(),
        },
        {
          id: 'obs-2',
          runId: 'run-1',
          experimentId: 'exp-1',
          workspaceId: 'ws-1',
          correlationId: 'corr-1',
          metricName: 'replies',
          baselineValue: 10,
          observedValue: 13,
          delta: 0.2,
          confidence: 0.8,
          truthMode: 'observed',
          evidenceCount: 3,
          observedAt: new Date().toISOString(),
        },
      ];
      const result = svc.evaluate(observations, 'hyp-1', 'exp-1', 'ws-1', 'corr-1');
      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('confirmed');
    });

    it('returns refuted for negative delta', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          runId: 'run-1',
          experimentId: 'exp-1',
          workspaceId: 'ws-1',
          correlationId: 'corr-1',
          metricName: 'replies',
          baselineValue: 10,
          observedValue: 5,
          delta: -0.2,
          confidence: 0.8,
          truthMode: 'observed',
          evidenceCount: 3,
          observedAt: new Date().toISOString(),
        },
      ];
      const result = svc.evaluate(observations, 'hyp-1', 'exp-1', 'ws-1', 'corr-1');
      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('refuted');
    });

    it('returns null for empty observations', () => {
      expect(svc.evaluate([], 'hyp-1', 'exp-1', 'ws-1', 'corr-1')).toBeNull();
    });

    it('returns inconclusive for insufficient evidence', () => {
      const observations: Observation[] = [
        {
          id: 'obs-1',
          runId: 'run-1',
          experimentId: 'exp-1',
          workspaceId: 'ws-1',
          correlationId: 'corr-1',
          metricName: 'replies',
          baselineValue: 10,
          observedValue: 12,
          delta: 0.1,
          confidence: 0.8,
          truthMode: 'observed',
          evidenceCount: 1,
          observedAt: new Date().toISOString(),
        },
      ];
      const result = svc.evaluate(observations, 'hyp-1', 'exp-1', 'ws-1', 'corr-1');
      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('inconclusive');
    });
  });

  describe('BeliefUpdateService (HYPPROOF-007)', () => {
    it('emits cognition.belief_updated event on verdict', async () => {
      const mockSpine = {
        emit: jest.fn().mockResolvedValue({ eventId: 'evt-1' }),
      } as unknown as SpineEmitterService;
      const svc = new BeliefUpdateService(mockSpine, undefined);

      const evaluation: ProofEvaluation = {
        experimentId: 'exp-1',
        hypothesisId: 'hyp-1',
        workspaceId: 'ws-1',
        correlationId: 'corr-1',
        verdict: 'confirmed',
        confidence: 0.8,
        evidenceCount: 3,
        meanDelta: 0.15,
        reason: 'Evidence supports',
        evaluatedAt: new Date().toISOString(),
      };

      const result = await svc.update(evaluation);
      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('confirmed');
      expect(mockSpine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cognition.belief_updated',
          workspaceId: 'ws-1',
        }),
      );
    });
  });

  describe('DiscoveryNarrativeBuilderService (HYPPROOF-008)', () => {
    const svc = new DiscoveryNarrativeBuilderService();

    it('builds confirmed narrative', () => {
      const hypothesis: Hypothesis = {
        id: 'hyp-1',
        workspaceId: 'ws-1',
        statement: 'We tested engagement',
        domain: 'lead_response',
        sourceEventId: 'evt-1',
        confidence: 0.7,
        truthMode: 'observed',
        generatedAt: new Date().toISOString(),
        status: 'evaluated',
      };
      const evaluation: ProofEvaluation = {
        experimentId: 'exp-1',
        hypothesisId: 'hyp-1',
        workspaceId: 'ws-1',
        correlationId: 'corr-1',
        verdict: 'confirmed',
        confidence: 0.8,
        evidenceCount: 3,
        meanDelta: 0.15,
        reason: 'test',
        evaluatedAt: new Date().toISOString(),
      };
      const result = svc.build(hypothesis, evaluation);
      expect(result).not.toBeNull();
      expect(result!.headline).toContain('confirmed');
      expect(result!.verdict).toBe('confirmed');
    });

    it('builds refuted narrative', () => {
      const hypothesis: Hypothesis = {
        id: 'hyp-2',
        workspaceId: 'ws-1',
        statement: 'We tested churn',
        domain: 'churn_prevention',
        sourceEventId: 'evt-2',
        confidence: 0.6,
        truthMode: 'observed',
        generatedAt: new Date().toISOString(),
        status: 'evaluated',
      };
      const evaluation: ProofEvaluation = {
        experimentId: 'exp-2',
        hypothesisId: 'hyp-2',
        workspaceId: 'ws-1',
        correlationId: 'corr-2',
        verdict: 'refuted',
        confidence: 0.7,
        evidenceCount: 2,
        meanDelta: -0.1,
        reason: 'test',
        evaluatedAt: new Date().toISOString(),
      };
      const result = svc.build(hypothesis, evaluation);
      expect(result).not.toBeNull();
      expect(result!.headline).toContain('not supported');
      expect(result!.verdict).toBe('refuted');
    });
  });
});
