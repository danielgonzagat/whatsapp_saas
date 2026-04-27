/**
 * Exit criterion evaluator.
 *
 * Evaluates typed ExitCriterion objects programmatically.
 * Replaces string-based exitCriteria with machine-verifiable conditions.
 */
import { execFileSync } from 'child_process';
import type { ExitCriterion } from './autonomy-loop.types';
import { pathExists, readJsonFile } from './safe-fs';
import { safeResolveSegment } from './lib/safe-path';

type CriterionResult = { passed: boolean; reason: string };

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function evaluateCommand(rootDir: string, criterion: ExitCriterion): CriterionResult {
  try {
    execFileSync(criterion.target, [], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 300_000,
      stdio: 'pipe',
      shell: true,
    });
    return { passed: true, reason: `Command '${criterion.target}' succeeded.` };
  } catch (err: unknown) {
    return {
      passed: false,
      reason: `Command '${criterion.target}' failed: ${describeError(err)}`,
    };
  }
}

function loadJsonArtifact(
  rootDir: string,
  fileName: string,
): { data?: Record<string, unknown>; error?: string } {
  const filePath = safeResolveSegment(rootDir, fileName);
  if (!pathExists(filePath)) {
    return { error: `${fileName} not found.` };
  }
  try {
    return { data: readJsonFile<Record<string, unknown>>(filePath) };
  } catch (err: unknown) {
    return { error: `${fileName} parse error: ${describeError(err)}` };
  }
}

function evaluateArtifactAssertion(rootDir: string, criterion: ExitCriterion): CriterionResult {
  const result = loadJsonArtifact(rootDir, criterion.target);
  if (result.error || !result.data) {
    return { passed: false, reason: result.error ?? 'unknown' };
  }
  const actual = navigateJson(result.data, criterion.target);
  return compareValue(actual, criterion.expected as Record<string, unknown>, criterion.comparison);
}

function evaluateFlowPassed(rootDir: string, criterion: ExitCriterion): CriterionResult {
  const result = loadJsonArtifact(rootDir, 'PULSE_FLOW_EVIDENCE.json');
  if (result.error || !result.data) {
    return { passed: false, reason: result.error ?? 'unknown' };
  }
  const flows = (result.data.results || result.data.flows || []) as Array<{ flowId?: string }>;
  const targetFlow = flows.find((f) => f.flowId === criterion.target);
  if (!targetFlow) {
    return { passed: false, reason: `Flow '${criterion.target}' not found in evidence.` };
  }
  return compareValue(
    targetFlow,
    criterion.expected as Record<string, unknown>,
    criterion.comparison,
  );
}

function evaluateScenarioPassed(rootDir: string, criterion: ExitCriterion): CriterionResult {
  const result = loadJsonArtifact(rootDir, 'PULSE_SCENARIO_COVERAGE.json');
  if (result.error || !result.data) {
    return { passed: false, reason: result.error ?? 'unknown' };
  }
  const scenarios = (result.data.results || result.data.scenarios || []) as Array<{
    scenarioId?: string;
  }>;
  const target = scenarios.find((s) => s.scenarioId === criterion.target);
  if (!target) {
    return { passed: false, reason: `Scenario '${criterion.target}' not found in evidence.` };
  }
  return compareValue(target, criterion.expected as Record<string, unknown>, criterion.comparison);
}

function evaluateScoreThreshold(rootDir: string, criterion: ExitCriterion): CriterionResult {
  const result = loadJsonArtifact(rootDir, 'PULSE_CERTIFICATE.json');
  if (result.error || !result.data) {
    return { passed: false, reason: result.error ?? 'unknown' };
  }
  return compareValue(
    result.data,
    criterion.expected as Record<string, unknown>,
    criterion.comparison,
  );
}

const CRITERION_HANDLERS: Record<
  ExitCriterion['type'],
  (rootDir: string, criterion: ExitCriterion) => CriterionResult
> = {
  command: evaluateCommand,
  'artifact-assertion': evaluateArtifactAssertion,
  'flow-passed': evaluateFlowPassed,
  'scenario-passed': evaluateScenarioPassed,
  'score-threshold': evaluateScoreThreshold,
};

/**
 * Evaluate a single exit criterion against the repo root.
 * Returns { passed, reason } — callers queue units for removal
 * only when ALL criteria return passed.
 */
export function evaluateExitCriterion(rootDir: string, criterion: ExitCriterion): CriterionResult {
  const handler = CRITERION_HANDLERS[criterion.type];
  if (!handler) {
    return {
      passed: false,
      reason: `Unknown criterion type: ${(criterion as { type?: string }).type}`,
    };
  }
  return handler(rootDir, criterion);
}

function navigateJson(obj: unknown, _target: string): unknown {
  return obj;
}

function compareValue(
  actual: unknown,
  expected: Record<string, unknown>,
  comparison: ExitCriterion['comparison'],
): { passed: boolean; reason: string } {
  const actualRecord = (actual ?? {}) as Record<string, unknown>;

  for (const [key, expectedVal] of Object.entries(expected)) {
    const actualVal = actualRecord[key];

    switch (comparison) {
      case 'eq':
        if (JSON.stringify(actualVal) !== JSON.stringify(expectedVal)) {
          return {
            passed: false,
            reason: `${key}: expected '${JSON.stringify(expectedVal)}', got '${JSON.stringify(actualVal)}'.`,
          };
        }
        break;
      case 'gte':
        if (
          typeof actualVal !== 'number' ||
          typeof expectedVal !== 'number' ||
          actualVal < expectedVal
        ) {
          return { passed: false, reason: `${key}: expected >= ${expectedVal}, got ${actualVal}.` };
        }
        break;
      case 'lte':
        if (
          typeof actualVal !== 'number' ||
          typeof expectedVal !== 'number' ||
          actualVal > expectedVal
        ) {
          return { passed: false, reason: `${key}: expected <= ${expectedVal}, got ${actualVal}.` };
        }
        break;
      case 'contains':
        if (typeof actualVal !== 'string' || !(actualVal as string).includes(String(expectedVal))) {
          return {
            passed: false,
            reason: `${key}: expected to contain '${expectedVal}', got '${actualVal}'.`,
          };
        }
        break;
      case 'exists':
        if (actualVal === undefined || actualVal === null) {
          return { passed: false, reason: `${key}: expected to exist but was ${actualVal}.` };
        }
        break;
    }
  }

  return { passed: true, reason: 'All expected values matched.' };
}
