import { Injectable, Logger } from '@nestjs/common';
import type { Observation, ProofEvaluation, ProofVerdict } from './types';

const CONFIRMATION_DELTA_THRESHOLD = 0.05;
const REFUTATION_DELTA_THRESHOLD = -0.05;
const MIN_CONFIDENCE_FOR_CONCLUSION = 0.5;
const MIN_EVIDENCE_FOR_CONCLUSION = 2;

@Injectable()
export class ProofEvaluatorService {
  private readonly logger = new Logger(ProofEvaluatorService.name);

  evaluate(
    observations: readonly Observation[],
    hypothesisId: string,
    experimentId: string,
    workspaceId: string,
    correlationId: string,
  ): ProofEvaluation | null {
    if (observations.length === 0) {
      this.logger.warn(`No observations to evaluate for experiment ${experimentId}`);
      return null;
    }

    const totalEvidence = Math.max(...observations.map((o) => o.evidenceCount));
    const meanDelta =
      observations.reduce((sum, o) => sum + o.delta, 0) / observations.length;
    const meanConfidence =
      observations.reduce((sum, o) => sum + o.confidence, 0) / observations.length;

    if (totalEvidence < MIN_EVIDENCE_FOR_CONCLUSION) {
      this.logger.debug(
        `Insufficient evidence for experiment ${experimentId}: ${totalEvidence} < ${MIN_EVIDENCE_FOR_CONCLUSION}`,
      );
      return {
        experimentId,
        hypothesisId,
        workspaceId,
        correlationId,
        verdict: 'inconclusive',
        confidence: meanConfidence,
        evidenceCount: totalEvidence,
        meanDelta,
        reason: `Only ${totalEvidence} evidence point(s) observed; need at least ${MIN_EVIDENCE_FOR_CONCLUSION}.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    if (meanConfidence < MIN_CONFIDENCE_FOR_CONCLUSION) {
      return {
        experimentId,
        hypothesisId,
        workspaceId,
        correlationId,
        verdict: 'inconclusive',
        confidence: meanConfidence,
        evidenceCount: totalEvidence,
        meanDelta,
        reason: `Observation confidence ${meanConfidence.toFixed(2)} below threshold ${MIN_CONFIDENCE_FOR_CONCLUSION}.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    const verdict = resolveVerdict(meanDelta);

    return {
      experimentId,
      hypothesisId,
      workspaceId,
      correlationId,
      verdict,
      confidence: meanConfidence,
      evidenceCount: totalEvidence,
      meanDelta,
      reason: `Mean delta ${meanDelta.toFixed(3)} with ${totalEvidence} evidence points supports verdict: ${verdict}.`,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

function resolveVerdict(meanDelta: number): ProofVerdict {
  if (meanDelta >= CONFIRMATION_DELTA_THRESHOLD) return 'confirmed';
  if (meanDelta <= REFUTATION_DELTA_THRESHOLD) return 'refuted';
  return 'inconclusive';
}
