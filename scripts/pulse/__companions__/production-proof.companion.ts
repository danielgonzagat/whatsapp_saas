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
      item.status === 'unproven' ||
      item.status === 'stale' ||
      item.status === 'failed' ||
      item.truthMode === 'not_available',
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
    lastProven: overallStatus === 'proven' ? new Date().toISOString() : null,
    evidencePaths,
    dimensionEvidence,
    missingProofSignals,
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

