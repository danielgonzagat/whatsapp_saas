/**
 * PULSE Wave 5 — Production Proof Engine
 *
 * Evaluates production readiness for every capability in the system by
 * checking all proof dimensions: deploy status, health checks, scenario
 * coverage, runtime probes, observability, Sentry regression, DB side
 * effects, rollback feasibility, and performance budget.
 *
 * Each capability receives an overall proof status. The state is
 * persisted to `.pulse/current/PULSE_PRODUCTION_PROOF.json`.
 */

import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { isRuntimeProbeProofEligible, normalizeRuntimeProbesArtifact } from './runtime-probes';
import type { PulseCapability, PulseCapabilityState, PulseProductGraph } from './types';
import type {
  ProductionProof,
  ProductionProofDimension,
  ProductionProofDimensionEvidence,
  ProductionProofState,
  ProofStatus,
} from './types.production-proof';
import type {
  PulseRuntimeProbeArtifactProbe,
  PulseRuntimeProbesArtifact,
} from './types.runtime-probes';

const PRODUCTION_PROOF_FILENAME = 'PULSE_PRODUCTION_PROOF.json';
const CAPABILITY_STATE_FILENAME = 'PULSE_CAPABILITY_STATE.json';
const PRODUCT_GRAPH_FILENAME = 'PULSE_PRODUCT_GRAPH.json';
const RUNTIME_PROBES_FILENAME = 'PULSE_RUNTIME_PROBES.json';
const SENTRY_ADAPTER_FILENAME = 'PULSE_EXTERNAL_SIGNAL_STATE.json';
const OBSERVABILITY_FILENAME = 'PULSE_OBSERVABILITY_EVIDENCE.json';
const SCENARIO_EVIDENCE_FILENAME = 'PULSE_SCENARIO_EVIDENCE.json';

function resolveArtifactPath(rootDir: string, fileName: string): string {
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

function resolveStatePath(rootDir: string): string {
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
function computeOverallStatus(statuses: ProofStatus[]): ProofStatus {
  if (statuses.length === 0) {
    return 'unproven';
  }

  const hasFailed = statuses.some((s) => s === 'failed');
  if (hasFailed) {
    return 'failed';
  }

  const hasUnproven = statuses.some((s) => s === 'unproven');
  if (hasUnproven) {
    return 'unproven';
  }

  const provenOrNotRequired = statuses.every((s) => s === 'proven' || s === 'not_required');
  if (provenOrNotRequired) {
    return 'proven';
  }

  return 'stale';
}

function loadCapabilities(rootDir: string): PulseCapability[] {
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
      status: c.truthMode === 'observed' ? 'real' : 'partial',
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
        status: c.truthMode === 'observed' ? 'done' : 'partial',
        missingRoles: [],
        blockers: [],
        truthModeMet: c.truthMode === 'observed',
      },
    }));
  }

  return [];
}

function checkDeployStatus(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (!runtimeProbes) {
    return 'unproven';
  }
  if (runtimeProbes.status === 'failed') {
    return 'failed';
  }
  if (runtimeProbes.status === 'stale') {
    return 'stale';
  }
  if (runtimeProbes.probes.some(isRuntimeProbeProofEligible)) {
    return 'proven';
  }

  return 'unproven';
}

function proofStatusForProbeSet(probes: PulseRuntimeProbeArtifactProbe[]): ProofStatus {
  if (probes.length === 0) {
    return 'unproven';
  }
  if (probes.some((probe) => probe.status === 'failed')) {
    return 'failed';
  }
  if (probes.some((probe) => probe.status === 'stale')) {
    return 'stale';
  }
  if (probes.some((probe) => probe.status === 'passed' && probe.freshness.stale)) {
    return 'stale';
  }
  if (probes.every(isRuntimeProbeProofEligible)) {
    return 'proven';
  }
  return 'unproven';
}

function checkHealthCheck(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(
      runtimeProbes.probes.filter(
        (p) => p.probeId === 'backend-health' || p.probeId === 'frontend-reachability',
      ),
    );
  }
  return 'unproven';
}

