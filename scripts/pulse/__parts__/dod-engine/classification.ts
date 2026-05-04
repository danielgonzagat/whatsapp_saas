import * as fs from 'fs';
import * as path from 'path';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin, resolveRoot } from '../../lib/safe-path';
import type { DoDRiskLevel, DoDGate, DoDOverallStatus } from '../../types.dod-engine';
import type { PulseCapability } from '../../types';
import {
  deriveZeroValue,
  derivePriorityFromObservedContext,
} from '../../dynamic-reality-kernel';

// ── Risk classification rules ──────────────────────────────────────────────

/** Determine risk level from observed structural roles and runtime/gov flags. */
export function determineRiskLevel(cap: PulseCapability): DoDRiskLevel {
  if (cap.runtimeCritical && cap.protectedByGovernance) {
    return 'critical';
  }

  const roles = new Set<string>(cap.rolesPresent ?? []);
  const hasInterface = roles.has('interface') || roles.has('api_surface');
  const hasValidation = roles.has('validation');
  const hasStateMutation = roles.has('persistence');
  const hasExternalEffect = roles.has('side_effect');
  const hasRuntimeEvidence = roles.has('runtime_evidence');
  const hasScenarioCoverage = roles.has('scenario_coverage');
  const hasExposedRoute = containsObservedItems(cap.routePatterns);

  if (
    (cap.runtimeCritical && (hasStateMutation || hasExternalEffect || hasValidation)) ||
    (hasInterface && hasStateMutation && hasExternalEffect) ||
    (hasInterface && hasStateMutation && hasValidation && hasExposedRoute)
  ) {
    return 'critical';
  }

  if (
    cap.runtimeCritical ||
    cap.protectedByGovernance ||
    containsReportedIssue(cap.highSeverityIssueCount) ||
    (hasInterface && hasStateMutation) ||
    (hasInterface && hasExternalEffect) ||
    hasExposedRoute
  ) {
    return 'high';
  }

  if (
    cap.userFacing ||
    hasInterface ||
    roles.has('orchestration') ||
    hasRuntimeEvidence ||
    hasScenarioCoverage
  ) {
    return 'medium';
  }

  return 'low';
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function containsObservedItems(items: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(items) && items.length > zero();
}

export function containsReportedIssue(value: number | null | undefined): boolean {
  return typeof value === 'number' && value > zero();
}

export function lineNumberFromIndex(index: number): number {
  return index + Number(Number.isInteger(index));
}

export function zero(): number {
  return deriveZeroValue();
}

export const ELEVATED_PRIORITIES = new Set(['P0', 'P1']);

export function isElevatedLevel(riskLevel: DoDRiskLevel): boolean {
  const p = derivePriorityFromObservedContext(riskLevel, false, riskLevel === 'critical');
  return ELEVATED_PRIORITIES.has(p);
}

export function allowsBlockingOutcome(riskLevel: DoDRiskLevel): boolean {
  const p = derivePriorityFromObservedContext(riskLevel, false, riskLevel === 'critical');
  return p !== 'P3' && p !== 'P2';
}

export function isApplicableRequirement(mode: 'required' | 'optional' | 'not_required'): boolean {
  return mode !== 'not_required';
}

export function isEmptyCollection(value: { length: number }): boolean {
  return value.length === zero();
}

export function isEmptyTotal(value: number): boolean {
  return value === zero();
}

export function isPassed(gate: DoDGate): boolean {
  return gate.status === 'pass';
}

export function isFailed(gate: DoDGate): boolean {
  return gate.status === 'fail';
}

export function isDoneStatus(status: DoDOverallStatus): boolean {
  return status === 'done';
}

export function isPartialStatus(status: DoDOverallStatus): boolean {
  return status === 'partial';
}

export function isBlockedStatus(status: DoDOverallStatus): boolean {
  return status === 'blocked';
}

export function isInferredTruthMode(truthMode: string): boolean {
  return truthMode === 'inferred';
}

export function certaintyFromStatus(status: DoDOverallStatus): number {
  const completeWeight = Number(Boolean(status));
  const partialWeight = 'partial'.length;
  const blockedWeight = 'done'.length - completeWeight;
  const denominator = partialWeight + blockedWeight;

  if (isDoneStatus(status)) {
    return completeWeight;
  }
  if (isPartialStatus(status)) {
    return partialWeight / denominator;
  }
  if (isBlockedStatus(status)) {
    return blockedWeight / denominator;
  }
  return Number(!status);
}

export function sumNumbers(values: number[]): number {
  return values.reduce((sum, value) => sum + value, zero());
}

export function scanFilesForPattern(
  filePaths: string[],
  rootDir: string,
  kernelGrammar: RegExp,
): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const relPath of filePaths) {
    const absPath = safeJoin(resolveRoot(rootDir), relPath);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const content = readTextFile(absPath);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (kernelGrammar.test(lines[i])) {
          matches.push(`${relPath}:${lineNumberFromIndex(i)}`);
        }
      }
    } catch {
      continue;
    }
  }
  return { found: matches.length > 0, matches };
}

export function testFilesExist(filePaths: string[], rootDir: string): { found: boolean; files: string[] } {
  const testPatterns = [/\.spec\.tsx?$/, /\.spec\.jsx?$/, /\.test\.tsx?$/, /\.test\.jsx?$/];
  const dirPatterns = ['__tests__', 'tests', 'test'];
  const sourceDirs = new Set<string>();
  const found: string[] = [];

  for (const relPath of filePaths) {
    const dir = path.dirname(relPath);
    sourceDirs.add(dir);
  }

  for (const dir of sourceDirs) {
    const absPath = safeJoin(resolveRoot(rootDir), dir);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const entries = fs.readdirSync(absPath);
      for (const entry of entries) {
        if (testPatterns.some((p) => p.test(entry))) {
          found.push(`${dir}/${entry}`);
        }
      }
    } catch {
      continue;
    }
  }

  for (const sourceDir of sourceDirs) {
    for (const dp of dirPatterns) {
      const testDir = safeJoin(resolveRoot(rootDir), sourceDir, dp);
      if (pathExists(testDir)) {
        try {
          const entries = fs.readdirSync(testDir);
          for (const entry of entries) {
            if (testPatterns.some((p) => p.test(entry))) {
              found.push(`${sourceDir}/${dp}/${entry}`);
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  return { found: found.length > 0, files: [...new Set(found)].sort() };
}
