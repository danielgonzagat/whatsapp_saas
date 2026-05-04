/**
 * PULSE Wave 6, Module B — Full Path Coverage Engine.
 *
 * Consumes the execution matrix and produces a {@link PathCoverageState}
 * artifact that classifies every path, pinpoints inferred-only gaps, and
 * generates test/probe definitions for critical uncovered paths.
 *
 * Stored at `.pulse/current/PULSE_PATH_COVERAGE.json`.
 */

import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from '../../types';
import type {
  PathCoverageEntry,
  PathCoverageState,
  PathClassification,
} from '../../types.path-coverage-engine';
import { buildPathProofPlan } from '../../path-proof-runner';
import { buildPathProofEvidenceArtifact } from '../../path-proof-evidence';
import { readJsonFile, writeTextFile, ensureDir, pathExists as fsPathExists } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath as normalizeGovernancePath,
  type GovernanceBoundary,
} from '../../scope-state-classify';
import {
  buildTerminalReason,
  buildExpectedEvidence,
  buildStructuralSafetyClassification,
  buildArtifactLinks,
  buildTerminalProof,
  getEvidenceMode,
  normalizeCoverageExecutionMode,
} from './evidence';
import { generateTestForPath, canGenerateProbeBlueprint } from './probe';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Build the full path coverage state from the execution matrix. */
export function buildPathCoverageState(
  rootDir: string,
  matrixOverride?: PulseExecutionMatrix,
): PathCoverageState {
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_MATRIX.json');

  let matrix = matrixOverride;
  let matrixPaths: PulseExecutionMatrixPath[] = matrix?.paths ?? [];
  if (!matrixOverride && fsPathExists(matrixPath)) {
    matrix = readJsonFile<PulseExecutionMatrix>(matrixPath);
    matrixPaths = matrix.paths ?? [];
  }
  const governanceBoundary = loadGovernanceBoundary(rootDir);

  const entries: PathCoverageEntry[] = matrixPaths.map((mp) => {
    const safe = isSafeToExecute(mp, governanceBoundary);
    const protectedSurface = isProtectedGovernanceSurface(mp, governanceBoundary);
    const inferredClassification = classifyPath(mp, rootDir);
    const classification =
      safe || inferredClassification !== 'probe_blueprint_generated'
        ? inferredClassification
        : 'inferred_only';
    const terminalReason = buildTerminalReason(mp, classification, safe);
    const probeExecutionMode = normalizeCoverageExecutionMode(mp.executionMode, mp.risk);
    const testInfo =
      safe && classification === 'probe_blueprint_generated'
        ? generateTestForPath(mp, rootDir, probeExecutionMode, terminalReason)
        : { testFilePath: null, fixtureNeeded: [] as string[] };

    const terminalProof = buildTerminalProof(mp, classification, testInfo.testFilePath);

    return {
      pathId: mp.pathId,
      entrypoint: mp.entrypoint.description,
      risk: mp.risk,
      executionMode: probeExecutionMode,
      classification,
      terminalReason,
      testGenerated: testInfo.testFilePath !== null,
      testFilePath: testInfo.testFilePath,
      safeToExecute: safe,
      fixtureNeeded: testInfo.fixtureNeeded,
      lastProbed:
        classification === 'observed_pass' || classification === 'observed_fail'
          ? new Date().toISOString()
          : null,
      evidenceMode: getEvidenceMode(classification),
      probeExecutionMode,
      validationCommand: mp.validationCommand,
      expectedEvidence: buildExpectedEvidence(mp),
      structuralSafetyClassification: buildStructuralSafetyClassification(
        mp,
        safe,
        protectedSurface,
        probeExecutionMode,
      ),
      artifactLinks: buildArtifactLinks(mp, testInfo.testFilePath),
      terminalProof,
    };
  });

  const observedPass = entries.filter((e) => e.classification === 'observed_pass').length;
  const observedFail = entries.filter((e) => e.classification === 'observed_fail').length;
  const testGenerated = entries.filter((e) => e.testGenerated).length;
  const probeBlueprintGenerated = entries.filter(
    (e) => e.classification === 'probe_blueprint_generated',
  ).length;
  const inferredOnly = entries.filter((e) => e.classification === 'inferred_only').length;
  const criticalInferredOnly = entries.filter(
    (e) => e.classification === 'inferred_only' && isCriticalRisk(e.risk),
  ).length;
  const criticalUnobserved = entries.filter(
    (e) =>
      isCriticalRisk(e.risk) &&
      (e.classification === 'inferred_only' || e.classification === 'probe_blueprint_generated'),
  ).length;
  const criticalBlueprintReady = entries.filter(
    (e) => isCriticalRisk(e.risk) && e.terminalProof.status === 'blueprint_ready',
  ).length;
  const criticalTerminalReasoned = entries.filter(
    (e) => isCriticalRisk(e.risk) && e.terminalProof.status === 'terminal_reasoned',
  ).length;
  const criticalInferredGap = entries.filter(
    (e) => isCriticalRisk(e.risk) && e.terminalProof.status === 'inferred_gap',
  ).length;
  const coveragePercent = computeCoveragePercent(entries);

  const state: PathCoverageState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPaths: entries.length,
      observedPass,
      observedFail,
      testGenerated,
      probeBlueprintGenerated,
      inferredOnly,
      criticalInferredOnly,
      criticalUnobserved,
      criticalBlueprintReady,
      criticalTerminalReasoned,
      criticalInferredGap,
      coveragePercent,
    },
    paths: entries,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(safeJoin(outputDir, 'PULSE_PATH_COVERAGE.json'), JSON.stringify(state, null, 2));
  if (matrix) {
    const pathProofPlan = buildPathProofPlan(rootDir, {
      matrix,
      pathCoverage: state,
      generatedAt: state.generatedAt,
    });
    buildPathProofEvidenceArtifact(rootDir, {
      plan: pathProofPlan,
      runnerResults: [],
      generatedAt: state.generatedAt,
    });
  }

  return state;
}