function checkScenarioPass(_capabilityId: string, rootDir: string): ProofStatus {
  const scenarioEvidence = safeReadJson<Record<string, unknown>>(
    rootDir,
    SCENARIO_EVIDENCE_FILENAME,
  );
  if (scenarioEvidence && Array.isArray(scenarioEvidence.scenarios)) {
    const scenarios = scenarioEvidence.scenarios as Array<Record<string, unknown>>;
    const total = scenarios.length;
    if (total === 0) {
      return 'unproven';
    }
    const passed = scenarios.filter((s) => s.status === 'passed').length;
    const failed = scenarios.filter((s) => s.status === 'failed').length;
    if (failed > 0) {
      return 'failed';
    }
    if (passed / total >= 0.5) {
      return 'proven';
    }
    return 'unproven';
  }

  const scenarioDir = safeJoin(rootDir, '.pulse', 'current');
  const hasScenarioFile = pathExists(path.join(scenarioDir, SCENARIO_EVIDENCE_FILENAME));
  return hasScenarioFile ? 'stale' : 'unproven';
}

function checkRuntimeProbe(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(runtimeProbes.probes);
  }
  return 'unproven';
}

function checkObservability(_capabilityId: string, rootDir: string): ProofStatus {
  const obsEvidence = safeReadJson<Record<string, unknown>>(rootDir, OBSERVABILITY_FILENAME);
  if (obsEvidence && typeof obsEvidence.executed === 'boolean') {
    if (obsEvidence.executed) {
      return 'proven';
    }
    return 'failed';
  }
  return 'unproven';
}

function checkSentryRegression(_capabilityId: string, rootDir: string): ProofStatus {
  const signalState = safeReadJson<Record<string, unknown>>(rootDir, SENTRY_ADAPTER_FILENAME);
  if (!signalState) {
    return 'unproven';
  }

  const adapters = Array.isArray(signalState.adapters)
    ? (signalState.adapters as Array<Record<string, unknown>>)
    : [];

  const sentryAdapter = adapters.find((a) => a.source === 'sentry' && a.status === 'ready');

  if (sentryAdapter && Array.isArray(sentryAdapter.signals)) {
    const highSeveritySignals = (sentryAdapter.signals as Array<Record<string, unknown>>).filter(
      (s) => typeof s.severity === 'number' && s.severity >= 7,
    );
    if (highSeveritySignals.length === 0) {
      return 'proven';
    }
    return 'failed';
  }

  const signals = Array.isArray(signalState.signals)
    ? (signalState.signals as Array<Record<string, unknown>>)
    : [];

  const sentrySignals = signals.filter((s) => s.source === 'sentry');
  if (sentrySignals.length > 0) {
    const highSeverity = sentrySignals.filter(
      (s) => typeof s.severity === 'number' && s.severity >= 7,
    );
    return highSeverity.length === 0 ? 'proven' : 'failed';
  }

  return 'unproven';
}

function checkDbSideEffects(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = loadRuntimeProbesArtifact(rootDir);
  if (runtimeProbes) {
    return proofStatusForProbeSet(
      runtimeProbes.probes.filter((p) => p.probeId === 'db-connectivity'),
    );
  }
  return 'unproven';
}

function checkRollbackFeasibility(rootDir: string): ProofStatus {
  return isRollbackPossible(rootDir) ? 'proven' : 'unproven';
}

function checkPerformanceBudget(_capabilityId: string, _rootDir: string): ProofStatus {
  return 'unproven';
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
  if (status === 'proven' || status === 'failed' || status === 'stale') return 'observed';
  if (status === 'not_required') return 'not_available';
  return 'not_available';
}

function reasonForProofStatus(dimension: ProductionProofDimension, status: ProofStatus): string {
  if (status === 'proven') return `${dimension} is backed by observed PULSE proof.`;
  if (status === 'failed') return `${dimension} has observed failing proof.`;
  if (status === 'stale') return `${dimension} has observed proof but it is stale.`;
  if (status === 'not_required') return `${dimension} is not required for this capability.`;
  return `${dimension} has no observed PULSE proof for this capability.`;
}

function buildDimensionEvidence(
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
          productEditRequired: false,
        },
      ],
    ),
  ) as Record<ProductionProofDimension, ProductionProofDimensionEvidence>;
}
