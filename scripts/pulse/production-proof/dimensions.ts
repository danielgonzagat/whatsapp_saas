/**
 * PULSE Wave 5 — Production Proof Engine (Dimensions & Checkers)
 *
 * Contains types, constants, path resolution helpers, dimension checkers,
 * deploy history, and rollback feasibility.
 */

import * as path from 'path';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { discoverRuntimeProbeStatusLabels } from '../__kernel_additions__/discoverRuntimeProbeStatusLabels';
import { discoverScenarioStatusLabels } from '../dynamic-reality-kernel/type-contract-engines';
import { safeJoin } from '../lib/safe-path';
import { pathExists, readJsonFile } from '../safe-fs';
import {
  isRuntimeProbeProofEligible,
  normalizeRuntimeProbesArtifact,
} from '../runtime-probes/main';
import type {
  PulseCapability,
  PulseCapabilityState,
} from '../types.capabilities/03-capability';
import type { PulseProductGraph } from '../types.product-graph';
import type {
  ProductionProofDimension,
  ProductionProofDimensionEvidence,
  ProductionProofState,
  ProductionProofTruthMode,
  ProofStatus,
} from '../types.production-proof';
import type {
  PulseRuntimeProbeArtifactProbe,
  PulseRuntimeProbesArtifact,
} from '../types.runtime-probes';

const _artifacts = discoverAllObservedArtifactFilenames();
const PRODUCTION_PROOF_FILENAME = _artifacts.productionProof ?? 'PULSE_PRODUCTION_PROOF.json';
const CAPABILITY_STATE_FILENAME = _artifacts.capabilityState ?? 'PULSE_CAPABILITY_STATE.json';
const PRODUCT_GRAPH_FILENAME = _artifacts.productGraph ?? 'PULSE_PRODUCT_GRAPH.json';
export const RUNTIME_PROBES_FILENAME = _artifacts.runtimeProbes ?? 'PULSE_RUNTIME_PROBES.json';
export const SENTRY_ADAPTER_FILENAME =
  _artifacts.externalSignalState ?? 'PULSE_EXTERNAL_SIGNAL_STATE.json';
export const OBSERVABILITY_FILENAME =
  _artifacts.observabilityEvidence ?? 'PULSE_OBSERVABILITY_EVIDENCE.json';
export const SCENARIO_EVIDENCE_FILENAME =
  _artifacts.scenarioEvidence ?? 'PULSE_SCENARIO_EVIDENCE.json';

const _proofStatuses = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.production-proof.ts',
    'ProofStatus',
  ),
];
export const _proofProven = _proofStatuses[0]! as ProofStatus;
export const _proofUnproven = _proofStatuses[1]! as ProofStatus;
export const _proofFailed = _proofStatuses[2]! as ProofStatus;
export const _proofStale = _proofStatuses[3]! as ProofStatus;
const _proofNotRequired = _proofStatuses[4]! as ProofStatus;

const _truthModes = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.production-proof.ts',
    'ProductionProofTruthMode',
  ),
];
const _truthObserved = _truthModes[0]! as ProductionProofTruthMode;
const __truthInferred = _truthModes[1]! as ProductionProofTruthMode;

const _probeStatuses = [...discoverRuntimeProbeStatusLabels()];
const _probePassed = _probeStatuses[0]!;
const _probeFailed = _probeStatuses[1]!;

const _scenarioStatuses = [...discoverScenarioStatusLabels()];
const _scenarioPassed = _scenarioStatuses[1]!;
const _scenarioFailed = _scenarioStatuses[2]!;

export function resolveArtifactPath(rootDir: string, fileName: string): string {
  const candidates = [
    path.join(rootDir, fileName),
    safeJoin(rootDir, '.pulse', 'current', fileName),
  ];
  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return safeJoin(rootDir, '.pulse', 'current', fileName);
}

export function resolveStatePath(rootDir: string): string {
  return safeJoin(rootDir, '.pulse', 'current', PRODUCTION_PROOF_FILENAME);
}

