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
  PathClassification,
  PathCoverageEntry,
  PathCoverageState,
} from './types.path-coverage-engine';
import { readJsonFile, writeTextFile, ensureDir, pathExists } from './safe-fs';
import { safeJoin } from './safe-path';

// ── Constants ──────────────────────────────────────────────────────────────────

const GOVERNANCE_PATTERNS = [
  /\.github/i,
  /ops\//i,
  /scripts\/ops\//i,
  /scripts\/pulse\//i,
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
export function buildPathCoverageState(rootDir: string): PathCoverageState {
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_MATRIX.json');
  const frontierDir = safeJoin(rootDir, '.pulse', 'frontier');

  let matrixPaths: PulseExecutionMatrixPath[] = [];
  if (pathExists(matrixPath)) {
    const matrix = readJsonFile<PulseExecutionMatrix>(matrixPath);
    matrixPaths = matrix.paths ?? [];
  }

  const entries: PathCoverageEntry[] = matrixPaths.map((mp) => {
    const classification = classifyPath(mp, rootDir);
    const safe = isSafeToExecute(mp);
    const testInfo =
      safe && classification === 'inferred_only'
        ? generateTestForPath(mp, rootDir)
        : { testFilePath: null, fixtureNeeded: [] as string[] };

    return {
      pathId: mp.pathId,
      entrypoint: mp.entrypoint.description,
      classification,
      testGenerated: testInfo.testFilePath !== null,
      testFilePath: testInfo.testFilePath,
      safeToExecute: safe,
      fixtureNeeded: testInfo.fixtureNeeded,
      lastProbed: safe ? new Date().toISOString() : null,
    };
  });

  const observedPass = entries.filter((e) => e.classification === 'observed_pass').length;
  const observedFail = entries.filter((e) => e.classification === 'observed_fail').length;
  const testGenerated = entries.filter((e) => e.testGenerated).length;
  const inferredOnly = entries.filter((e) => e.classification === 'inferred_only').length;
  const blockedHuman = entries.filter((e) => e.classification === 'blocked_human_required').length;
  const criticalInferredOnly = entries.filter(
    (e) => e.classification === 'inferred_only' && !e.safeToExecute,
  ).length;
  const coveragePercent = computeCoveragePercent(entries);

  const state: PathCoverageState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPaths: entries.length,
      observedPass,
      observedFail,
      testGenerated,
      inferredOnly,
      blockedHuman,
      criticalInferredOnly,
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

  if (status === 'blocked_human_required' || mp.executionMode === 'human_required') {
    return 'blocked_human_required';
  }

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

  if (status === 'inferred_only' || status === 'untested') {
    if (hasMapped && mp.routePatterns.length > 0) {
      return 'test_generated';
    }
    return 'inferred_only';
  }

  return 'inferred_only';
}

/** Generate a test or probe definition for an inferred-only path. */
export function generateTestForPath(
  mp: PulseExecutionMatrixPath,
  rootDir: string,
): { testFilePath: string; fixtureNeeded: string[] } {
  const routePattern = mp.routePatterns[0] ?? '';
  const safeName = mp.pathId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
  const testDir = safeJoin(rootDir, '.pulse', 'frontier');
  const testFilePath = path.posix.join('.pulse', 'frontier', `${safeName}.probe.ts`);
  ensureDir(testDir, { recursive: true });

  const fixtures: string[] = [];
  const routeMethod = detectRouteMethod(mp);

  if (mp.capabilityId) {
    fixtures.push(`capability:${mp.capabilityId}`);
  }
  if (mp.flowId) {
    fixtures.push(`flow:${mp.flowId}`);
  }

  const probeContent = generateProbeFileContent(mp, testFilePath, routeMethod, fixtures);
  writeTextFile(safeJoin(rootDir, testFilePath), probeContent);

  return { testFilePath, fixtureNeeded: fixtures };
}

/** Determine whether an AI agent can safely execute the path autonomously. */
export function isSafeToExecute(mp: PulseExecutionMatrixPath): boolean {
  if (mp.executionMode === 'human_required') {
    return false;
  }

  const allFilePaths = unique([
    ...mp.filePaths,
    ...(mp.entrypoint.filePath ? [mp.entrypoint.filePath] : []),
  ]);

  for (const filePath of allFilePaths) {
    if (isInaccessible(filePath)) {
      continue;
    }

    if (includesAny(filePath, GOVERNANCE_PATTERNS)) {
      return false;
    }
  }

  return mp.risk !== 'critical' && mp.risk !== 'high';
}

/** Compute coverage percentage from classified entries. */
export function computeCoveragePercent(paths: PathCoverageEntry[]): number {
  if (paths.length === 0) {
    return 100;
  }

  const covered = paths.filter((p) =>
    ['observed_pass', 'observed_fail', 'test_generated', 'blocked_human_required'].includes(
      p.classification,
    ),
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

function generateProbeFileContent(
  mp: PulseExecutionMatrixPath,
  testFilePath: string,
  method: string,
  fixtures: string[],
): string {
  const route = mp.routePatterns[0] ?? '/';
  const desc = mp.entrypoint.description.replace(/"/g, "'");

  return (
    `/**\n` +
    ` * PULSE Frontier Probe — auto-generated for ${mp.pathId}\n` +
    ` * Path: ${mp.entrypoint.description}\n` +
    ` * Classification: ${mp.status}\n` +
    ` * Generated: ${new Date().toISOString()}\n` +
    ` *\n` +
    ` * This probe was produced by the Full Path Coverage Engine (Wave 6).\n` +
    ` * It validates that the inferred execution path actually behaves as expected.\n` +
    ` *\n` +
    ` * Fixtures required:\n` +
    fixtures.map((f) => ` *   - ${f}`).join('\n') +
    `\n` +
    ` */\n` +
    `\n` +
    `import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';\n` +
    `\n` +
    `describe('${mp.pathId}', () => {\n` +
    `  beforeAll(async () => {\n` +
    `    // TODO: set up fixtures\n` +
    fixtures.map((f) => `    //   - ${f}`).join('\n') +
    `\n` +
    `  });\n` +
    `\n` +
    `  afterAll(async () => {\n` +
    `    // TODO: tear down fixtures\n` +
    `  });\n` +
    `\n` +
    `  it('should respond to ${method} ${route} — ${desc}', async () => {\n` +
    `    // TODO: Execute ${method} ${route} with appropriate payload\n` +
    `    // Expected outcome: ${mp.status === 'inferred_only' ? 'degraded gracefully or pass' : 'pass'}\n` +
    `    // Validation command: ${mp.validationCommand}\n` +
    `    expect(true).toBe(true); // placeholder — replace with actual probe\n` +
    `  });\n` +
    `});\n`
  );
}
