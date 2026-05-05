import type {
  PulseCertificationTarget,
  PulseExecutionEvidence,
  PulseGateName,
  PulseGateResult,
  PulseManifest,
} from '../../types';

import type { ComputeCertificationInput } from './helpers';

import { _gatePassLabel, _gateFailLabel, _missingEvidenceLabel, _checkerGapLabel } from './helpers';

import {
  filterCodacyIssues,
  isCodacySecurityIssue,
  isCodacyIsolationIssue,
} from '../../cert-helpers';

import { CERTIFICATION_FINDING_PREDICATES } from '../../cert-constants';

import {
  gateFail,
  evaluateScopeGate,
  evaluateTruthExtractionGate,
  evaluateStaticGate,
  evaluateRuntimeGate,
  evaluateChangeRiskGate,
  evaluateBrowserGate,
} from '../../cert-gate-evaluators';

import {
  evaluatePatternGate,
  evaluateProductionDecisionGate,
  evaluateRecoveryGate,
  evaluateObservabilityGate,
  withTemporaryGateAcceptance,
} from '../../cert-gate-pattern';

import { evaluateFlowGate, evaluateInvariantGate } from '../../cert-gate-evaluators-actor';

import { deriveZeroValue } from '../../dynamic-reality-kernel';

import { certificationTargetRequiresGate } from './compute-helpers';

export interface GateCoreContext {
  env: string;
  manifest: PulseManifest | null;
  certificationTarget: PulseCertificationTarget;
  certificationTiers: PulseManifest['certificationTiers'];
  evidenceSummary: Partial<PulseExecutionEvidence>;
  gateEvidence: Partial<Record<PulseGateName, unknown[]>>;
}

export function buildCertificationCoreGates(
  input: ComputeCertificationInput,
  ctx: GateCoreContext,
): Record<PulseGateName, PulseGateResult> {
  const { env, manifest, certificationTarget, certificationTiers, evidenceSummary, gateEvidence } =
    ctx;

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
          certificationTiers,
          'flowPass',
          gateEvidence,
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
  };
}
