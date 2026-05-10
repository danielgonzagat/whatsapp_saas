import type { PulseAutonomyIterationRecord, PulseAutonomyState } from '../../types.autonomy';
import type { PulseGateFailureClass } from '../../types.gate-failure';
import type { PulseGateResult } from '../../types.evidence';
import type { PulseTruthMode } from '../../types.structural';
import type { PulseConvergenceEvidenceConfidence } from '../../types.convergence';

import { gateFail } from '../../cert-gate-evaluators/gate-fail';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverConvergenceEvidenceConfidenceLabels } from '../../__kernel_additions__/discoverConvergenceEvidenceConfidenceLabels';
import {
  discoverDoDGateStatusLabels,
  discoverTruthModeLabels,
} from '../../dynamic-reality-kernel/__parts__/type-contract-engines';
import { discoverExternalAdapterStatusLabels } from '../../__kernel_additions__/discoverExternalAdapterStatusLabels';
import { discoverGateFailureClassLabels } from '../../dynamic-reality-kernel/type-contract-labels';

import {
  analyzeCycle,
  formatCycleLabel,
  formatNumericTransition,
  REQUIRED_NON_REGRESSING_CYCLES,
  type CycleAnalysis,
  type PulseAutonomyStateSnapshot,
} from './helpers';

function observedFailureClassAt(index: number): PulseGateFailureClass {
  return [...discoverGateFailureClassLabels()][index] as PulseGateFailureClass;
}

function observedTruthModeAt(index: number): PulseTruthMode {
  return [...discoverTruthModeLabels()][index] as PulseTruthMode;
}

function observedConfidenceAt(index: number): PulseConvergenceEvidenceConfidence {
  return [...discoverConvergenceEvidenceConfidenceLabels()][
    index
  ] as PulseConvergenceEvidenceConfidence;
}

function observedGateStatusAt(index: number): PulseGateResult['status'] {
  return [...discoverDoDGateStatusLabels()][index] as PulseGateResult['status'];
}

/**
 * Evaluate the multiCycleConvergencePass gate.
 *
 * Returns pass when at least REQUIRED_NON_REGRESSING_CYCLES cycles in the
 * supplied autonomy state satisfy every convergence criterion.
 * Otherwise returns a structured fail describing what's missing.
 */
export function evaluateMultiCycleConvergenceGate(
  autonomyState: PulseAutonomyStateSnapshot | PulseAutonomyState | null | undefined,
): PulseGateResult {
  const history = autonomyState?.history ?? [];
  if (history.length === deriveZeroValue()) {
    return gateFail(
      'multiCycleConvergence: no autonomy iteration history found; production-autonomy verdict requires proven cycles.',
      observedFailureClassAt(deriveUnitValue()),
      {
        evidenceMode: observedTruthModeAt(deriveZeroValue()),
        confidence: observedConfidenceAt(deriveZeroValue()),
      },
    );
  }
  let realExecuted = 0;
  let nonRegressing = 0;
  let regressedScore = 0;
  let regressedTier = 0;
  let failedValidation = 0;
  let failedCodex = 0;
  let missingValidation = 0;
  let missingRuntimeValidation = 0;
  let executionMatrixCompared = 0;
  let regressedExecutionMatrix = 0;
  const executionMatrixRegressions = new Set<string>();
  const scoreRegressions = new Set<string>();
  const tierRegressions = new Set<string>();
  const adapterBlockers = new Set<string>();
  for (const [index, record] of history.entries()) {
    const analysis = analyzeCycle(record);
    if (analysis.isRealExecuted) {
      realExecuted += 1;
      if (!analysis.codexPassed) {
        failedCodex += 1;
      }
      if (!analysis.hasValidationCommands) {
        missingValidation += 1;
      } else if (!analysis.allCommandsZero) {
        failedValidation += 1;
      } else if (!analysis.hasRuntimeValidation) {
        missingRuntimeValidation += 1;
      }
      if (!analysis.scoreNonRegressing) {
        regressedScore += 1;
        scoreRegressions.add(
          `${formatCycleLabel(record, index)}:${formatNumericTransition(
            record.directiveBefore?.score ?? null,
            record.directiveAfter?.score ?? null,
          )}`,
        );
      }
      if (!analysis.blockingTierNonRegressing) {
        regressedTier += 1;
        tierRegressions.add(
          `${formatCycleLabel(record, index)}:${formatNumericTransition(
            record.directiveBefore?.blockingTier ?? null,
            record.directiveAfter?.blockingTier ?? null,
          )}`,
        );
      }
      if (!analysis.adapterClosed) {
        for (const adapter of analysis.adapterBlockers) {
          adapterBlockers.add(adapter);
        }
      }
      if (analysis.executionMatrixCompared) {
        executionMatrixCompared += 1;
      }
      if (!analysis.executionMatrixNonRegressing) {
        regressedExecutionMatrix += 1;
        for (const regression of analysis.executionMatrixRegressions) {
          executionMatrixRegressions.add(regression);
        }
      }
    }
    if (analysis.countsTowardConvergence) {
      nonRegressing += 1;
    }
  }
  if (nonRegressing >= REQUIRED_NON_REGRESSING_CYCLES) {
    return {
      status: observedGateStatusAt(deriveZeroValue()),
      reason: `${nonRegressing} non-regressing real autonomous cycle(s) observed (>= ${REQUIRED_NON_REGRESSING_CYCLES} required).`,
      evidenceMode: observedTruthModeAt(deriveZeroValue()),
      confidence: observedConfidenceAt(deriveZeroValue()),
    };
  }
  const failureClass =
    failedValidation > deriveZeroValue() ||
    failedCodex > deriveZeroValue() ||
    regressedScore > deriveZeroValue() ||
    regressedTier > deriveZeroValue() ||
    regressedExecutionMatrix > deriveZeroValue()
      ? observedFailureClassAt(deriveZeroValue())
      : observedFailureClassAt(deriveUnitValue());
  const detail = [
    `recorded=${history.length}`,
    `realExecuted=${realExecuted}`,
    `nonRegressing=${nonRegressing}/${REQUIRED_NON_REGRESSING_CYCLES}`,
    `failedCodex=${failedCodex}`,
    `failedValidation=${failedValidation}`,
    `missingValidation=${missingValidation}`,
    `missingRuntimeValidation=${missingRuntimeValidation}`,
    `regressedScore=${regressedScore}`,
    scoreRegressions.size > deriveZeroValue()
      ? `scoreRegression(s)=${[...scoreRegressions].join('|')}`
      : '',
    `regressedTier=${regressedTier}`,
    tierRegressions.size > deriveZeroValue()
      ? `tierRegression(s)=${[...tierRegressions].join('|')}`
      : '',
    `executionMatrixCompared=${executionMatrixCompared}`,
    `regressedExecutionMatrix=${regressedExecutionMatrix}`,
    executionMatrixRegressions.size > deriveZeroValue()
      ? `executionMatrixRegression(s)=${[...executionMatrixRegressions].join('|')}`
      : '',
    adapterBlockers.size > deriveZeroValue()
      ? `missing adapter(s)=${[...adapterBlockers].join('|')}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');
  return gateFail(
    `multiCycleConvergence: ${nonRegressing}/${REQUIRED_NON_REGRESSING_CYCLES} non-regressing real cycles (${detail}).`,
    failureClass,
    {
      evidenceMode: observedTruthModeAt(deriveZeroValue()),
      confidence: observedConfidenceAt(deriveZeroValue()),
    },
  );
}
