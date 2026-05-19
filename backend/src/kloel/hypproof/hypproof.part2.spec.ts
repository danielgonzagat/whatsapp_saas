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
      } as SpineEmitterService;
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
