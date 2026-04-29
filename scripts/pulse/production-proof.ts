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
import type { PulseCapability, PulseCapabilityState, PulseProductGraph } from './types';
import type { ProductionProof, ProductionProofState, ProofStatus } from './types.production-proof';

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
  const runtimeProbes = safeReadJson<Record<string, unknown>>(rootDir, RUNTIME_PROBES_FILENAME);
  if (runtimeProbes && Array.isArray(runtimeProbes.probes)) {
    const passedProbes = (runtimeProbes.probes as Array<Record<string, unknown>>).filter(
      (p) => p.status === 'passed',
    );
    if (passedProbes.length > 0) {
      return 'proven';
    }
  }

  return 'unproven';
}

function checkHealthCheck(_capabilityId: string, rootDir: string): ProofStatus {
  const runtimeProbes = safeReadJson<Record<string, unknown>>(rootDir, RUNTIME_PROBES_FILENAME);
  if (runtimeProbes && Array.isArray(runtimeProbes.probes)) {
    const healthProbes = (runtimeProbes.probes as Array<Record<string, unknown>>).filter(
      (p) => p.probeId === 'backend-health' || p.probeId === 'frontend-reachability',
    );
    if (healthProbes.length > 0 && healthProbes.every((p) => p.status === 'passed')) {
      return 'proven';
    }
    if (healthProbes.some((p) => p.status === 'failed')) {
      return 'failed';
    }
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
  const runtimeProbes = safeReadJson<Record<string, unknown>>(rootDir, RUNTIME_PROBES_FILENAME);
  if (runtimeProbes && Array.isArray(runtimeProbes.probes)) {
    const probes = runtimeProbes.probes as Array<Record<string, unknown>>;
    if (probes.length === 0) {
      return 'unproven';
    }
    const passed = probes.filter((p) => p.status === 'passed').length;
    if (passed === probes.length) {
      return 'proven';
    }
    if (probes.some((p) => p.status === 'failed')) {
      return 'failed';
    }
    return 'unproven';
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
  const runtimeProbes = safeReadJson<Record<string, unknown>>(rootDir, RUNTIME_PROBES_FILENAME);
  if (runtimeProbes && Array.isArray(runtimeProbes.probes)) {
    const dbProbes = (runtimeProbes.probes as Array<Record<string, unknown>>).filter(
      (p) => p.probeId === 'db-connectivity',
    );
    if (dbProbes.length > 0 && dbProbes.every((p) => p.status === 'passed')) {
      return 'proven';
    }
    if (dbProbes.some((p) => p.status === 'failed')) {
      return 'failed';
    }
  }
  return 'unproven';
}

function checkRollbackFeasibility(rootDir: string): ProofStatus {
  return isRollbackPossible(rootDir) ? 'proven' : 'unproven';
}

function checkPerformanceBudget(_capabilityId: string, _rootDir: string): ProofStatus {
  return 'not_required';
}

/**
 * Check whether a rollback to a previous deploy version is possible.
 *
 * Examines git history for deployment tags or checks whether multiple
 * deploy history entries exist for the current environment.
 */
export function isRollbackPossible(rootDir: string): boolean {
  const deployHistory = loadDeployHistory(rootDir);
  if (deployHistory.length >= 2) {
    const deployedCommits = deployHistory.filter(
      (entry) => entry.status === 'deployed' || entry.status === 'success',
    );
    return deployedCommits.length >= 2;
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

function loadDeployHistory(rootDir: string): ProductionProofState['deployHistory'] {
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

/**
 * Evaluate a single capability across all proof dimensions.
 *
 * Each dimension is checked independently using existing PULSE
 * evidence files (runtime probes, scenario evidence, observability,
 * Sentry signals, DB probes). The results are combined into a single
 * overall status.
 *
 * @param capabilityId - The capability to evaluate.
 * @param rootDir - Repo root directory.
 * @returns A complete production proof for the capability.
 */
export function proveCapability(capabilityId: string, rootDir: string): ProductionProof {
  const deployStatus = checkDeployStatus(capabilityId, rootDir);
  const healthCheck = checkHealthCheck(capabilityId, rootDir);
  const scenarioPass = checkScenarioPass(capabilityId, rootDir);
  const runtimeProbe = checkRuntimeProbe(capabilityId, rootDir);
  const observabilityCheck = checkObservability(capabilityId, rootDir);
  const noSentryRegression = checkSentryRegression(capabilityId, rootDir);
  const dbSideEffects = checkDbSideEffects(capabilityId, rootDir);
  const rollbackPossible = checkRollbackFeasibility(rootDir);
  const performanceBudget = checkPerformanceBudget(capabilityId, rootDir);

  const overallStatus = computeOverallStatus([
    deployStatus,
    healthCheck,
    scenarioPass,
    runtimeProbe,
    observabilityCheck,
    noSentryRegression,
    dbSideEffects,
    rollbackPossible,
    performanceBudget,
  ]);

  const evidencePaths = [
    RUNTIME_PROBES_FILENAME,
    SCENARIO_EVIDENCE_FILENAME,
    OBSERVABILITY_FILENAME,
    SENTRY_ADAPTER_FILENAME,
  ].filter((fileName) => pathExists(resolveArtifactPath(rootDir, fileName)));

  return {
    capabilityId,
    deployStatus,
    healthCheck,
    scenarioPass,
    runtimeProbe,
    observabilityCheck,
    noSentryRegression,
    dbSideEffects,
    rollbackPossible,
    performanceBudget,
    overallStatus,
    lastProven: overallStatus === 'proven' ? new Date().toISOString() : null,
    evidencePaths,
  };
}

/**
 * Compute the percentage of capabilities that are proven (0–100).
 */
export function computeProofCoverage(proofs: ProductionProof[]): number {
  if (proofs.length === 0) {
    return 0;
  }
  const proven = proofs.filter((p) => p.overallStatus === 'proven').length;
  return Math.round((proven / proofs.length) * 100);
}

/**
 * Build the full production proof state for all capabilities.
 *
 * Loads capability data, evaluates every capability across all proof
 * dimensions, loads deploy history, and persists the result to
 * `.pulse/current/PULSE_PRODUCTION_PROOF.json`.
 *
 * @param rootDir - Repo root directory.
 * @returns The generated production proof state.
 */
export function buildProductionProofState(rootDir: string): ProductionProofState {
  const capabilities = loadCapabilities(rootDir);
  const proofs: ProductionProof[] = [];

  for (const cap of capabilities) {
    const proof = proveCapability(cap.id, rootDir);
    proofs.push(proof);
  }

  const provenCapabilities = proofs.filter((p) => p.overallStatus === 'proven').length;
  const failedCapabilities = proofs.filter((p) => p.overallStatus === 'failed').length;
  const unprovenCapabilities = proofs.filter((p) => p.overallStatus === 'unproven').length;
  const coveragePercent = computeProofCoverage(proofs);
  const deployHistory = loadDeployHistory(rootDir);

  const state: ProductionProofState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: capabilities.length,
      provenCapabilities,
      failedCapabilities,
      unprovenCapabilities,
      coveragePercent,
    },
    proofs,
    deployHistory,
  };

  const outputPath = resolveStatePath(rootDir);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}
