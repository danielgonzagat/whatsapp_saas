import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseScopeFile,
} from '../../types';
import type { BuildPulseConvergencePlanInput } from './types';
import { uniqueStrings, compactText } from './helpers';
import { discoverSourceLabelFromObservedContext } from '../../dynamic-reality-kernel';
import { determineScopeProductImpact, buildScopeVisionDelta } from './priorities';
import { relatedFailedGateNames } from './scenario-evidence';
import { OBSERVED_ARTIFACTS } from './state';

export function getScopeFilePriority(file: PulseScopeFile | null): PulseConvergenceUnitPriority {
  if (!file) {
    return 'P2';
  }
  if (file.runtimeCritical) {
    return 'P0';
  }
  if (file.userFacing || file.protectedByGovernance) {
    return 'P1';
  }
  return 'P3';
}

export function buildScopeUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  let units: PulseConvergenceUnit[] = [];
  let scopeImpactContext = {
    missingCodacyFiles: input.scopeState.parity.missingCodacyFiles.length,
    userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
  };

  if (input.scopeState.parity.missingCodacyFiles.length > 0) {
    let gateNames = relatedFailedGateNames(input.certification, [input.scopeState.parity.reason]);
    units.push({
      id: 'scope-codacy-parity',
      order: 0,
      priority: 'P1',
      kind: 'scope',
      status: 'open',
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'high',
      evidenceMode: 'observed',
      confidence: input.scopeState.parity.confidence,
      productImpact: determineScopeProductImpact(scopeImpactContext),
      title: 'Close Codacy Scope Parity Gaps',
      summary: compactText(input.scopeState.parity.reason, 320),
      visionDelta: buildScopeVisionDelta(scopeImpactContext),
      targetState:
        'Every observed Codacy hotspot file must exist in the dynamic repo inventory and be classifiable by PULSE.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['SCOPE_PARITY_GAP'],
      artifactPaths: [OBSERVED_ARTIFACTS.scopeState, OBSERVED_ARTIFACTS.codacyState],
      relatedFiles: input.scopeState.parity.missingCodacyFiles,
      validationArtifacts: [
        OBSERVED_ARTIFACTS.scopeState,
        OBSERVED_ARTIFACTS.codacyState,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass scopeClosed',
      exitCriteria: [
        'scopeClosed returns pass in the next certification run.',
        'All observed Codacy hotspot files are covered by the repo inventory.',
      ],
    });
  }

  if (input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length > 0) {
    let scopeOnlyModuleCandidates = input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates;
    let gateNames = relatedFailedGateNames(input.certification, scopeOnlyModuleCandidates);
    units.push({
      id: 'scope-unmapped-module-candidates',
      order: 0,
      priority: 'P2',
      kind: 'scope',
      status: 'open',
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'medium',
      evidenceMode: 'inferred',
      confidence: 'medium',
      productImpact: determineScopeProductImpact({
        missingCodacyFiles: 0,
        userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
      }),
      title: 'Resolve Scope-Only Module Candidates',
      summary: compactText(
        `Scope-derived user-facing module candidates remain outside the resolved manifest: ${scopeOnlyModuleCandidates.join(', ')}.`,
        320,
      ),
      visionDelta: buildScopeVisionDelta({
        missingCodacyFiles: 0,
        userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
      }),
      targetState:
        'All user-facing scope-derived module candidates map into the resolved manifest or are deliberately reclassified.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: scopeOnlyModuleCandidates,
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['SCOPE_MODULE_DRIFT'],
      artifactPaths: [OBSERVED_ARTIFACTS.scopeState, OBSERVED_ARTIFACTS.resolvedManifest],
      relatedFiles: input.scopeState.files
        .filter(
          (file) =>
            Boolean(file.moduleCandidate) &&
            input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.includes(
              file.moduleCandidate!,
            ),
        )
        .map((file) => file.path),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.scopeState,
        OBSERVED_ARTIFACTS.resolvedManifest,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass truthExtractionPass',
      exitCriteria: [
        'truthExtractionPass returns pass in the next certification run.',
        'Scope-only module candidates are either resolved into the manifest overlay or intentionally excluded.',
      ],
    });
  }

  return units;
}
