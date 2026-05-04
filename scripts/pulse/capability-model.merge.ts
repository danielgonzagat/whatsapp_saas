import type { PulseCapability, PulseStructuralRole } from './types';
import type { PulseCapabilityDoD } from './types.capabilities';
import { evaluateDone } from './definition-of-done';
import {
  buildCapabilityMaturity,
  clamp,
  inferStatus,
  pickExecutionMode,
  pickOwnerLane,
  unique,
} from './capability-model-helpers';
import {
  CAPABILITY_REQUIRED_DOD_ROLES,
  buildCapabilityDoDEvidence,
  toDoDStatus,
} from './capability-model.dod';

/**
 * Merge logic extracted from `capability-model.ts`.
 *
 * When the seed-group walker discovers an already-tracked capability id,
 * the inputs are folded into the existing record. The behaviour is
 * preserved verbatim from the previous in-file implementation.
 *
 * Extracted as a sibling so the parent module stays under the 600-line
 * touched-file architecture cap.
 */

/** Inputs collected for an existing capability about to be merged. */
export interface MergeCapabilityInput {
  capabilityId: string;
  existing: PulseCapability;
  rolesPresent: PulseStructuralRole[];
  routePatterns: string[];
  filePaths: string[];
  componentIds: Iterable<string>;
  evidenceSources: string[];
  ownerLane: PulseCapability['ownerLane'];
  executionMode: PulseCapability['executionMode'];
  protectedByGovernance: boolean;
  runtimeCritical: boolean;
  userFacing: boolean;
  highSeverityIssueCount: number;
  codacyIssueCount: number;
  confidence: number;
  truthMode: 'observed' | 'inferred' | 'aspirational';
  maturity: PulseCapability['maturity'];
}

