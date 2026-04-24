// PULSE — Live Codebase Nervous System
// Capability model: pure scorer and picker helpers

import type {
  PulseCapability,
  PulseCapabilityMaturity,
  PulseCapabilityState,
  PulseStructuralRole,
  PulseConvergenceOwnerLane,
  PulseScopeExecutionMode,
  PulseTruthMode,
} from './types';

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function chooseTruthMode(hasObservedEvidence: boolean, projected: boolean): PulseTruthMode {
  if (hasObservedEvidence) {
    return 'observed';
  }
  if (projected) {
    return 'aspirational';
  }
  return 'inferred';
}

export function pickOwnerLane(values: PulseConvergenceOwnerLane[]): PulseConvergenceOwnerLane {
  if (values.includes('security')) {
    return 'security';
  }
  if (values.includes('reliability')) {
    return 'reliability';
  }
  if (values.includes('operator-admin')) {
    return 'operator-admin';
  }
  if (values.includes('customer')) {
    return 'customer';
  }
  return 'platform';
}

export function pickExecutionMode(values: PulseScopeExecutionMode[]): PulseScopeExecutionMode {
  if (values.includes('human_required')) {
    return 'human_required';
  }
  if (values.includes('observation_only')) {
    return 'observation_only';
  }
  return 'ai_safe';
}

export function inferStatus(
  rolesPresent: PulseStructuralRole[],
  simulationOnly: boolean,
  hasObservedFailure: boolean,
): PulseCapability['status'] {
  const hasInterface = rolesPresent.includes('interface');
  const hasOrchestration = rolesPresent.includes('orchestration');
  const hasPersistence = rolesPresent.includes('persistence');
  const hasSideEffect = rolesPresent.includes('side_effect');
  const hasSimulation = rolesPresent.includes('simulation');

  if (
    simulationOnly ||
    (hasSimulation && !hasPersistence && !hasSideEffect && !hasObservedFailure)
  ) {
    return 'phantom';
  }
  if (!hasInterface && (hasPersistence || hasSideEffect || hasOrchestration)) {
    return 'latent';
  }
  if (hasObservedFailure) {
    return 'partial';
  }
  if (hasInterface && (hasPersistence || hasSideEffect)) {
    return 'real';
  }
  if (hasInterface || hasOrchestration) {
    return 'partial';
  }
  return 'latent';
}

export function buildCapabilityMaturity(input: {
  rolesPresent: PulseStructuralRole[];
  routePatterns: string[];
  flowEvidenceMatches: NonNullable<import('./types').PulseExecutionEvidence['flows']>['results'];
  scenarioCoverageMatches: Array<{ scenarioId: string }>;
  highSeverityIssueCount: number;
  simulationOnly: boolean;
  status: PulseCapability['status'];
}): PulseCapabilityMaturity {
  const dimensions = {
    interfacePresent: input.rolesPresent.includes('interface'),
    apiSurfacePresent: input.routePatterns.length > 0,
    orchestrationPresent: input.rolesPresent.includes('orchestration'),
    persistencePresent: input.rolesPresent.includes('persistence'),
    sideEffectPresent: input.rolesPresent.includes('side_effect'),
    runtimeEvidencePresent: input.flowEvidenceMatches.some((result) => result.executed),
    validationPresent:
      input.flowEvidenceMatches.length > 0 || input.scenarioCoverageMatches.length > 0,
    scenarioCoveragePresent: input.scenarioCoverageMatches.length > 0,
    codacyHealthy: input.highSeverityIssueCount === 0,
    simulationOnly: input.simulationOnly,
  };

  const score = clamp(
    (dimensions.interfacePresent ? 0.14 : 0) +
      (dimensions.apiSurfacePresent ? 0.08 : 0) +
      (dimensions.orchestrationPresent ? 0.14 : 0) +
      (dimensions.persistencePresent ? 0.18 : 0) +
      (dimensions.sideEffectPresent ? 0.1 : 0) +
      (dimensions.runtimeEvidencePresent ? 0.1 : 0) +
      (dimensions.validationPresent ? 0.08 : 0) +
      (dimensions.scenarioCoveragePresent ? 0.08 : 0) +
      (dimensions.codacyHealthy ? 0.1 : 0) +
      (dimensions.simulationOnly ? -0.15 : 0),
  );

  let stage: PulseCapabilityMaturity['stage'] = 'foundational';
  if (
    input.status === 'real' &&
    (dimensions.runtimeEvidencePresent || dimensions.scenarioCoveragePresent) &&
    dimensions.codacyHealthy
  ) {
    stage = 'production_ready';
  } else if (
    (dimensions.persistencePresent || dimensions.sideEffectPresent) &&
    (dimensions.runtimeEvidencePresent || dimensions.validationPresent)
  ) {
    stage = 'operational';
  } else if (
    dimensions.interfacePresent ||
    dimensions.apiSurfacePresent ||
    dimensions.orchestrationPresent
  ) {
    stage = 'connected';
  }

  if (input.status === 'phantom' && dimensions.simulationOnly) {
    stage = 'foundational';
  }

  const missing = unique([
    !dimensions.interfacePresent ? 'interface' : '',
    !dimensions.apiSurfacePresent ? 'api_surface' : '',
    !dimensions.orchestrationPresent ? 'orchestration' : '',
    !dimensions.persistencePresent ? 'persistence' : '',
    !dimensions.sideEffectPresent ? 'side_effect' : '',
    !dimensions.runtimeEvidencePresent ? 'runtime_evidence' : '',
    !dimensions.validationPresent ? 'validation' : '',
    !dimensions.scenarioCoveragePresent ? 'scenario_coverage' : '',
    !dimensions.codacyHealthy ? 'codacy_hygiene' : '',
    dimensions.simulationOnly ? 'simulation_only' : '',
  ]).filter(Boolean);

  return {
    stage,
    score,
    dimensions,
    missing,
  };
}

