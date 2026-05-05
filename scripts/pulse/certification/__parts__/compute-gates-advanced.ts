import type {
  PulseCertificationTarget,
  PulseExecutionEvidence,
  PulseGateResult,
} from '../../types.evidence';
import type { PulseGateName, PulseManifest } from '../../types.manifest';

import type { PulsePathCoverageGateState } from '../../cert-gate-execution-matrix';
import type {
  PulseCertificateSnapshot,
  PulseDirectiveSnapshot,
  PulseProofReadinessSummary,
} from '../../cert-gate-overclaim';

import type { ComputeCertificationInput } from './helpers';

import {
  _gatePassLabel,
  _gateFailLabel,
  _productFailureLabel,
  _checkerGapLabel,
  _highConfidenceLabel,
  _observedTruthModeLabel,
  NO_HARDCODED_REALITY_ARTIFACT,
} from './helpers';

import { gateFail } from '../../__parts__/cert-gate-evaluators/gate-fail';
import { evaluateEvidenceFreshGate } from '../../__parts__/cert-gate-evaluators/main';
import { evaluatePulseSelfTrustGate } from '../../__parts__/cert-gate-evaluators/truth-gates';

import { withTemporaryGateAcceptance } from '../../cert-gate-pattern';

import { evaluateActorGate, evaluateSyntheticCoverageGate } from '../../cert-gate-evaluators-actor';

import { evaluateNoOverclaimGate, formatProofReadinessGap } from '../../cert-gate-overclaim';

import { PROOF_READINESS_ARTIFACT } from '../../proof-readiness-artifact';
import { REQUIRED_NON_REGRESSING_CYCLES } from '../../cert-gate-multi-cycle/__parts__/helpers';
import {
  evaluateBreakpointPrecisionGate,
  evaluateCriticalPathObservedGate,
  evaluateExecutionMatrixCompleteGate,
} from '../../cert-gate-execution-matrix';
import {
  detectPlaceholderTests,
  detectWeakStatusAssertions,
  detectTypeEscapeHatches,
} from '../../test-honesty';
import { formatNoHardcodedRealityBlocker } from '../../no-hardcoded-reality-state';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';

import {
  certificationTargetRequiresGate,
  evaluateActorGateForCurrentObjective,
} from './compute-helpers';

export interface GateAdvancedContext {
  env: string;
  manifest: PulseManifest | null;
  certificationTarget: PulseCertificationTarget;
  certificationTiers: PulseManifest['certificationTiers'];
  evidenceSummary: Partial<PulseExecutionEvidence>;
  gateEvidence: Partial<Record<PulseGateName, unknown[]>>;
  multiCycleConvergenceResult: PulseGateResult;
  pathCoverage: PulsePathCoverageGateState | null;
  productionProofReadinessGap: boolean;
  noHardcodedRealityGap: boolean;
  noHardcodedRealitySummary: Record<string, unknown>;
  proofReadinessSummary: PulseProofReadinessSummary | undefined;
}

