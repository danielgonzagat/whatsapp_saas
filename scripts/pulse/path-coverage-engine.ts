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
} from './types.path-coverage-engine';
import { readJsonFile, writeTextFile, ensureDir, pathExists } from './safe-fs';
import { safeJoin } from './safe-path';

// ── Constants ──────────────────────────────────────────────────────────────────

const GOVERNANCE_PATTERNS = [
  /\.github/i,
  /ops\//i,
  /scripts\/ops\//i,
  /governance/i,
  /protected/i,
  /env\./i,
];

const INACCESSIBLE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'coverage', '.pulse']);

// ── Helpers ────────────────────────────────────────────────────────────────────

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value));
}

function isInaccessible(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  return segments.some((seg) => INACCESSIBLE_DIRS.has(seg));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Build the full path coverage state from the execution matrix. */
export function buildPathCoverageState(
  rootDir: string,
  matrixOverride?: PulseExecutionMatrix,
): PathCoverageState {
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_MATRIX.json');

  let matrixPaths: PulseExecutionMatrixPath[] = matrixOverride?.paths ?? [];
  if (!matrixOverride && pathExists(matrixPath)) {
    const matrix = readJsonFile<PulseExecutionMatrix>(matrixPath);
    matrixPaths = matrix.paths ?? [];
  }

  const entries: PathCoverageEntry[] = matrixPaths.map((mp) => {
    const safe = isSafeToExecute(mp);
    const protectedSurface = isProtectedGovernanceSurface(mp);
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
      coveragePercent,
    },
    paths: entries,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(safeJoin(outputDir, 'PULSE_PATH_COVERAGE.json'), JSON.stringify(state, null, 2));

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
export function isSafeToExecute(mp: PulseExecutionMatrixPath): boolean {
  return !isProtectedGovernanceSurface(mp);
}

/** Determine whether a path maps to protected governance or inaccessible surfaces. */
function isProtectedGovernanceSurface(mp: PulseExecutionMatrixPath): boolean {
  const allFilePaths = unique([
    ...mp.filePaths,
    ...(mp.entrypoint.filePath ? [mp.entrypoint.filePath] : []),
  ]);

  for (const filePath of allFilePaths) {
    if (isInaccessible(filePath)) {
      continue;
    }

    if (includesAny(filePath, GOVERNANCE_PATTERNS)) {
      return true;
    }
  }

  return false;
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
  if (mp.routePatterns.length > 0) {
    return true;
  }

  if (!isHighOrCriticalRisk(mp.risk)) {
    return false;
  }

  return (
    hasMapped || Boolean(mp.entrypoint.filePath || mp.entrypoint.nodeId || mp.filePaths.length > 0)
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
      validationRequired: [
        'runtime_harness_executes_blueprint',
        'response_contract_verified',
        'side_effects_verified_when_declared',
      ],
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
  if (classification === 'observed_pass' || classification === 'observed_fail') {
    return 'observed';
  }
  if (classification === 'probe_blueprint_generated') {
    return 'blueprint';
  }
  return 'inferred';
}

function isCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return risk === 'critical';
}

function isHighOrCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return risk === 'high' || risk === 'critical';
}

function normalizeCoverageExecutionMode(
  mode: PulseExecutionMatrixPath['executionMode'],
  risk: PathCoverageEntry['risk'],
): PathCoverageExecutionMode {
  if (mode === 'governed_validation') {
    return 'governed_validation';
  }
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'governed_validation';
  }
  return isHighOrCriticalRisk(risk) ? 'governed_validation' : 'ai_safe';
}

function buildTerminalReason(
  mp: PulseExecutionMatrixPath,
  classification: PathClassification,
  safeToExecute: boolean,
): string {
  if (classification === 'observed_pass') {
    return summarizeObservedEvidence(mp, 'passed') ?? 'Path has passing observed runtime evidence.';
  }
  if (classification === 'observed_fail') {
    return summarizeObservedEvidence(mp, 'failed') ?? 'Path has failing observed runtime evidence.';
  }
  if (classification === 'unreachable') {
    return mp.breakpoint?.reason ?? 'Path is unreachable from the discovered execution graph.';
  }
  if (classification === 'not_executable') {
    return mp.breakpoint?.reason ?? 'Path is classified as non-executable inventory.';
  }
  if (classification === 'probe_blueprint_generated') {
    const mode = normalizeCoverageExecutionMode(mp.executionMode, mp.risk);
    const routeOrEntry = mp.routePatterns[0] ?? mp.entrypoint.filePath ?? mp.entrypoint.nodeId;
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
    return expected;
  }

  return [
    ...expected,
    {
      kind: 'runtime',
      required: true,
      reason:
        'Generated probe blueprint must execute and publish pass/fail evidence before this path can count as observed.',
    },
  ];
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

function buildArtifactLinks(
  mp: PulseExecutionMatrixPath,
  probeFilePath: string | null,
): PathCoverageArtifactLink[] {
  const links: PathCoverageArtifactLink[] = [
    {
      artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json',
      relationship: 'source_matrix',
    },
    {
      artifactPath: '.pulse/current/PULSE_PATH_COVERAGE.json',
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
  const evidence = mp.observedEvidence.find((item) => item.status === status);
  if (!evidence) {
    return null;
  }
  return `${evidence.source} evidence in ${evidence.artifactPath}: ${evidence.summary}`;
}
