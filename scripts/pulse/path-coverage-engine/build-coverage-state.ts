import * as path from 'path';
import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from '../types.execution-matrix';
import type {
  PathCoverageExecutionMode,
  PathCoverageEntry,
  PathCoverageState,
} from '../types.path-coverage-engine';
import { buildPathProofPlan } from '../path-proof-runner/main';
import { buildPathProofEvidenceArtifact } from '../path-proof-evidence/main';
import { readJsonFile, writeTextFile, ensureDir, pathExists } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { injectRunIdentity, type PulseRunIdentity } from '../run-identity';
import { loadGovernanceBoundary } from '../scope-state-classify';
import {
  _ARTIFACT_NAMES,
  isObservedPassClass,
  isObservedFailClass,
  isInferredOnlyClass,
  isProbeBlueprintClass,
} from './kernel-helpers';
import {
  classifyPath,
  isSafeToExecute,
  computeCoveragePercent,
  isProtectedGovernanceSurface,
  normalizeCoverageExecutionMode,
  getEvidenceMode,
  detectRouteMethod,
  isCriticalRisk,
} from './path-classification';
import {
  buildTerminalReason,
  buildExpectedEvidence,
  buildStructuralSafetyClassification,
  buildTerminalProof,
  buildArtifactLinks,
} from './terminal-proof';
import { generateProbeFileContent } from './probe-generation';

interface BuildPathCoverageStateOptions {
  identity?: PulseRunIdentity;
  mirrorToRoot?: boolean;
}

export function generateTestForPath(
  mp: PulseExecutionMatrixPath,
  rootDir: string,
  executionMode: PathCoverageExecutionMode = normalizeCoverageExecutionMode(
    mp.executionMode,
    mp.risk,
  ),
  terminalReason = buildTerminalReason(mp, 'probe_blueprint_generated', true),
): { testFilePath: string; fixtureNeeded: string[] } {
  const safeName = mp.pathId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
  const testDir = safeJoin(rootDir, '.pulse', 'frontier');
  const testFilePath = path.posix.join('.pulse', 'frontier', `${safeName}.probe.json`);
  ensureDir(testDir, { recursive: true });

  const fixtures: string[] = [];
  const routeMethod = detectRouteMethod(mp);

  if (mp.capabilityId) {
    fixtures.push(`capability:${mp.capabilityId}`);
  }
  if (mp.flowId) {
    fixtures.push(`flow:${mp.flowId}`);
  }

  const probeContent = generateProbeFileContent(
    mp,
    routeMethod,
    fixtures,
    executionMode,
    terminalReason,
  );
  writeTextFile(safeJoin(rootDir, testFilePath), probeContent);

  return { testFilePath, fixtureNeeded: fixtures };
}

export function buildPathCoverageState(
  rootDir: string,
  matrixOverride?: PulseExecutionMatrix,
  options: BuildPathCoverageStateOptions = {},
): PathCoverageState {
  const executionMatrixArtifact = _ARTIFACT_NAMES.executionMatrix ?? 'PULSE_EXECUTION_MATRIX.json';
  const pathCoverageArtifact = _ARTIFACT_NAMES.pathCoverage ?? 'PULSE_PATH_COVERAGE.json';
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', executionMatrixArtifact);

  let matrix = matrixOverride;
  let matrixPaths: PulseExecutionMatrixPath[] = matrix?.paths ?? [];
  if (!matrixOverride && pathExists(matrixPath)) {
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

  const observedPass = entries.filter((e) => isObservedPassClass(e.classification)).length;
  const observedFail = entries.filter((e) => isObservedFailClass(e.classification)).length;
  const testGenerated = entries.filter((e) => e.testGenerated).length;
  const probeBlueprintGenerated = entries.filter((e) =>
    isProbeBlueprintClass(e.classification),
  ).length;
  const inferredOnly = entries.filter((e) => isInferredOnlyClass(e.classification)).length;
  const criticalInferredOnly = entries.filter(
    (e) => isInferredOnlyClass(e.classification) && isCriticalRisk(e.risk),
  ).length;
  const criticalUnobserved = entries.filter(
    (e) =>
      isCriticalRisk(e.risk) &&
      (isInferredOnlyClass(e.classification) || isProbeBlueprintClass(e.classification)),
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

  const generatedAt = options.identity?.generatedAt ?? new Date().toISOString();
  const state: PathCoverageState = {
    generatedAt,
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
  const serializedState = options.identity
    ? injectRunIdentity(JSON.stringify(state, null, 2), options.identity)
    : JSON.stringify(state, null, 2);
  writeTextFile(safeJoin(outputDir, pathCoverageArtifact), serializedState);
  if (options.mirrorToRoot ?? Boolean(options.identity)) {
    writeTextFile(safeJoin(rootDir, pathCoverageArtifact), serializedState);
  }
  if (matrix) {
    const pathProofPlan = buildPathProofPlan(rootDir, {
      matrix,
      pathCoverage: state,
      generatedAt,
    });
    buildPathProofEvidenceArtifact(rootDir, {
      plan: pathProofPlan,
      runnerResults: [],
      generatedAt,
    });
  }

  return state;
}