export function buildCertificationAdvancedGates(
  input: ComputeCertificationInput,
  ctx: GateAdvancedContext,
): Record<PulseGateName, PulseGateResult> {
  const {
    env,
    manifest,
    certificationTarget,
    certificationTiers,
    evidenceSummary,
    gateEvidence,
    multiCycleConvergenceResult,
    pathCoverage,
    productionProofReadinessGap,
    noHardcodedRealityGap,
    noHardcodedRealitySummary,
    proofReadinessSummary,
  } = ctx;

  return {
    customerPass: withTemporaryGateAcceptance(
      'customerPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'customerPass',
        'customer',
        evidenceSummary.customer,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    operatorPass: withTemporaryGateAcceptance(
      'operatorPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'operatorPass',
        'operator',
        evidenceSummary.operator,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    adminPass: withTemporaryGateAcceptance(
      'adminPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'adminPass',
        'admin',
        evidenceSummary.admin,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    soakPass: withTemporaryGateAcceptance(
      'soakPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'soakPass',
        'soak',
        evidenceSummary.soak,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    syntheticCoveragePass: withTemporaryGateAcceptance(
      'syntheticCoveragePass',
      manifest,
      evaluateSyntheticCoverageGate(evidenceSummary),
    ),
    evidenceFresh: evaluateEvidenceFreshGate(
      evidenceSummary,
      input.scopeState.codacy,
      input.externalSignalState,
    ),
    pulseSelfTrustPass: withTemporaryGateAcceptance(
      'pulseSelfTrustPass',
      manifest,
      evaluatePulseSelfTrustGate(
        input.parserInventory,
        input.capabilityState,
        input.flowProjection,
        input.selfTrustReport,
        evidenceSummary.executionTrace,
      ),
    ),
    noOverclaimPass: withTemporaryGateAcceptance(
      'noOverclaimPass',
      manifest,
      (() => {
        const currentCycleProofProven = multiCycleConvergenceResult.status === _gatePassLabel();
        const currentCycleProof = input.autonomyState
          ? {
              proven: currentCycleProofProven,
              successfulNonRegressingCycles: currentCycleProofProven
                ? REQUIRED_NON_REGRESSING_CYCLES
                : undefined,
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
          input.previousDirective,
          input.previousCertificate,
        );
        if (previousResult.status === _gateFailLabel()) {
          return previousResult;
        }
        if (productionProofReadinessGap) {
          return gateFail(
            `overclaim:completionProofReadiness — certification cannot complete while ${PROOF_READINESS_ARTIFACT} has non-observed production proof (${formatProofReadinessGap(proofReadinessSummary ?? ({} as PulseProofReadinessSummary))}).`,
            _checkerGapLabel(),
            { evidenceMode: _observedTruthModeLabel(), confidence: _highConfidenceLabel() },
          );
        }
        if (noHardcodedRealityGap) {
          return gateFail(
            `overclaim:noHardcodedRealityState — certification cannot complete while ${NO_HARDCODED_REALITY_ARTIFACT} reports hardcoded reality authority (${formatNoHardcodedRealityBlocker(noHardcodedRealitySummary as ReturnType<typeof import('../../no-hardcoded-reality-state').summarizeNoHardcodedRealityState>)}).`,
            _checkerGapLabel(),
            { evidenceMode: _observedTruthModeLabel(), confidence: _highConfidenceLabel() },
          );
        }
        return evaluateNoOverclaimGate(currentDirective, currentCertificate);
      })(),
    ),
    executionMatrixCompletePass: withTemporaryGateAcceptance(
      'executionMatrixCompletePass',
      manifest,
      evaluateExecutionMatrixCompleteGate(input.executionMatrix),
    ),
    criticalPathObservedPass: withTemporaryGateAcceptance(
      'criticalPathObservedPass',
      manifest,
      evaluateCriticalPathObservedGate(input.executionMatrix, pathCoverage),
    ),
    breakpointPrecisionPass: withTemporaryGateAcceptance(
      'breakpointPrecisionPass',
      manifest,
      evaluateBreakpointPrecisionGate(input.executionMatrix),
    ),
    multiCycleConvergencePass: multiCycleConvergenceResult,
    testHonestyPass: withTemporaryGateAcceptance(
      'testHonestyPass',
      manifest,
      (() => {
        const result = detectPlaceholderTests(input.rootDir);
        if (result.count === deriveZeroValue()) {
          return {
            status: _gatePassLabel(),
            reason: 'No placeholder tests detected in the repository.',
          };
        }
        return gateFail(
          `Found ${result.count} file(s) with placeholder tests: ${result.files.slice(0, 10).join(', ')}${result.files.length > 10 ? `... (and ${result.files.length - 10} more)` : ''}.`,
          _productFailureLabel(),
        );
      })(),
    ),
    assertionStrengthPass: withTemporaryGateAcceptance(
      'assertionStrengthPass',
      manifest,
      (() => {
        const result = detectWeakStatusAssertions(input.rootDir);
        if (result.count === deriveZeroValue()) {
          return {
            status: _gatePassLabel(),
            reason: 'No weak status assertions detected in e2e specs.',
          };
        }
        return gateFail(
          `Found ${result.count} file(s) with weak assertions: ${result.files.slice(0, 10).join(', ')}${result.files.length > 10 ? `... (and ${result.files.length - 10} more)` : ''}.`,
          _productFailureLabel(),
        );
      })(),
    ),
    typeIntegrityPass: withTemporaryGateAcceptance(
      'typeIntegrityPass',
      manifest,
      (() => {
        const result = detectTypeEscapeHatches(input.rootDir);
        if (result.count === deriveZeroValue()) {
          return {
            status: _gatePassLabel(),
            reason: 'Type-integrity evidence has no escape-hatch findings.',
          };
        }
        return gateFail(
          `Found ${result.count} type-integrity escape-hatch finding(s): ${result.locations.slice(0, 10).join(', ')}${result.locations.length > 10 ? `... (and ${result.locations.length - 10} more)` : ''}.`,
          _productFailureLabel(),
        );
      })(),
    ),
  };
}