/** Classify a single execution matrix path into a terminal path coverage bucket. */
export function classifyPath(mp: PulseExecutionMatrixPath, _rootDir: string): PathClassification {
  const status = mp.status;
  const evidenceKeys = unique(mp.observedEvidence.map((e) => e.status));
  const hasPassing = evidenceKeys.includes('passed');
  const hasFailing = evidenceKeys.includes('failed');
  const hasMapped = evidenceKeys.includes('mapped');

  if (status === 'observed_pass' || (hasPassing && !hasFailing)) {
    return 'observed_pass';
  }

  if (status === 'observed_fail' || hasFailing) {
    return 'observed_fail';
  }

  if (status === 'unreachable') {
    return 'unreachable';
  }

  if (status === 'not_executable') {
    return 'not_executable';
  }

  if (status === 'blocked_human_required' || status === 'inferred_only' || status === 'untested') {
    if (canGenerateProbeBlueprint(mp, hasMapped)) {
      return 'probe_blueprint_generated';
    }
    return 'inferred_only';
  }

  return 'inferred_only';
}

/** Determine whether an AI agent can safely execute the path autonomously. */
export function isSafeToExecute(
  mp: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary = loadGovernanceBoundary(process.cwd()),
): boolean {
  return !isProtectedGovernanceSurface(mp, governanceBoundary);
}

/** Determine whether a path maps to protected governance or inaccessible surfaces. */
function isProtectedGovernanceSurface(
  mp: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary,
): boolean {
  const allFilePaths = unique([
    ...mp.filePaths,
    ...(mp.entrypoint.filePath ? [mp.entrypoint.filePath] : []),
    ...(mp.breakpoint?.filePath ? [mp.breakpoint.filePath] : []),
  ]);

  return allFilePaths.some((filePath) =>
    isGovernanceProtectedFile(normalizeGovernancePath(filePath), governanceBoundary),
  );
}

/** Compute coverage percentage from classified entries. */
export function computeCoveragePercent(paths: PathCoverageEntry[]): number {
  if (paths.length === 0) {
    return 100;
  }

  const covered = paths.filter((p) =>
    ['observed_pass', 'observed_fail'].includes(p.classification),
  ).length;

  return Math.min(100, Math.round((covered / paths.length) * 100));
}

function isCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return risk === 'critical';
}