/** Build the merged PulseCapability for an existing capability id. */
export function mergeExistingCapability(input: MergeCapabilityInput): PulseCapability {
  const {
    capabilityId,
    existing,
    rolesPresent,
    routePatterns,
    filePaths,
    componentIds,
    evidenceSources,
    ownerLane,
    executionMode,
    protectedByGovernance,
    runtimeCritical,
    userFacing,
    highSeverityIssueCount,
    codacyIssueCount,
    confidence,
    truthMode,
    maturity,
  } = input;
  const mergedRoles = unique([
    ...existing.rolesPresent,
    ...rolesPresent,
  ]).sort() as PulseStructuralRole[];
  const mergedMissingRoles = (
    ['interface', 'orchestration', 'persistence', 'side_effect'] as PulseStructuralRole[]
  ).filter((role) => !mergedRoles.includes(role));
  const mergedRoutePatterns = unique([...existing.routePatterns, ...routePatterns]).sort();
  const mergedHighSeverityIssueCount = existing.highSeverityIssueCount + highSeverityIssueCount;
  const mergedProtectedByGovernance = existing.protectedByGovernance || protectedByGovernance;
  const mergedRuntimeCritical = existing.runtimeCritical || runtimeCritical;
  const mergedSimulationOnly = mergedRoles.includes('simulation') && mergedRoles.length === 1;
  const mergedHasObservedFailure = mergedHighSeverityIssueCount > 0 && mergedRuntimeCritical;
  const mergedStatus = inferStatus(mergedRoles, mergedSimulationOnly, mergedHasObservedFailure);
  const mergedMaturity = buildCapabilityMaturity({
    rolesPresent: mergedRoles,
    routePatterns: mergedRoutePatterns,
    flowEvidenceMatches:
      existing.maturity.dimensions.runtimeEvidencePresent ||
      maturity.dimensions.runtimeEvidencePresent
        ? [
            {
              flowId: 'merged-runtime-evidence',
              status: 'accepted',
              executed: true,
              accepted: true,
              summary: 'Merged capability already carried runtime evidence.',
              artifactPaths: [],
            },
          ]
        : [],
    scenarioCoverageMatches:
      existing.maturity.dimensions.scenarioCoveragePresent ||
      maturity.dimensions.scenarioCoveragePresent
        ? [{ scenarioId: 'merged-scenario-coverage' }]
        : [],
    highSeverityIssueCount: mergedHighSeverityIssueCount,
    simulationOnly: mergedSimulationOnly,
    status: mergedStatus,
  });
  const mergedBlockingReasons = unique([
    mergedStatus === 'phantom'
      ? 'The capability exposes simulation signals without persistence or verified side effects.'
      : '',
    mergedMissingRoles.length > 0
      ? `Missing structural roles: ${mergedMissingRoles.join(', ')}.`
      : '',
    mergedMaturity.missing.length > 0
      ? `Maturity is still missing: ${mergedMaturity.missing.slice(0, 4).join(', ')}.`
      : '',
    mergedHighSeverityIssueCount > 0
      ? `Codacy still reports ${mergedHighSeverityIssueCount} HIGH issue(s) inside this capability.`
      : '',
    mergedProtectedByGovernance
      ? 'Part of this capability lives on a governance-protected surface.'
      : '',
  ]).filter(Boolean);
  const mergedTruthMode: 'observed' | 'inferred' | 'aspirational' =
    existing.truthMode === 'observed' || truthMode === 'observed'
      ? 'observed'
      : existing.truthMode === 'inferred' || truthMode === 'inferred'
        ? 'inferred'
        : 'aspirational';
  const mergedDoDEvidence = buildCapabilityDoDEvidence({
    rolesPresent: mergedRoles,
    hasRuntimeEvidence:
      existing.maturity.dimensions.runtimeEvidencePresent ||
      maturity.dimensions.runtimeEvidencePresent,
    hasScenarioCoverage:
      existing.maturity.dimensions.scenarioCoveragePresent ||
      maturity.dimensions.scenarioCoveragePresent,
    hasObservability:
      existing.maturity.dimensions.runtimeEvidencePresent ||
      maturity.dimensions.runtimeEvidencePresent,
    hasValidation: mergedRoles.includes('orchestration'),
    highSeverityIssueCount: mergedHighSeverityIssueCount,
    truthMode: mergedTruthMode,
  });
  const mergedDoDResult = evaluateDone({
    id: capabilityId,
    kind: 'capability',
    requiredRoles: CAPABILITY_REQUIRED_DOD_ROLES,
    evidence: mergedDoDEvidence,
    codacyHighCount: mergedHighSeverityIssueCount,
    hasPhantom: mergedStatus === 'phantom',
    hasLatentCritical: mergedStatus === 'latent' && mergedRuntimeCritical,
    truthModeTarget: 'observed',
  });
  const mergedDoD: PulseCapabilityDoD = {
    status: toDoDStatus({
      done: mergedDoDResult.done,
      pulseStatus: mergedStatus === 'real' && !mergedDoDResult.done ? 'partial' : mergedStatus,
    }),
    missingRoles: mergedDoDResult.missingRoles.slice(),
    blockers: mergedDoDResult.reasons.slice(),
    truthModeMet: mergedDoDResult.truthModeMet,
    governedBlockers: mergedDoDResult.governedBlockers.slice(),
  };
  const visibleStatus = mergedStatus === 'real' && !mergedDoDResult.done ? 'partial' : mergedStatus;
  const governedValidationTargets = mergedDoDResult.governedBlockers.map(
    (blocker) => `Governed ai_safe validation: ${blocker.expectedValidation}`,
  );
  const governedBlockingReasons = mergedDoDResult.governedBlockers.map(
    (blocker) =>
      `Governed ai_safe blocker for ${blocker.role}: ${blocker.reason} Expected validation: ${blocker.expectedValidation}`,
  );

  return {
    ...existing,
    truthMode: mergedTruthMode,
    status: visibleStatus,
    confidence: clamp(Math.max(existing.confidence, confidence)),
    userFacing: existing.userFacing || userFacing,
    runtimeCritical: mergedRuntimeCritical,
    protectedByGovernance: mergedProtectedByGovernance,
    ownerLane: pickOwnerLane([existing.ownerLane, ownerLane]),
    executionMode: pickExecutionMode([existing.executionMode, executionMode]),
    rolesPresent: mergedRoles,
    missingRoles: mergedMissingRoles,
    filePaths: unique([...existing.filePaths, ...filePaths]).sort(),
    nodeIds: unique([...existing.nodeIds, ...componentIds]).sort(),
    routePatterns: mergedRoutePatterns,
    evidenceSources: unique([...existing.evidenceSources, ...evidenceSources]).sort(),
    codacyIssueCount: existing.codacyIssueCount + codacyIssueCount,
    highSeverityIssueCount: mergedHighSeverityIssueCount,
    blockingReasons: unique([...mergedBlockingReasons, ...governedBlockingReasons]),
    maturity: mergedMaturity,
    validationTargets: unique([
      ...existing.validationTargets,
      routePatterns[0] ? `Validate structural chain for ${routePatterns[0]}.` : '',
      mergedRuntimeCritical ? 'Re-run runtime evidence for this capability.' : '',
      highSeverityIssueCount > 0 ? 'Re-sync Codacy and confirm HIGH issues dropped.' : '',
      ...governedValidationTargets,
    ]).filter(Boolean),
    dod: mergedDoD,
    statusDetail: {
      structuralStatus:
        visibleStatus === 'real'
          ? 'complete'
          : visibleStatus === 'partial'
            ? 'partial'
            : visibleStatus === 'latent'
              ? 'latent'
              : 'phantom',
      operationalStatus:
        existing.maturity.dimensions.runtimeEvidencePresent ||
        maturity.dimensions.runtimeEvidencePresent
          ? 'observed'
          : 'unobserved',
      scenarioStatus:
        existing.maturity.dimensions.scenarioCoveragePresent ||
        maturity.dimensions.scenarioCoveragePresent
          ? 'covered_passed'
          : 'not_covered',
      dodStatus: mergedDoD.status,
      productionStatus:
        mergedDoD.status === 'done' && mergedBlockingReasons.length === 0
          ? 'ready'
          : mergedDoD.status === 'partial' && mergedBlockingReasons.length <= 2
            ? 'candidate'
            : 'not_ready',
    },
  };
}
