/**
 * UTP-MATURITY-004 — Maturity Transition Detector.
 *
 * Given a sequence of historical MaturityVerdicts (ordered by
 * classifiedAt), detects stage transitions and reports them as
 * TransitionRecords.
 *
 * A transition is detected when the stage changes between two
 * consecutive verdicts. The detector also validates that:
 *   - The transition goes FORWARD only (validacao → tracao → ...)
 *   - The confidence at the new stage is above a minimum threshold
 *   - Backwards transitions are flagged with reduced confidence
 */
import type { MaturityStage, MaturityVerdict, TransitionRecord } from './maturity.types';

const MIN_TRANSITION_CONFIDENCE = 0.6;

export function detectTransitions(
  history: readonly MaturityVerdict[],
): readonly TransitionRecord[] {
  const transitions: TransitionRecord[] = [];

  if (history.length < 2) return transitions;

  const sorted = [...history].sort(
    (a, b) =>
      new Date(a.classifiedAt).getTime() - new Date(b.classifiedAt).getTime(),
  );

  const stageOrder: Readonly<Record<MaturityStage, number>> = {
    validacao: 0,
    tracao: 1,
    crescimento: 2,
    maturidade: 3,
    otimizacao: 4,
  };

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as MaturityVerdict;
    const curr = sorted[i] as MaturityVerdict;

    if (prev.stage === curr.stage) continue;

    const prevOrd = stageOrder[prev.stage] ?? 0;
    const currOrd = stageOrder[curr.stage] ?? 0;

    let transitionConfidence: number;
    let fromStage: MaturityStage;
    let toStage: MaturityStage;
    let isForward: boolean;

    if (currOrd > prevOrd) {
      fromStage = prev.stage;
      toStage = curr.stage;
      isForward = true;
      transitionConfidence = Math.min(
        1,
        curr.confidence * (1 + (currOrd - prevOrd) * 0.05),
      );
    } else {
      fromStage = prev.stage;
      toStage = curr.stage;
      isForward = false;
      transitionConfidence = Math.min(
        0.5,
        curr.confidence * 0.5,
      );
    }

    if (transitionConfidence < MIN_TRANSITION_CONFIDENCE && isForward) continue;

    transitions.push({
      fromStage,
      toStage,
      observedAt: curr.classifiedAt,
      confidence: round2(transitionConfidence),
    });
  }

  return transitions;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
