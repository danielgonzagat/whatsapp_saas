import type { PulseGateResult } from '../types.evidence';
import type { PulseAutonomyStateSnapshot } from '../cert-gate-multi-cycle/helpers';
import type {
  PulseDirectiveSnapshot,
  PulseCertificateSnapshot,
  PulseProofReadinessSummary,
} from '../cert-gate-overclaim';
import type { PulseNoHardcodedRealitySummary } from '../no-hardcoded-reality-state';

import {
  _checkerGapLabel,
  _gateFailLabel,
  _gatePassLabel,
  _highConfidenceLabel,
  _observedTruthModeLabel,
  NO_HARDCODED_REALITY_ARTIFACT,
} from './helpers';

import { PROOF_READINESS_ARTIFACT } from '../proof-readiness-artifact';
import { gateFail } from '../cert-gate-evaluators/gate-fail';
import {
  evaluateNoOverclaimGate,
  formatProofReadinessGap,
} from '../cert-gate-overclaim';
import { REQUIRED_NON_REGRESSING_CYCLES } from '../cert-gate-multi-cycle/helpers';
import { formatNoHardcodedRealityBlocker } from '../no-hardcoded-reality-state';

export function evaluateNoOverclaimPassForCurrentRun(
  multiCycleConvergenceResult: PulseGateResult,
  autonomyState: PulseAutonomyStateSnapshot | null | undefined,
  productionProofReadinessGap: boolean,
  noHardcodedRealityGap: boolean,
  proofReadinessSummary: PulseProofReadinessSummary | undefined,
  noHardcodedRealitySummary: PulseNoHardcodedRealitySummary,
  previousDirective: PulseDirectiveSnapshot | null | undefined,
  previousCertificate: PulseCertificateSnapshot | null | undefined,
): PulseGateResult {
  const currentCycleProofProven = multiCycleConvergenceResult.status === _gatePassLabel();
  const currentCycleProof = autonomyState
    ? {
        proven: currentCycleProofProven,
        ...(currentCycleProofProven ? { successfulNonRegressingCycles: REQUIRED_NON_REGRESSING_CYCLES } : {}),
      }
    : { proven: false };
  const currentProofAllowsProduction =
    currentCycleProofProven && !productionProofReadinessGap && !noHardcodedRealityGap;

  const currentDirective: PulseDirectiveSnapshot = {
    zeroPromptProductionGuidanceVerdict: currentProofAllowsProduction ? 'SIM' : 'NAO',
    productionAutonomyVerdict: 'NAO',
    authorityMode: currentProofAllowsProduction ? 'autonomous-execution' : 'advisory-only',
    advisoryOnly: !currentProofAllowsProduction,
    autonomyProof: {
      cycleProof: currentCycleProof,
      proofReadiness: proofReadinessSummary,
    },
    autonomyReadiness: {
      canDeclareComplete: false,
    },
    proofReadiness: proofReadinessSummary,
  };
  const currentCertificate: PulseCertificateSnapshot = {
    status: undefined,
    rawContent: undefined,
  };
  const previousResult = evaluateNoOverclaimGate(
    previousDirective,
    previousCertificate,
  );
  if (previousResult.status === _gateFailLabel()) {
    return previousResult;
  }
  if (productionProofReadinessGap) {
    return gateFail(
      `overclaim:completionProofReadiness — certification cannot complete while ${PROOF_READINESS_ARTIFACT} has non-observed production proof (${formatProofReadinessGap(proofReadinessSummary ?? {})}).`,
      _checkerGapLabel(),
      { evidenceMode: _observedTruthModeLabel(), confidence: _highConfidenceLabel() },
    );
  }
  if (noHardcodedRealityGap) {
    return gateFail(
      `overclaim:noHardcodedRealityState — certification cannot complete while ${NO_HARDCODED_REALITY_ARTIFACT} reports hardcoded reality authority (${formatNoHardcodedRealityBlocker(noHardcodedRealitySummary)}).`,
      _checkerGapLabel(),
      { evidenceMode: _observedTruthModeLabel(), confidence: _highConfidenceLabel() },
    );
  }
  return evaluateNoOverclaimGate(currentDirective, currentCertificate);
}
