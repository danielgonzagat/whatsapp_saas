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
  loadArtifact,
} from './cross-artifact-consistency-check/loaders';
import { checkConsistency } from './cross-artifact-consistency-check/comparators';
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
export { checkConsistency } from './cross-artifact-consistency-check/comparators';
export { formatConsistencyResult } from './cross-artifact-consistency-check/formatter';

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

  for (const rel of DEFAULT_ARTIFACT_PATHS) {
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
      if (!(artifactsOverride && rel in artifactsOverride)) {
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
