/**
 * Exit criterion evaluator.
 *
 * Evaluates typed ExitCriterion objects programmatically.
 * Replaces string-based exitCriteria with machine-verifiable conditions.
 */
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import type { ExitCriterion } from './autonomy-loop.types';

/**
 * Evaluate a single exit criterion against the repo root.
 * Returns { passed, reason } — callers queue units for removal
 * only when ALL criteria return passed.
 */
export function evaluateExitCriterion(
  rootDir: string,
  criterion: ExitCriterion,
): { passed: boolean; reason: string } {
  switch (criterion.type) {
    case 'command': {
      try {
        execFileSync(criterion.target, [], {
          cwd: rootDir,
          encoding: 'utf8',
          timeout: 300_000,
          stdio: 'pipe',
          shell: true,
        });
        return { passed: true, reason: `Command '${criterion.target}' succeeded.` };
      } catch (err: any) {
        return { passed: false, reason: `Command '${criterion.target}' failed: ${err.message}` };
      }
    }

    case 'artifact-assertion': {
      const filePath = path.resolve(rootDir, criterion.target);
      if (!fs.existsSync(filePath)) {
        return { passed: false, reason: `Artifact '${criterion.target}' not found.` };
      }
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const actual = navigateJson(raw, criterion.target);
        return compareValue(
          actual,
          criterion.expected as Record<string, unknown>,
          criterion.comparison,
        );
      } catch (err: any) {
        return {
          passed: false,
          reason: `Artifact '${criterion.target}' parse error: ${err.message}`,
        };
      }
    }

    case 'flow-passed': {
      const filePath = path.resolve(rootDir, 'PULSE_FLOW_EVIDENCE.json');
      if (!fs.existsSync(filePath)) {
        return { passed: false, reason: 'PULSE_FLOW_EVIDENCE.json not found.' };
      }
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const flows = raw.results || raw.flows || [];
        const targetFlow = flows.find((f: any) => f.flowId === criterion.target);
        if (!targetFlow) {
          return { passed: false, reason: `Flow '${criterion.target}' not found in evidence.` };
        }
        return compareValue(
          targetFlow,
          criterion.expected as Record<string, unknown>,
          criterion.comparison,
        );
      } catch (err: any) {
        return { passed: false, reason: `Flow evidence parse error: ${err.message}` };
      }
    }

    case 'scenario-passed': {
      const filePath = path.resolve(rootDir, 'PULSE_SCENARIO_COVERAGE.json');
      if (!fs.existsSync(filePath)) {
        return { passed: false, reason: 'PULSE_SCENARIO_COVERAGE.json not found.' };
      }
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const scenarios = raw.results || raw.scenarios || [];
        const target = scenarios.find((s: any) => s.scenarioId === criterion.target);
        if (!target) {
          return { passed: false, reason: `Scenario '${criterion.target}' not found in evidence.` };
        }
        return compareValue(
          target,
          criterion.expected as Record<string, unknown>,
          criterion.comparison,
        );
      } catch (err: any) {
        return { passed: false, reason: `Scenario evidence parse error: ${err.message}` };
      }
    }

    case 'score-threshold': {
      const filePath = path.resolve(rootDir, 'PULSE_CERTIFICATE.json');
      if (!fs.existsSync(filePath)) {
        return { passed: false, reason: 'PULSE_CERTIFICATE.json not found.' };
      }
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return compareValue(
          raw,
          criterion.expected as Record<string, unknown>,
          criterion.comparison,
        );
      } catch (err: any) {
        return { passed: false, reason: `Certificate parse error: ${err.message}` };
      }
    }

    default:
      return { passed: false, reason: `Unknown criterion type: ${(criterion as any).type}` };
  }
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
