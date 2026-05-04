/**
 * PULSE Wave 6, Module B — Full Path Coverage Engine.
 *
 * Consumes the execution matrix and produces a {@link PathCoverageState}
 * artifact that classifies every path, pinpoints inferred-only gaps, and
 * generates test/probe definitions for critical uncovered paths.
 *
 * Stored at `.pulse/current/PULSE_PATH_COVERAGE.json`.
 */

import * as path from 'path';
import type { PulseExecutionMatrix, PulseExecutionMatrixPath } from './types';
import type {
  PathCoverageArtifactLink,
  PathClassification,
  PathCoverageExecutionMode,
  PathCoverageExpectedEvidence,
  PathCoverageEntry,
  PathCoverageState,
  PathCoverageStructuralSafetyClassification,
  PathCoverageTerminalProof,
} from './types.path-coverage-engine';
import { buildPathProofPlan } from './path-proof-runner';
import { buildPathProofEvidenceArtifact } from './path-proof-evidence';
import { readJsonFile, writeTextFile, ensureDir, pathExists } from './safe-fs';
import { safeJoin } from './safe-path';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath as normalizeGovernancePath,
  type GovernanceBoundary,
} from './scope-state-classify';
import {
  deriveZeroValue,
  deriveUnitValue,
  deriveStringUnionMembersFromTypeContract,
  discoverAllObservedArtifactFilenames,
  discoverConvergenceExecutionModeLabels,
  discoverConvergenceRiskLevelLabels,
  discoverExecutionMatrixPathStatusLabels,
  discoverHarnessExecutionStatusLabels,
} from './dynamic-reality-kernel';

// ── Kernel-derived reality sources (module-level, cached by kernel) ─────────

const _PATH_CLASSIFICATION_MEMBERS =
  deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.path-coverage-engine.ts',
    'PathClassification',
  );

const _PATH_COVERAGE_EXECUTION_MODE_MEMBERS =
  deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.path-coverage-engine.ts',
    'PathCoverageExecutionMode',
  );

const _RISK_LEVEL_MEMBERS = discoverConvergenceRiskLevelLabels();
const _HARNESS_STATUS_MEMBERS = discoverHarnessExecutionStatusLabels();
const _MATRIX_PATH_STATUS_MEMBERS = discoverExecutionMatrixPathStatusLabels();
const _CONVERGENCE_EXECUTION_MODE_MEMBERS = discoverConvergenceExecutionModeLabels();
const _ARTIFACT_NAMES = discoverAllObservedArtifactFilenames();

// ── Kernel-derived decision helpers ─────────────────────────────────────────

function isObservedPassClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'observed_pass';
}
function isObservedFailClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'observed_fail';
}
function isInferredOnlyClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'inferred_only';
}
function isProbeBlueprintClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'probe_blueprint_generated';
}
function isUnreachableClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'unreachable';
}
function isNotExecutableClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'not_executable';
}
function isCriticalRiskLevel(r: string) {
  return _RISK_LEVEL_MEMBERS.has(r) && r === 'critical';
}
function isHighRiskLevel(r: string) {
  return _RISK_LEVEL_MEMBERS.has(r) && r === 'high';
}
function isGovernedValidationMode(m: string) {
  return _PATH_COVERAGE_EXECUTION_MODE_MEMBERS.has(m) && m === 'governed_validation';
}
function isAiSafeMode(m: string) {
  return _PATH_COVERAGE_EXECUTION_MODE_MEMBERS.has(m) && m === 'ai_safe';
}
function isEvidenceStatusPassed(s: string) {
  return _HARNESS_STATUS_MEMBERS.has(s) && s === 'passed';
}
function isEvidenceStatusFailed(s: string) {
  return _HARNESS_STATUS_MEMBERS.has(s) && s === 'failed';
}
function isBlockedHumanRequiredMatrixStatus(s: string) {
  return _MATRIX_PATH_STATUS_MEMBERS.has(s) && s === 'blocked_human_required';
}
function isUntestedMatrixStatus(s: string) {
  return _MATRIX_PATH_STATUS_MEMBERS.has(s) && s === 'untested';
}
function isHumanRequiredExecutionMode(m: string) {
  return _CONVERGENCE_EXECUTION_MODE_MEMBERS.has(m) && m === 'human_required';
}
function isObservationOnlyExecutionMode(m: string) {
  return _CONVERGENCE_EXECUTION_MODE_MEMBERS.has(m) && m === 'observation_only';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Build the full path coverage state from the execution matrix. */
export function buildPathCoverageState(
  rootDir: string,
  matrixOverride?: PulseExecutionMatrix,
): PathCoverageState {
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', _ARTIFACT_NAMES.executionMatrix);

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
  const probeBlueprintGenerated = entries.filter(
    (e) => isProbeBlueprintClass(e.classification),
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
  writeTextFile(safeJoin(outputDir, _ARTIFACT_NAMES.pathCoverage), JSON.stringify(state, null, 2));
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
  const hasPassing = evidenceKeys.some((k) => isEvidenceStatusPassed(k));
  const hasFailing = evidenceKeys.some((k) => isEvidenceStatusFailed(k));
  const hasMapped = evidenceKeys.includes('mapped');

  if (isObservedPassClass(status) || (hasPassing && !hasFailing)) {
    return 'observed_pass';
  }

  if (isObservedFailClass(status) || hasFailing) {
    return 'observed_fail';
  }

  if (isUnreachableClass(status)) {
    return 'unreachable';
  }

  if (isNotExecutableClass(status)) {
    return 'not_executable';
  }

  if (
    isBlockedHumanRequiredMatrixStatus(status) ||
    isInferredOnlyClass(status) ||
    isUntestedMatrixStatus(status)
  ) {
    if (canGenerateProbeBlueprint(mp, hasMapped)) {
      return 'probe_blueprint_generated';
    }
    return 'inferred_only';
  }

  return 'inferred_only';
}

/** Generate a test or probe definition for an inferred-only path. */
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
  if (paths.length === deriveZeroValue()) {
    return 100;
  }

  const covered = paths.filter((p) =>
    isObservedPassClass(p.classification) || isObservedFailClass(p.classification),
  ).length;

  return Math.min(100, Math.round((covered / paths.length) * 100));
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function detectRouteMethod(mp: PulseExecutionMatrixPath): string {
  const chainRoles = mp.chain
    .map((s) => s.description)
    .join(' ')
    .toLowerCase();
  if (/post|create|save|send|submit/.test(chainRoles)) {
    return 'POST';
  }
  if (/put|update|edit|patch/.test(chainRoles)) {
    return 'PUT';
  }
  if (/delete|remove|destroy/.test(chainRoles)) {
    return 'DELETE';
  }
  return 'GET';
}

function canGenerateProbeBlueprint(mp: PulseExecutionMatrixPath, hasMapped: boolean): boolean {
  if (mp.routePatterns.length > deriveZeroValue()) {
    return true;
  }

  if (!isHighOrCriticalRisk(mp.risk)) {
    return false;
  }

  return (
    hasMapped || Boolean(mp.entrypoint.filePath || mp.entrypoint.nodeId || mp.filePaths.length > deriveZeroValue())
  );
}

function generateProbeFileContent(
  mp: PulseExecutionMatrixPath,
  method: string,
  fixtures: string[],
  executionMode: PathCoverageExecutionMode,
  terminalReason: string,
): string {
  const route = mp.routePatterns[0] ?? '/';
  const safeName = mp.pathId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
  const probeFilePath = path.posix.join('.pulse', 'frontier', `${safeName}.probe.json`);
  return JSON.stringify(
    {
      kind: 'pulse_frontier_probe_blueprint',
      pathId: mp.pathId,
      entrypoint: mp.entrypoint.description,
      matrixStatus: normalizeBlueprintMatrixStatus(mp.status),
      generatedAt: new Date().toISOString(),
      evidenceMode: 'blueprint',
      executed: false,
      coverageCountsAsObserved: false,
      probeExecutionMode: executionMode,
      terminalReason,
      structuralSafetyClassification: buildStructuralSafetyClassification(
        mp,
        true,
        false,
        executionMode,
      ),
      route: {
        method,
        pattern: route,
      },
      fixtures,
      validationCommand: mp.validationCommand,
      expectedEvidence: buildExpectedEvidence(mp),
      artifactLinks: buildArtifactLinks(mp, probeFilePath),
      breakpoint: mp.breakpoint,
      requiredEvidence: mp.requiredEvidence,
      validationRequired: buildRequiredValidation(mp),
    },
    null,
    2,
  );
}

function normalizeBlueprintMatrixStatus(
  status: PulseExecutionMatrixPath['status'],
):
  | Exclude<PulseExecutionMatrixPath['status'], 'blocked_human_required'>
  | 'governed_validation_required' {
  if (status === 'blocked_human_required') {
    return 'governed_validation_required';
  }
  return status;
}

function getEvidenceMode(classification: PathClassification): PathCoverageEntry['evidenceMode'] {
  if (isObservedPassClass(classification) || isObservedFailClass(classification)) {
    return 'observed';
  }
  if (isProbeBlueprintClass(classification)) {
    return 'blueprint';
  }
  return 'inferred';
}

function isCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return isCriticalRiskLevel(risk);
}

function isHighOrCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return isHighRiskLevel(risk) || isCriticalRiskLevel(risk);
}

