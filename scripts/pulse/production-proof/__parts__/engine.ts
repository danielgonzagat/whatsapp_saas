/**
 * PULSE Wave 5 — Production Proof Engine (Proof Builders)
 *
 * Contains the proof dimension evidence builders, proveCapability,
 * computeProofCoverage, and buildProductionProofState.
 */

import { deriveZeroValue } from '../../dynamic-reality-kernel';
import { pathExists, writeTextFile } from '../../safe-fs';
import type {
  ProductionProof,
  ProductionProofDimension,
  ProductionProofState,
  ProofStatus,
} from '../../types.production-proof';
import {
  RUNTIME_PROBES_FILENAME,
  SCENARIO_EVIDENCE_FILENAME,
  OBSERVABILITY_FILENAME,
  SENTRY_ADAPTER_FILENAME,
  _proofFailed,
  _proofProven,
  _proofStale,
  _proofUnproven,
  _truthNotAvailable,
  buildDimensionEvidence,
  checkDeployStatus,
  checkDbSideEffects,
  checkHealthCheck,
  checkObservability,
  checkPerformanceBudget,
  checkRollbackFeasibility,
  checkRuntimeProbe,
  checkScenarioPass,
  checkSentryRegression,
  computeOverallStatus,
  loadCapabilities,
  loadDeployHistory,
  resolveArtifactPath,
  resolveStatePath,
} from './dimensions';

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
  const dimensionStatuses: Record<ProductionProofDimension, ProofStatus> = {
    deployStatus,
    healthCheck,
    scenarioPass,
    runtimeProbe,
    observabilityCheck,
    noSentryRegression,
    dbSideEffects,
    rollbackPossible,
    performanceBudget,
  };
  const dimensionEvidence = buildDimensionEvidence(dimensionStatuses);
  const missingProofSignals = Object.values(dimensionEvidence).filter(
    (item) =>
      item.status === _proofUnproven ||
      item.status === _proofStale ||
      item.status === _proofFailed ||
      item.truthMode === _truthNotAvailable,
  );

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
    lastProven: overallStatus === _proofProven ? new Date().toISOString() : null,
    evidencePaths,
    dimensionEvidence,
    missingProofSignals,
  };
}

/**
 * Compute the percentage of capabilities that are proven (0–100).
 */
export function computeProofCoverage(proofs: ProductionProof[]): number {
  if (proofs.length === deriveZeroValue()) {
    return deriveZeroValue();
  }
  const proven = proofs.filter((p) => p.overallStatus === _proofProven).length;
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

  const provenCapabilities = proofs.filter((p) => p.overallStatus === _proofProven).length;
  const failedCapabilities = proofs.filter((p) => p.overallStatus === _proofFailed).length;
  const unprovenCapabilities = proofs.filter((p) => p.overallStatus === _proofUnproven).length;
  const coveragePercent = computeProofCoverage(proofs);
  const missingProofSignals = proofs.reduce(
    (sum, proof) => sum + proof.missingProofSignals.length,
    0,
  );
  const deployHistory = loadDeployHistory(rootDir);

  const state: ProductionProofState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: capabilities.length,
      provenCapabilities,
      failedCapabilities,
      unprovenCapabilities,
      coveragePercent,
      missingProofSignals,
    },
    proofs,
    deployHistory,
  };

  const outputPath = resolveStatePath(rootDir);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}