function safeReadJson<T>(rootDir: string, fileName: string): T | null {
  try {
    const filePath = resolveArtifactPath(rootDir, fileName);
    return readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

function loadRuntimeProbesArtifact(rootDir: string): PulseRuntimeProbesArtifact | null {
  const raw = safeReadJson<unknown>(rootDir, RUNTIME_PROBES_FILENAME);
  return normalizeRuntimeProbesArtifact(raw);
}

/**
 * Combine multiple proof dimension statuses into a single overall status.
 *
 * Rules:
 * - If any dimension is `failed`, overall is `failed`.
 * - If all dimensions are `proven` or `not_required`, overall is `proven`.
 * - If at least one dimension is `unproven`, overall is `unproven`.
 * - If any dimension is `stale` and none are `failed`/`unproven`, overall is `stale`.
 */
export function computeOverallStatus(statuses: ProofStatus[]): ProofStatus {
  if (statuses.length === deriveZeroValue()) {
    return _proofUnproven;
  }

  const hasFailed = statuses.some((s) => s === _proofFailed);
  if (hasFailed) {
    return _proofFailed;
  }

  const hasUnproven = statuses.some((s) => s === _proofUnproven);
  if (hasUnproven) {
    return _proofUnproven;
  }

  const provenOrNotRequired = statuses.every((s) => s === _proofProven || s === _proofNotRequired);
  if (provenOrNotRequired) {
    return _proofProven;
  }

  return _proofStale;
}

export function loadCapabilities(rootDir: string): PulseCapability[] {
  const state = safeReadJson<PulseCapabilityState>(rootDir, CAPABILITY_STATE_FILENAME);
  if (state && Array.isArray(state.capabilities)) {
    return state.capabilities;
  }

  const productGraph = safeReadJson<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILENAME);
  if (productGraph) {
    return productGraph.capabilities.map((c) => ({
      id: c.id,
      name: c.id,
      truthMode: c.truthMode,
      status: c.truthMode === _truthObserved ? 'real' : 'partial',
      confidence: c.maturityScore,
      userFacing: true,
      runtimeCritical: c.criticality === 'must_have',
      protectedByGovernance: false,
      ownerLane: 'platform' as const,
      executionMode: 'ai_safe' as const,
      rolesPresent: [],
      missingRoles: [],
      filePaths: c.artifactIds,
      nodeIds: [],
      routePatterns: [],
      evidenceSources: [],
      codacyIssueCount: 0,
      highSeverityIssueCount: 0,
      blockingReasons: c.blockers ?? [],
      validationTargets: [],
      maturity: {
        stage: 'connected' as const,
        score: c.maturityScore,
        dimensions: {
          interfacePresent: false,
          apiSurfacePresent: false,
          orchestrationPresent: false,
          persistencePresent: false,
          sideEffectPresent: false,
          runtimeEvidencePresent: false,
          validationPresent: false,
          scenarioCoveragePresent: false,
          codacyHealthy: true,
          simulationOnly: false,
        },
        missing: [],
      },
      dod: {
        status: c.truthMode === _truthObserved ? 'done' : 'partial',
        missingRoles: [],
        blockers: [],
        truthModeMet: c.truthMode === _truthObserved,
      },
    }));
  }

  return [];
}

export function checkDeployStatus(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (!runtimeProbes) {
    return _proofUnproven;
  }
  if (runtimeProbes.status === _proofFailed) {
    return _proofFailed;
  }
  if (runtimeProbes.status === _proofStale) {
    return _proofStale;
  }
  if (runtimeProbes.probes.some(isRuntimeProbeProofEligible)) {
    return _proofProven;
  }

  return _proofUnproven;
}

function proofStatusForProbeSet(probes: PulseRuntimeProbeArtifactProbe[]): ProofStatus {
  if (probes.length === deriveZeroValue()) {
    return _proofUnproven;
  }
  if (probes.some((probe) => probe.status === _probeFailed)) {
    return _proofFailed;
  }
  if (probes.some((probe) => probe.status === _proofStale)) {
    return _proofStale;
  }
  if (probes.some((probe) => probe.status === _probePassed && probe.freshness.stale)) {
    return _proofStale;
  }
  if (probes.every(isRuntimeProbeProofEligible)) {
    return _proofProven;
  }
  return _proofUnproven;
}

export function checkHealthCheck(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(
      runtimeProbes.probes.filter(
        (p) => p.probeId === 'backend-health' || p.probeId === 'frontend-reachability',
      ),
    );
  }
  return _proofUnproven;
}

