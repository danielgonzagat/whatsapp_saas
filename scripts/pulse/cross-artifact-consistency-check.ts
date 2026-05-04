/**
 * PULSE Cross-Artifact Consistency Check
 *
 * Verifies that key fields are coherent across all PULSE artifacts.
 * PULSE self-trust must fail when artifacts contradict each other.
 *
 * Artifacts checked:
 *   Root:           PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_ARTIFACT_INDEX.json
 *   .pulse/current: PULSE_AUTONOMY_PROOF.json, PULSE_AUTONOMY_STATE.json,
 *                   PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_EXTERNAL_SIGNAL_STATE.json,
 *                   PULSE_CONVERGENCE_PLAN.json, PULSE_PRODUCT_VISION.json
 */

import * as path from 'path';
import type { ConsistencyResult, LoadedArtifact } from './cross-artifact-consistency-check/types';
import {
  DEFAULT_ARTIFACT_PATHS,
  REPO_ROOT,
  deepGet,
  loadArtifact,
} from './cross-artifact-consistency-check/loaders';
import { checkConsistency as runBaseConsistencyCheck } from './cross-artifact-consistency-check/comparators';
import { formatConsistencyResult } from './cross-artifact-consistency-check/formatter';
import { safeJoin } from './lib/safe-path';

// Re-export types for backward compatibility
export type {
  ArtifactDivergence,
  ConsistencyResult,
  LoadedArtifact,
} from './cross-artifact-consistency-check/types';

// Re-export functions
export { loadArtifact, DEFAULT_ARTIFACT_PATHS } from './cross-artifact-consistency-check/loaders';
export { formatConsistencyResult } from './cross-artifact-consistency-check/formatter';

const SUPPLEMENTAL_ARTIFACT_PATHS = [
  'PULSE_MACHINE_READINESS.json',
  '.pulse/current/PULSE_MACHINE_READINESS.json',
  'PULSE_PROOF_READINESS.json',
  '.pulse/current/PULSE_PROOF_READINESS.json',
  'PULSE_EXECUTION_MATRIX.json',
  '.pulse/current/PULSE_EXECUTION_MATRIX.json',
  'PULSE_PATH_COVERAGE.json',
  '.pulse/current/PULSE_PATH_COVERAGE.json',
] as const;

interface NormalizedSignal {
  source: string;
  field: string;
  value: unknown;
  normalized: boolean;
}

interface ProofDebtSignal {
  source: string;
  field: string;
  value: unknown;
}

function normalizeFinalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (['SIM', 'YES', 'TRUE', 'READY', 'CERTIFIED', 'PASS'].includes(normalized)) {
    return true;
  }
  if (
    ['NAO', 'NO', 'FALSE', 'NOT_READY', 'NOT_CERTIFIED', 'PARTIAL', 'FAIL'].includes(normalized)
  ) {
    return false;
  }
  return undefined;
}

function addFinalSignal(
  signals: NormalizedSignal[],
  artifact: LoadedArtifact,
  field: string,
): void {
  const value = deepGet(artifact.data, field);
  const normalized = normalizeFinalBoolean(value);
  if (normalized !== undefined) {
    signals.push({ source: artifact.filePath, field, value, normalized });
  }
}