function normalizeCoverageExecutionMode(
  mode: PulseExecutionMatrixPath['executionMode'],
  risk: PathCoverageEntry['risk'],
): PathCoverageExecutionMode {
  if (isGovernedValidationMode(mode)) {
    return 'governed_validation';
  }
  if (isHumanRequiredExecutionMode(mode) || isObservationOnlyExecutionMode(mode)) {
    return 'governed_validation';
  }
  return isHighOrCriticalRisk(risk) ? 'governed_validation' : 'ai_safe';
}

function buildTerminalReason(
  mp: PulseExecutionMatrixPath,
  classification: PathClassification,
  safeToExecute: boolean,
): string {
  if (isObservedPassClass(classification)) {
    return summarizeObservedEvidence(mp, 'passed') ?? 'Path has passing observed runtime evidence.';
  }
  if (isObservedFailClass(classification)) {
    return summarizeObservedEvidence(mp, 'failed') ?? 'Path has failing observed runtime evidence.';
  }
  if (isUnreachableClass(classification)) {
    return mp.breakpoint?.reason ?? 'Path is unreachable from the discovered execution graph.';
  }
  if (isNotExecutableClass(classification)) {
    return mp.breakpoint?.reason ?? 'Path is classified as non-executable inventory.';
  }
  if (isProbeBlueprintClass(classification)) {
    const mode = normalizeCoverageExecutionMode(mp.executionMode, mp.risk);
    const routeOrEntry = mp.routePatterns[0] ?? mp.entrypoint.filePath ?? mp.entrypoint.nodeId;
    const machineProofDebt = findSyntheticMachineProofDebt(mp);
    if (machineProofDebt) {
      return `${machineProofDebt.summary} Generated ${mode} probe blueprint must execute or terminally classify the scenario before product capability evidence can be claimed.`;
    }
    return safeToExecute
      ? `Unobserved ${mp.risk} path has ${routeOrEntry ?? 'a discovered entrypoint'} and is terminalized as a ${mode} probe blueprint until runtime evidence executes.`
      : 'Unobserved path maps to a protected governance surface and remains inferred without executable coverage.';
  }
  if (mp.breakpoint?.reason) {
    return mp.breakpoint.reason;
  }
  return 'Path lacks pass/fail runtime evidence and has no executable probe blueprint entrypoint yet.';
}

function buildExpectedEvidence(mp: PulseExecutionMatrixPath): PathCoverageExpectedEvidence[] {
  const expected = mp.requiredEvidence.map((requirement) => ({
    kind: requirement.kind,
    required: requirement.required,
    reason: requirement.reason,
  }));

  if (expected.some((item) => item.kind === 'runtime')) {
    return appendScenarioMachineExpectedEvidence(mp, expected);
  }

  return appendScenarioMachineExpectedEvidence(mp, [
    ...expected,
    {
      kind: 'runtime',
      required: true,
      reason:
        'Generated probe blueprint must execute and publish pass/fail evidence before this path can count as observed.',
    },
  ]);
}

function appendScenarioMachineExpectedEvidence(
  mp: PulseExecutionMatrixPath,
  expected: PathCoverageExpectedEvidence[],
): PathCoverageExpectedEvidence[] {
  const machineProofDebt = findSyntheticMachineProofDebt(mp);
  if (!machineProofDebt) {
    return expected;
  }
  return [
    ...expected,
    {
      kind: 'e2e',
      required: true,
      reason:
        'Customer/soak synthetic missing evidence must be executed or classified by the PULSE machine before it can satisfy scenario proof.',
    },
  ];
}

function buildRequiredValidation(mp: PulseExecutionMatrixPath): string[] {
  const base = [
    'runtime_harness_executes_blueprint',
    'response_contract_verified',
    'side_effects_verified_when_declared',
  ];
  if (!findSyntheticMachineProofDebt(mp)) {
    return base;
  }
  return [
    ...base,
    'scenario_blueprint_generated',
    'scenario_runtime_execution_attempted_or_classified',
    'terminal_proof_reason_recorded',
  ];
}

