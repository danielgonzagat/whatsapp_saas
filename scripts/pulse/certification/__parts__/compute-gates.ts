import type {
  PulseCertification,
  PulseGateResult,
} from '../../types.evidence';
import type {
  PulseEnvironment,
  PulseGateName,
  PulseManifest,
} from '../../types.manifest';
import type {
  ComputeCertificationInput,
} from '../helpers';
import {
  _checkerGapLabel,
  _missingEvidenceLabel,
  _productFailureLabel,
  _gatePassLabel,
  _observedTruthModeLabel,
  _highConfidenceLabel,
} from '../helpers';
import {
  getCertificationTarget,
  filterCodacyIssues,
  isCodacySecurityIssue,
  isCodacyIsolationIssue,
} from '../../cert-helpers';
import { CERTIFICATION_FINDING_PREDICATES } from '../../cert-constants';
import { gateFail } from '../../cert-gate-evaluators/gate-fail';
import {
  evaluateEvidenceFreshGate,
  evaluateScopeGate,
  evaluateStaticGate,
  evaluateRuntimeGate,
  evaluateChangeRiskGate,
} from '../../cert-gate-evaluators/main';
import {
  evaluateTruthExtractionGate,
  evaluatePulseSelfTrustGate,
} from '../../cert-gate-evaluators/truth-gates';
import { evaluateBrowserGate } from '../../cert-gate-browser';
import {
  evaluatePatternGate,
  evaluateProductionDecisionGate,
  evaluateRecoveryGate,
  evaluateObservabilityGate,
  withTemporaryGateAcceptance,
} from '../../cert-gate-pattern';
import {
  evaluateFlowGate,
  evaluateInvariantGate,
  evaluateSyntheticCoverageGate,
} from '../../cert-gate-evaluators-actor';
import {
  evaluateBreakpointPrecisionGate,
  evaluateCriticalPathObservedGate,
  evaluateExecutionMatrixCompleteGate,
} from '../../cert-gate-execution-matrix';
import {
  detectPlaceholderTests,
  detectWeakStatusAssertions,
  detectTypeEscapeHatches,
} from '../../test-honesty/main';
import { deriveZeroValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  certificationTargetRequiresGate,
  evaluateActorGateForCurrentObjective,
} from '../compute-helpers';
import { evaluateNoOverclaimPassForCurrentRun } from '../compute-gate-evaluation';
export interface GateComputeContext {
  manifest: PulseManifest | null;
  certificationTarget: ReturnType<typeof getCertificationTarget>;
  certificationTiers: ReturnType<typeof import('../../cert-helpers').getCertificationTiers>;
  env: PulseEnvironment;
  evidenceSummary: PulseCertification['evidenceSummary'];
  gateEvidence: PulseCertification['gateEvidence'];
  pathCoverage: ReturnType<typeof import('../helpers').loadPathCoverageGateState>;
  proofReadinessSummary: ReturnType<typeof import('../helpers').loadProofReadinessSummary>;
  productionProofReadinessGap: boolean;
  noHardcodedRealityState: PulseCertification['noHardcodedRealityState'];
  noHardcodedRealitySummary: ReturnType<typeof import('../../no-hardcoded-reality-state').summarizeNoHardcodedRealityState>;
  noHardcodedRealityGap: boolean;
  multiCycleConvergenceResult: PulseGateResult;
}
export function buildAllGates(
  input: ComputeCertificationInput,
  ctx: GateComputeContext,
): Record<PulseGateName, PulseGateResult> {
  const { manifest } = ctx;
  const certificationTarget = ctx.certificationTarget;
  const env = ctx.env;
  const evidenceSummary = ctx.evidenceSummary;
  return {
    scopeClosed: withTemporaryGateAcceptance(
      'scopeClosed',
      manifest,
      evaluateScopeGate(input.scopeState),
    ),
    adapterSupported:
      input.manifestResult.unsupportedStacks.length === deriveZeroValue()
        ? {
            status: _gatePassLabel(),
            reason: 'All declared stack adapters are supported by the current PULSE foundation.',
          }
        : withTemporaryGateAcceptance(
            'adapterSupported',
            manifest,
            gateFail(
              `Unsupported adapters declared in manifest: ${input.manifestResult.unsupportedStacks.join(', ')}.`,
              _checkerGapLabel(),
            ),
          ),
    specComplete:
      input.manifestResult.manifest !== null &&
      input.manifestResult.issues.length === deriveZeroValue()
        ? {
            status: _gatePassLabel(),
            reason: 'pulse.manifest.json is present and passed structural validation.',
          }
        : withTemporaryGateAcceptance(
            'specComplete',
            manifest,
            gateFail(
              input.manifestResult.issues.map((issue) => issue.description).join(' ') ||
                'pulse.manifest.json is missing or invalid.',
              _checkerGapLabel(),
            ),
          ),
    truthExtractionPass: withTemporaryGateAcceptance(
      'truthExtractionPass',
      manifest,
      evaluateTruthExtractionGate(
        input.codebaseTruth,
        input.resolvedManifest,
        input.scopeState,
        input.capabilityState,
        input.flowProjection,
      ),
    ),
    staticPass: withTemporaryGateAcceptance(
      'staticPass',
      manifest,
      evaluateStaticGate(input.health, manifest, input.scopeState.codacy),
    ),
    runtimePass: withTemporaryGateAcceptance(
      'runtimePass',
      manifest,
      evaluateRuntimeGate(env, evidenceSummary, input.externalSignalState),
    ),
    changeRiskPass: withTemporaryGateAcceptance(
      'changeRiskPass',
      manifest,
      evaluateChangeRiskGate(input.externalSignalState),
    ),
    productionDecisionPass: withTemporaryGateAcceptance(
      'productionDecisionPass',
      manifest,
      evaluateProductionDecisionGate(
        input.externalSignalState,
        input.capabilityState,
        input.flowProjection,
      ),
    ),
    browserPass: withTemporaryGateAcceptance(
      'browserPass',
      manifest,
      evaluateBrowserGate(env, evidenceSummary, certificationTarget),
    ),
    flowPass: withTemporaryGateAcceptance(
      'flowPass',
      manifest,
      evaluateFlowGate(
        evidenceSummary,
        manifest,
        certificationTargetRequiresGate(
          certificationTarget,
          ctx.certificationTiers,
          'flowPass',
          ctx.gateEvidence,
        ),
      ),
    ),
    invariantPass: withTemporaryGateAcceptance(
      'invariantPass',
      manifest,
      evaluateInvariantGate(evidenceSummary),
    ),
    securityPass: evaluatePatternGate(
      'securityPass',
      'No blocking security findings are open in this run.',
      'Security certification objective found blocking evidence.',
      input.health,
      manifest,
      CERTIFICATION_FINDING_PREDICATES.securityPass,
      filterCodacyIssues(input.scopeState.codacy, isCodacySecurityIssue),
    ),
    isolationPass: evaluatePatternGate(
      'isolationPass',
      'No blocking tenant isolation findings are open.',
      'Isolation certification objective found blocking evidence.',
      input.health,
      manifest,
      CERTIFICATION_FINDING_PREDICATES.isolationPass,
      filterCodacyIssues(input.scopeState.codacy, isCodacyIsolationIssue),
    ),
    recoveryPass: withTemporaryGateAcceptance(
      'recoveryPass',
      manifest,
      evaluateRecoveryGate(env, input.health, manifest, evidenceSummary),
    ),
    performancePass: withTemporaryGateAcceptance(
      'performancePass',
      manifest,
      env === 'scan'
        ? gateFail('Performance evidence was not exercised in scan mode.', _missingEvidenceLabel())
        : evaluatePatternGate(
            'performancePass',
            'Performance budgets have no blocking findings in this run.',
            'Performance certification objective found blocking evidence.',
            input.health,
            manifest,
            CERTIFICATION_FINDING_PREDICATES.performancePass,
          ),
    ),
    observabilityPass: withTemporaryGateAcceptance(
      'observabilityPass',
      manifest,
      evaluateObservabilityGate(input.health, manifest, evidenceSummary),
    ),
    customerPass: withTemporaryGateAcceptance(
      'customerPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'customerPass',
        'customer',
        evidenceSummary.customer,
        certificationTarget,
        ctx.certificationTiers,
        ctx.gateEvidence,
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
        ctx.certificationTiers,
        ctx.gateEvidence,
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
        ctx.certificationTiers,
        ctx.gateEvidence,
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
        ctx.certificationTiers,
        ctx.gateEvidence,
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
      evaluateNoOverclaimPassForCurrentRun(
        ctx.multiCycleConvergenceResult,
        input.autonomyState,
        ctx.productionProofReadinessGap,
        ctx.noHardcodedRealityGap,
        ctx.proofReadinessSummary,
        ctx.noHardcodedRealitySummary,
        input.previousDirective,
        input.previousCertificate,
      ),
    ),
    executionMatrixCompletePass: withTemporaryGateAcceptance(
      'executionMatrixCompletePass',
      manifest,
      evaluateExecutionMatrixCompleteGate(input.executionMatrix),
    ),
    criticalPathObservedPass: withTemporaryGateAcceptance(
      'criticalPathObservedPass',
      manifest,
      evaluateCriticalPathObservedGate(input.executionMatrix, ctx.pathCoverage),
    ),
    breakpointPrecisionPass: withTemporaryGateAcceptance(
      'breakpointPrecisionPass',
      manifest,
      evaluateBreakpointPrecisionGate(input.executionMatrix),
    ),
    multiCycleConvergencePass:
      env !== 'scan' &&
      ctx.multiCycleConvergenceResult.status === _gatePassLabel() &&
      evidenceSummary.runtime.probes.filter((p) => p.executed).length === deriveZeroValue()
        ? gateFail(
            'multiCycleConvergence: convergence cycles were non-regressing but no runtime evidence coverage was collected (0 probes executed). Run PULSE with --deep against a live backend.',
            _missingEvidenceLabel(),
            { evidenceMode: _observedTruthModeLabel(), confidence: _highConfidenceLabel() },
          )
        : ctx.multiCycleConvergenceResult,
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