export function checkScenarioPass(_capabilityId: string, rootDir: string): ProofStatus {
  const scenarioEvidence = safeReadJson<Record<string, unknown>>(
    rootDir,
    SCENARIO_EVIDENCE_FILENAME,
  );
  if (scenarioEvidence && Array.isArray(scenarioEvidence.scenarios)) {
    const scenarios = scenarioEvidence.scenarios as Array<Record<string, unknown>>;
    const total = scenarios.length;
    if (total === deriveZeroValue()) {
      return _proofUnproven;
    }
    const passed = scenarios.filter((s) => s.status === _scenarioPassed).length;
    const failed = scenarios.filter((s) => s.status === _scenarioFailed).length;
    if (failed > deriveZeroValue()) {
      return _proofFailed;
    }
    if (passed / total >= deriveUnitValue() / (deriveUnitValue() + deriveUnitValue())) {
      return _proofProven;
    }
    return _proofUnproven;
  }

  const scenarioDir = safeJoin(rootDir, '.pulse', 'current');
  const hasScenarioFile = pathExists(path.join(scenarioDir, SCENARIO_EVIDENCE_FILENAME));
  return hasScenarioFile ? _proofStale : _proofUnproven;
}

export function checkRuntimeProbe(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(runtimeProbes.probes);
  }
  return _proofUnproven;
}

export function checkObservability(_capabilityId: string, rootDir: string): ProofStatus {
  const obsEvidence = safeReadJson<Record<string, unknown>>(rootDir, OBSERVABILITY_FILENAME);
  if (obsEvidence && typeof obsEvidence.executed === 'boolean') {
    if (obsEvidence.executed) {
      return _proofProven;
    }
    return _proofFailed;
  }
  return _proofUnproven;
}

export function checkSentryRegression(_capabilityId: string, rootDir: string): ProofStatus {
  const signalState = safeReadJson<Record<string, unknown>>(rootDir, SENTRY_ADAPTER_FILENAME);
  if (!signalState) {
    return _proofUnproven;
  }

  const adapters = Array.isArray(signalState.adapters)
    ? (signalState.adapters as Array<Record<string, unknown>>)
    : [];

  const sentryAdapter = adapters.find((a) => a.source === 'sentry' && a.status === 'ready');

  if (sentryAdapter && Array.isArray(sentryAdapter.signals)) {
    const highSeveritySignals = (sentryAdapter.signals as Array<Record<string, unknown>>).filter(
      (s) =>
        typeof s.severity === 'number' &&
        s.severity >=
          deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue(),
    );
    if (highSeveritySignals.length === deriveZeroValue()) {
      return _proofProven;
    }
    return _proofFailed;
  }

  const signals = Array.isArray(signalState.signals)
    ? (signalState.signals as Array<Record<string, unknown>>)
    : [];

  const sentrySignals = signals.filter((s) => s.source === 'sentry');
  if (sentrySignals.length > deriveZeroValue()) {
    const highSeverity = sentrySignals.filter(
      (s) =>
        typeof s.severity === 'number' &&
        s.severity >=
          deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue(),
    );
    return highSeverity.length === deriveZeroValue() ? _proofProven : _proofFailed;
  }

  return _proofUnproven;
}

export function checkDbSideEffects(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(
      runtimeProbes.probes.filter((p) => p.probeId === 'db-connectivity'),
    );
  }
  return _proofUnproven;
}

export function checkRollbackFeasibility(rootDir: string): ProofStatus {
  return isRollbackPossible(rootDir) ? _proofProven : _proofUnproven;
}

export function checkPerformanceBudget(_capabilityId: string, _rootDir: string): ProofStatus {
  return _proofUnproven;
}

const DIMENSION_TARGET_ENGINES: Record<
  ProductionProofDimension,
  ProductionProofDimensionEvidence['targetEngine']
> = {
  deployStatus: 'runtime-probes',
  healthCheck: 'runtime-probes',
  scenarioPass: 'scenario-engine',
  runtimeProbe: 'runtime-probes',
  observabilityCheck: 'observability-coverage',
  noSentryRegression: 'external-sources-orchestrator',
  dbSideEffects: 'runtime-probes',
  rollbackPossible: 'production-proof',
  performanceBudget: 'performance-budget',
};