/** Build the blocking reasons array for a capability. */
export function buildBlockingReasons(input: {
  status: PulseCapability['status'];
  missingRoles: PulseStructuralRole[];
  maturityMissing: string[];
  highSeverityIssueCount: number;
  protectedByGovernance: boolean;
}): string[] {
  return unique([
    input.status === 'phantom'
      ? 'The capability exposes simulation signals without persistence or verified side effects.'
      : '',
    input.missingRoles.length > 0
      ? `Missing structural roles: ${input.missingRoles.join(', ')}.`
      : '',
    input.maturityMissing.length > 0
      ? `Maturity is still missing: ${input.maturityMissing.slice(0, 4).join(', ')}.`
      : '',
    input.highSeverityIssueCount > 0
      ? `Codacy still reports ${input.highSeverityIssueCount} HIGH issue(s) inside this capability.`
      : '',
    input.protectedByGovernance
      ? 'Part of this capability lives on a governance-protected surface.'
      : '',
  ]).filter(Boolean);
}

/** Merge two capabilities when the same capability ID is encountered again. */
export function mergeCapability(
  existing: PulseCapability,
  patch: {
    truthMode: PulseCapability['truthMode'];
    status: PulseCapability['status'];
    confidence: number;
    userFacing: boolean;
    runtimeCritical: boolean;
    protectedByGovernance: boolean;
    ownerLane: PulseConvergenceOwnerLane;
    executionMode: PulseScopeExecutionMode;
    rolesPresent: PulseStructuralRole[];
    filePaths: string[];
    nodeIds: string[];
    routePatterns: string[];
    evidenceSources: string[];
    codacyIssueCount: number;
    highSeverityIssueCount: number;
    validationTargets: string[];
    maturity: PulseCapabilityMaturity;
  },
): PulseCapability {
  const mergedRoles = unique([
    ...existing.rolesPresent,
    ...patch.rolesPresent,
  ]).sort() as PulseStructuralRole[];
  const mergedMissingRoles = (
    ['interface', 'orchestration', 'persistence', 'side_effect'] as PulseStructuralRole[]
  ).filter((role) => !mergedRoles.includes(role));
  const mergedRoutePatterns = unique([...existing.routePatterns, ...patch.routePatterns]).sort();
  const mergedHighSeverityIssueCount =
    existing.highSeverityIssueCount + patch.highSeverityIssueCount;
  const mergedProtectedByGovernance = existing.protectedByGovernance || patch.protectedByGovernance;
  const mergedRuntimeCritical = existing.runtimeCritical || patch.runtimeCritical;
  const mergedSimulationOnly = mergedRoles.includes('simulation') && mergedRoles.length === 1;
  const mergedHasObservedFailure = mergedHighSeverityIssueCount > 0 && mergedRuntimeCritical;
  const mergedStatus = inferStatus(mergedRoles, mergedSimulationOnly, mergedHasObservedFailure);
  const mergedMaturity = buildCapabilityMaturity({
    rolesPresent: mergedRoles,
    routePatterns: mergedRoutePatterns,
    flowEvidenceMatches:
      existing.maturity.dimensions.runtimeEvidencePresent ||
      patch.maturity.dimensions.runtimeEvidencePresent
        ? [
            {
              flowId: 'merged',
              status: 'accepted',
              executed: true,
              accepted: true,
              summary: '',
              artifactPaths: [],
            },
          ]
        : [],
    scenarioCoverageMatches:
      existing.maturity.dimensions.scenarioCoveragePresent ||
      patch.maturity.dimensions.scenarioCoveragePresent
        ? [{ scenarioId: 'merged' }]
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
  return {
    ...existing,
    truthMode:
      existing.truthMode === 'observed' || patch.truthMode === 'observed'
        ? 'observed'
        : existing.truthMode === 'inferred' || patch.truthMode === 'inferred'
          ? 'inferred'
          : 'aspirational',
    status: mergedStatus,
    confidence: clamp(Math.max(existing.confidence, patch.confidence)),
    userFacing: existing.userFacing || patch.userFacing,
    runtimeCritical: mergedRuntimeCritical,
    protectedByGovernance: mergedProtectedByGovernance,
    ownerLane: pickOwnerLane([existing.ownerLane, patch.ownerLane]),
    executionMode: pickExecutionMode([existing.executionMode, patch.executionMode]),
    rolesPresent: mergedRoles,
    missingRoles: mergedMissingRoles,
    filePaths: unique([...existing.filePaths, ...patch.filePaths]).sort(),
    nodeIds: unique([...existing.nodeIds, ...patch.nodeIds]).sort(),
    routePatterns: mergedRoutePatterns,
    evidenceSources: unique([...existing.evidenceSources, ...patch.evidenceSources]).sort(),
    codacyIssueCount: existing.codacyIssueCount + patch.codacyIssueCount,
    highSeverityIssueCount: mergedHighSeverityIssueCount,
    blockingReasons: mergedBlockingReasons,
    maturity: mergedMaturity,
    validationTargets: unique([...existing.validationTargets, ...patch.validationTargets]).filter(
      Boolean,
    ),
  };
}

/** Build the summary object for a sorted list of capabilities. */
export function buildCapabilitySummary(
  sortedCapabilities: PulseCapability[],
): PulseCapabilityState['summary'] {
  return {
    totalCapabilities: sortedCapabilities.length,
    realCapabilities: sortedCapabilities.filter((item) => item.status === 'real').length,
    partialCapabilities: sortedCapabilities.filter((item) => item.status === 'partial').length,
    latentCapabilities: sortedCapabilities.filter((item) => item.status === 'latent').length,
    phantomCapabilities: sortedCapabilities.filter((item) => item.status === 'phantom').length,
    humanRequiredCapabilities: sortedCapabilities.filter(
      (item) => item.executionMode === 'human_required',
    ).length,
    foundationalCapabilities: sortedCapabilities.filter(
      (item) => item.maturity.stage === 'foundational',
    ).length,
    connectedCapabilities: sortedCapabilities.filter((item) => item.maturity.stage === 'connected')
      .length,
    operationalCapabilities: sortedCapabilities.filter(
      (item) => item.maturity.stage === 'operational',
    ).length,
    productionReadyCapabilities: sortedCapabilities.filter(
      (item) => item.maturity.stage === 'production_ready',
    ).length,
    runtimeObservedCapabilities: sortedCapabilities.filter(
      (item) => item.maturity.dimensions.runtimeEvidencePresent,
    ).length,
    scenarioCoveredCapabilities: sortedCapabilities.filter(
      (item) => item.maturity.dimensions.scenarioCoveragePresent,
    ).length,
  };
}