function findSyntheticMachineProofDebt(
  mp: PulseExecutionMatrixPath,
): PulseExecutionMatrixPath['observedEvidence'][number] | null {
  return (
    mp.observedEvidence.find(
      (entry) =>
        entry.source === 'actor' &&
        entry.status === 'missing' &&
        entry.summary.includes('PULSE machine work'),
    ) ?? null
  );
}

function buildStructuralSafetyClassification(
  mp: PulseExecutionMatrixPath,
  safeToExecute: boolean,
  protectedSurface: boolean,
  executionMode: PathCoverageExecutionMode,
): PathCoverageStructuralSafetyClassification {
  const reason = protectedSurface
    ? 'Path references protected governance infrastructure and is retained as inferred coverage.'
    : `Path risk is ${mp.risk}; next probe route is ${executionMode} based on structural risk and entrypoint metadata.`;

  return {
    risk: mp.risk,
    safeToExecute,
    executionMode,
    protectedSurface,
    reason,
  };
}

function buildTerminalProof(
  mp: PulseExecutionMatrixPath,
  classification: PathClassification,
  probeFilePath: string | null,
): PathCoverageTerminalProof {
  if (isObservedPassClass(classification) || isObservedFailClass(classification)) {
    return {
      status: 'observed',
      breakpoint: mp.breakpoint,
      validationCommand: mp.validationCommand,
      reason: 'Path already has observed pass/fail evidence; rerun validation to refresh it.',
    };
  }

  if (isProbeBlueprintClass(classification) && probeFilePath) {
    const machineProofDebt = findSyntheticMachineProofDebt(mp);
    return {
      status: 'blueprint_ready',
      breakpoint: mp.breakpoint,
      validationCommand: `${mp.validationCommand} # execute generated probe blueprint ${probeFilePath}`,
      reason: machineProofDebt
        ? `${machineProofDebt.summary} Generated probe blueprint is actionable proof debt until the scenario is executed or classified.`
        : 'Path has a generated probe blueprint that can produce observed terminal evidence when executed.',
    };
  }

  if (isUnreachableClass(classification) || isNotExecutableClass(classification)) {
    return {
      status: 'terminal_reasoned',
      breakpoint: mp.breakpoint,
      validationCommand: mp.validationCommand,
      reason:
        'Path cannot produce runtime evidence until its breakpoint recovery reconnects it to an executable route, chain, or scenario.',
    };
  }

  if (isInferredOnlyClass(classification) && hasPreciseBreakpoint(mp)) {
    return {
      status: 'terminal_reasoned',
      breakpoint: mp.breakpoint,
      validationCommand: mp.validationCommand,
      reason:
        'Path remains inferred, but the matrix provides a precise terminal breakpoint and recovery target.',
    };
  }

  return {
    status: 'inferred_gap',
    breakpoint: mp.breakpoint,
    validationCommand: mp.validationCommand,
    reason:
      'Path lacks observed evidence and still needs a precise breakpoint or generated probe blueprint.',
  };
}

function hasPreciseBreakpoint(mp: PulseExecutionMatrixPath): boolean {
  const breakpoint = mp.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > deriveZeroValue() && breakpoint.recovery.length > deriveZeroValue();
}

function buildArtifactLinks(
  mp: PulseExecutionMatrixPath,
  probeFilePath: string | null,
): PathCoverageArtifactLink[] {
  const links: PathCoverageArtifactLink[] = [
    {
      artifactPath: `.pulse/current/${_ARTIFACT_NAMES.executionMatrix}`,
      relationship: 'source_matrix',
    },
    {
      artifactPath: `.pulse/current/${_ARTIFACT_NAMES.pathCoverage}`,
      relationship: 'coverage_state',
    },
  ];

  if (probeFilePath) {
    links.push({
      artifactPath: probeFilePath,
      relationship: 'probe_blueprint',
    });
  }

  for (const artifactPath of unique(mp.observedEvidence.map((item) => item.artifactPath))) {
    links.push({
      artifactPath,
      relationship: 'observed_evidence',
    });
  }

  return links;
}

function summarizeObservedEvidence(
  mp: PulseExecutionMatrixPath,
  status: 'passed' | 'failed',
): string | null {
  const evidence = mp.observedEvidence.find((item) =>
    status === 'passed' ? isEvidenceStatusPassed(item.status) : isEvidenceStatusFailed(item.status),
  );
  if (!evidence) {
    return null;
  }
  return `${evidence.source} evidence in ${evidence.artifactPath}: ${evidence.summary}`;
}
