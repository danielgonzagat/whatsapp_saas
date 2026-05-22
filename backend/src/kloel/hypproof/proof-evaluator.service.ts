import { Injectable, Logger } from '@nestjs/common';
import type { Hypothesis, SpineSignal, ProofVerdict } from './types';

const CONFIRMATION_DELTA_THRESHOLD = 0.05;
const REFUTATION_DELTA_THRESHOLD = -0.05;
const MIN_CONFIDENCE_FOR_CONCLUSION = 0.5;
const MIN_SAMPLE_SIZE_FOR_CONCLUSION = 2;

export interface ProofEvaluationResult {
  readonly verdict: ProofVerdict;
  readonly confidence: number;
  readonly sampleSize: number;
  readonly deltaVsBaseline: number;
}

@Injectable()
export class ProofEvaluatorService {
  private readonly logger = new Logger(ProofEvaluatorService.name);

  evaluate(
    hypothesis: Hypothesis,
    observedEvents: readonly SpineSignal[],
    baselineEvents: readonly SpineSignal[],
  ): ProofEvaluationResult {
    const sampleSize = observedEvents.length;

    const observedPositiveRate = computeValencePositiveRate(observedEvents);
    const baselinePositiveRate = computeValencePositiveRate(baselineEvents);
    const deltaVsBaseline = observedPositiveRate - baselinePositiveRate;

    const rawConfidence = hypothesis.confidence * (1 - Math.exp(-sampleSize / 10));
    const confidence = clamp(rawConfidence, 0, 1);

    if (sampleSize < MIN_SAMPLE_SIZE_FOR_CONCLUSION) {
      this.logger.debug(
        `Insufficient sample size for hypothesis ${hypothesis.id}: ${sampleSize} < ${MIN_SAMPLE_SIZE_FOR_CONCLUSION}`,
      );
      return {
        verdict: 'inconclusive',
        confidence,
        sampleSize,
        deltaVsBaseline,
      };
    }

    if (confidence < MIN_CONFIDENCE_FOR_CONCLUSION) {
      return {
        verdict: 'inconclusive',
        confidence,
        sampleSize,
        deltaVsBaseline,
      };
    }

    const verdict = resolveVerdict(deltaVsBaseline);

    return {
      verdict,
      confidence,
      sampleSize,
      deltaVsBaseline,
    };
  }
}

function computeValencePositiveRate(events: readonly SpineSignal[]): number {
  if (events.length === 0) {
    return 0;
  }
  const positiveCount = events.filter((e) => e.valence === 'positive').length;
  return positiveCount / events.length;
}

function resolveVerdict(delta: number): ProofVerdict {
  if (delta >= CONFIRMATION_DELTA_THRESHOLD) {
    return 'confirmed';
  }
  if (delta <= REFUTATION_DELTA_THRESHOLD) {
    return 'refuted';
  }
  return 'inconclusive';
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