function collectFinalSignals(artifacts: LoadedArtifact[]): NormalizedSignal[] {
  const signals: NormalizedSignal[] = [];
  for (const artifact of artifacts) {
    addFinalSignal(signals, artifact, 'canDeclareComplete');
    addFinalSignal(signals, artifact, 'autonomyReadiness.canDeclareComplete');
    addFinalSignal(signals, artifact, 'verdicts.canDeclareComplete');
    addFinalSignal(signals, artifact, 'productionAutonomyVerdict');
    addFinalSignal(signals, artifact, 'productionAutonomyAnswer');
    addFinalSignal(signals, artifact, 'verdicts.productionAutonomy');
    addFinalSignal(signals, artifact, 'humanReplacementStatus');

    const basename = path.basename(artifact.filePath);
    if (
      basename === 'PULSE_CERTIFICATE.json' ||
      basename === 'PULSE_CONVERGENCE_PLAN.json' ||
      basename === 'PULSE_MACHINE_READINESS.json' ||
      basename === 'PULSE_PROOF_READINESS.json'
    ) {
      addFinalSignal(signals, artifact, 'status');
    }
  }
  return signals;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectProofDebtFromValue(
  signals: ProofDebtSignal[],
  source: string,
  value: unknown,
  pathParts: string[],
): void {
  if (!isRecord(value)) {
    return;
  }

  const status = value.status;
  const failureClass = value.failureClass;
  const evidenceMode = value.evidenceMode ?? value.truthMode;
  const field = pathParts.join('.');

  if (status === 'fail') {
    signals.push({ source, field, value: failureClass ?? status });
  }
  if (failureClass === 'missing_evidence') {
    signals.push({ source, field, value: failureClass });
  }
  if (
    typeof evidenceMode === 'string' &&
    ['inferred', 'planned', 'aspirational', 'not_available'].includes(evidenceMode)
  ) {
    signals.push({ source, field: `${field}.evidenceMode`, value: evidenceMode });
  }

  for (const [key, child] of Object.entries(value)) {
    const childField = [...pathParts, key];
    if (typeof child === 'number' && key.toLowerCase().includes('unobserved') && child > 0) {
      signals.push({ source, field: childField.join('.'), value: child });
    }
    if (key === 'proven' && child === false && pathParts[pathParts.length - 1] === 'cycleProof') {
      signals.push({ source, field: childField.join('.'), value: child });
    }
    collectProofDebtFromValue(signals, source, child, childField);
  }
}

function collectProofDebtSignals(artifacts: LoadedArtifact[]): ProofDebtSignal[] {
  const signals: ProofDebtSignal[] = [];
  for (const artifact of artifacts) {
    collectProofDebtFromValue(signals, artifact.filePath, artifact.data, []);
  }
  return signals;
}

function appendFinalProductionDivergences(
  result: ConsistencyResult,
  artifacts: LoadedArtifact[],
): ConsistencyResult {
  const divergences = [...result.divergences];
  const finalSignals = collectFinalSignals(artifacts);
  const truthValues = new Set(finalSignals.map((signal) => signal.normalized));

  if (truthValues.size > 1) {
    const values: Record<string, unknown> = {};
    for (const signal of finalSignals) {
      values[`${signal.source}#${signal.field}`] = signal.value;
    }
    divergences.push({
      field: 'finalProduction.canDeclareComplete',
      values,
      sources: [...new Set(finalSignals.map((signal) => signal.source))],
    });
  }

  const completionClaims = finalSignals.filter((signal) => signal.normalized);
  const proofDebtSignals = collectProofDebtSignals(artifacts);
  if (completionClaims.length > 0 && proofDebtSignals.length > 0) {
    const values: Record<string, unknown> = {};
    for (const claim of completionClaims) {
      values[`${claim.source}#${claim.field}`] = claim.value;
    }
    for (const debt of proofDebtSignals) {
      values[`${debt.source}#${debt.field}`] = debt.value;
    }
    divergences.push({
      field: 'finalProduction.observedProof',
      values,
      sources: [
        ...new Set([
          ...completionClaims.map((claim) => claim.source),
          ...proofDebtSignals.map((debt) => debt.source),
        ]),
      ],
    });
  }

  return {
    ...result,
    pass: divergences.length === 0,
    divergences,
  };
}

export function checkConsistency(artifacts: LoadedArtifact[]): ConsistencyResult {
  return appendFinalProductionDivergences(runBaseConsistencyCheck(artifacts), artifacts);
}

/**
 * Load all default PULSE artifacts from the repo root and run the consistency check.
 * Resolves paths relative to the repo root unless an absolute path is provided.
 *
 * @param repoRoot - Repository root directory (defaults to auto-detected REPO_ROOT).
 * @param artifactsOverride - Optional map of relative artifact path → parsed JSON data.
 *   Keys must match the relative paths in DEFAULT_ARTIFACT_PATHS (e.g. "PULSE_CERTIFICATE.json",
 *   ".pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json"). When provided, artifacts in the override
 *   map skip disk reads and use the in-memory data instead. This allows callers to inject freshly
 *   computed data before it has been persisted to disk.
 */
export function runCrossArtifactConsistencyCheck(
  repoRoot?: string,
  artifactsOverride?: Record<string, Record<string, unknown>>,
): ConsistencyResult {
  const root = repoRoot ?? REPO_ROOT;
  const missingArtifacts: string[] = [];
  const loaded: LoadedArtifact[] = [];

  const artifactPaths = [
    ...DEFAULT_ARTIFACT_PATHS.map((rel) => ({ rel, optional: false })),
    ...SUPPLEMENTAL_ARTIFACT_PATHS.map((rel) => ({ rel, optional: true })),
  ];

  for (const { rel, optional } of artifactPaths) {
    const filePath = path.isAbsolute(rel) ? rel : safeJoin(root, rel);
    let data: Record<string, unknown> | null;

    if (artifactsOverride && rel in artifactsOverride) {
      data = artifactsOverride[rel];
    } else {
      try {
        data = loadArtifact(filePath);
      } catch (err) {
        // Invalid JSON — treat as missing but report
        missingArtifacts.push(filePath);
        continue;
      }
    }

    if (data === null) {
      if (!optional && !(artifactsOverride && rel in artifactsOverride)) {
        missingArtifacts.push(filePath);
      }
    } else {
      loaded.push({ filePath, data });
    }
  }

  const result = checkConsistency(loaded);
  result.missingArtifacts = missingArtifacts;
  return result;
}

// ----------------------------------------------------------------
// CLI entry point
// ----------------------------------------------------------------
if (require.main === module) {
  const result = runCrossArtifactConsistencyCheck();
  process.stdout.write(formatConsistencyResult(result));
  if (!result.pass) {
    process.exit(1);
  }
}