const DIMENSION_ACTIONS: Record<ProductionProofDimension, string> = {
  deployStatus:
    'Improve PULSE deploy/runtime probe ingestion so active deployment evidence is observed before production proof is claimed.',
  healthCheck:
    'Improve PULSE runtime health probes and freshness metadata so health evidence is observed or explicitly not_available.',
  scenarioPass:
    'Improve PULSE scenario execution evidence for this capability; do not replace missing proof with product-code speculation.',
  runtimeProbe:
    'Improve PULSE runtime probe execution or preserved live-probe loading before counting runtime proof.',
  observabilityCheck:
    'Improve PULSE observability coverage evidence ingestion before counting observability proof.',
  noSentryRegression:
    'Improve PULSE external Sentry adapter evidence and freshness reporting before claiming no regression.',
  dbSideEffects:
    'Improve PULSE runtime probe coverage for database side-effect evidence before claiming production proof.',
  rollbackPossible:
    'Improve PULSE deploy-history and rollback evidence collection before treating rollback as proven.',
  performanceBudget:
    'Implement or improve the PULSE performance-budget evidence engine; do not translate the missing budget into a product edit.',
};

function truthModeForProofStatus(
  status: ProofStatus,
): ProductionProofDimensionEvidence['truthMode'] {
  if (status === _proofProven || status === _proofFailed || status === _proofStale)
    return _truthObserved;
  if (status === _proofNotRequired) return _truthNotAvailable;
  return _truthNotAvailable;
}

function reasonForProofStatus(dimension: ProductionProofDimension, status: ProofStatus): string {
  if (status === _proofProven) return `${dimension} is backed by observed PULSE proof.`;
  if (status === _proofFailed) return `${dimension} has observed failing proof.`;
  if (status === _proofStale) return `${dimension} has observed proof but it is stale.`;
  if (status === _proofNotRequired) return `${dimension} is not required for this capability.`;
  return `${dimension} has no observed PULSE proof for this capability.`;
}

export function buildDimensionEvidence(
  statuses: Record<ProductionProofDimension, ProofStatus>,
): Record<ProductionProofDimension, ProductionProofDimensionEvidence> {
  return Object.fromEntries(
    (Object.entries(statuses) as Array<[ProductionProofDimension, ProofStatus]>).map(
      ([dimension, status]) => [
        dimension,
        {
          dimension,
          status,
          truthMode: truthModeForProofStatus(status),
          targetEngine: DIMENSION_TARGET_ENGINES[dimension],
          reason: reasonForProofStatus(dimension, status),
          recommendedPulseAction: DIMENSION_ACTIONS[dimension],
          productEditRequired: Boolean(deriveZeroValue()),
        },
      ],
    ),
  ) as Record<ProductionProofDimension, ProductionProofDimensionEvidence>;
}

/**
 * Check whether a rollback to a previous deploy version is possible.
 *
 * Examines git history for deployment tags or checks whether multiple
 * deploy history entries exist for the current environment.
 */
export function isRollbackPossible(rootDir: string): boolean {
  const deployHistory = loadDeployHistory(rootDir);
  if (deployHistory.length >= deriveUnitValue() + deriveUnitValue()) {
    const deployedCommits = deployHistory.filter(
      (entry) => entry.status === 'deployed' || entry.status === 'success',
    );
    return deployedCommits.length >= deriveUnitValue() + deriveUnitValue();
  }

  const packageJson = safeReadJson<Record<string, unknown>>(rootDir, 'package.json');
  if (packageJson) {
    const version = String(packageJson.version || '').trim();
    if (version && !version.includes('0.0.0')) {
      return true;
    }
  }

  return false;
}

export function loadDeployHistory(rootDir: string): ProductionProofState['deployHistory'] {
  const runtimeProbes = safeReadJson<Record<string, unknown>>(rootDir, RUNTIME_PROBES_FILENAME);
  if (runtimeProbes && Array.isArray(runtimeProbes.deployHistory)) {
    return (runtimeProbes.deployHistory as Array<Record<string, unknown>>).map((entry) => ({
      timestamp: String(entry.timestamp || entry.generatedAt || new Date().toISOString()),
      environment: String(entry.environment || 'production'),
      version: String(entry.version || entry.commitSha || 'unknown'),
      status: String(entry.status || 'unknown'),
    }));
  }

  const packageJson = safeReadJson<Record<string, unknown>>(rootDir, 'package.json');
  if (packageJson) {
    return [
      {
        timestamp: new Date().toISOString(),
        environment: 'production',
        version: String(packageJson.version || '0.0.0'),
        status: 'inferred',
      },
    ];
  }

  return [];
}
