import { deriveStringUnionMembersFromTypeContract } from './type-contract-labels';

// ── Execution matrix type-union label discovery ────────────────────────────

export function discoverExecutionMatrixPathStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-matrix.ts',
    'PulseExecutionMatrixPathStatus',
  );
}

export function discoverExecutionMatrixPathSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-matrix.ts',
    'PulseExecutionMatrixPathSource',
  );
}

// ── Truth / structural type-union label discovery ──────────────────────────

export function discoverTruthModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseTruthMode',
  );
}

export function discoverStructuralRoleLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseStructuralRole',
  );
}

export function discoverStructuralNodeKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseStructuralNodeKind',
  );
}

export function discoverStructuralEdgeKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseStructuralEdgeKind',
  );
}

export function discoverShellComplexityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.structural.ts',
    'PulseShellComplexity',
  );
}

// ── Chaos engine type-union label discovery ────────────────────────────────

export function discoverChaosScenarioKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.chaos-engine.ts',
    'ChaosScenarioKind',
  );
}

export function discoverChaosTargetLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.chaos-engine.ts',
    'ChaosTarget',
  );
}

export function discoverChaosResultLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.chaos-engine.ts',
    'ChaosResult',
  );
}

// ── Continuous daemon type-union label discovery ───────────────────────────

export function discoverDaemonPhaseLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.continuous-daemon.ts',
    'DaemonPhase',
  );
}

export function discoverDaemonCycleResultLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.continuous-daemon.ts',
    'DaemonCycleResult',
  );
}

export function discoverDaemonStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.continuous-daemon.ts',
    'status',
  );
}

// ── DoD engine type-union label discovery ──────────────────────────────────

export function discoverDoDGateStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDGateStatus',
  );
}

export function discoverDoDOverallStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDOverallStatus',
  );
}

export function discoverDoDRiskLevelLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDRiskLevel',
  );
}

export function discoverDoDCapabilityClassificationLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDCapabilityClassification',
  );
}

export function discoverDoDRequirementModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.dod-engine.ts',
    'DoDRequirementMode',
  );
}

// ── Scope engine type-union label discovery ────────────────────────────────

export function discoverScopeFileStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scope-engine.ts',
    'ScopeFileStatus',
  );
}

export function discoverScopeFileRoleLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scope-engine.ts',
    'ScopeFileRole',
  );
}

export function discoverScopeExecutionModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scope-engine.ts',
    'ScopeExecutionMode',
  );
}

// ── Scenario engine type-union label discovery ─────────────────────────────

export function discoverScenarioStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.scenario-engine.ts',
    'ScenarioStatus',
  );
}

export function discoverAsyncExpectationStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'PulseAsyncExpectationStatus',
  );
}

export function discoverGateResultStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'PulseGateResultStatus',
  );
}

// ── Execution harness type-union label discovery ───────────────────────────

export function discoverHarnessTargetKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessTargetKind',
  );
}

export function discoverHarnessExecutionStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessExecutionStatus',
  );
}

export function discoverHarnessExecutionFeasibilityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'ExecutionFeasibility',
  );
}

// ── Runtime fusion type-union label discovery ──────────────────────────────

export function discoverSignalSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalSource',
  );
}

export function discoverSignalTypeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalType',
  );
}

export function discoverSignalSeverityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalSeverity',
  );
}

export function discoverSignalActionLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'SignalAction',
  );
}

export function discoverRuntimeFusionEvidenceStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'RuntimeFusionEvidenceStatus',
  );
}

export function discoverOperationalEvidenceKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.runtime-fusion.ts',
    'OperationalEvidenceKind',
  );
}

// ── Health / manifest type-union label discovery ───────────────────────────

export function discoverEnvironmentLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseEnvironment',
  );
}

export function discoverCertificationProfileLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseCertificationProfile',
  );
}

export function discoverTimeWindowModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseTimeWindowMode',
  );
}

export function discoverActorKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseActorKind',
  );
}

export function discoverScenarioKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseScenarioKind',
  );
}

export function discoverProviderModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseProviderMode',
  );
}

export function discoverModuleStateLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseModuleState',
  );
}
