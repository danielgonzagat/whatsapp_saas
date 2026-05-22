import type { PulseExecutionMatrixPath } from '../types.execution-matrix';
import type {
  PathClassification,
  PathCoverageExecutionMode,
  PathCoverageEntry,
} from '../types.path-coverage-engine';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath as normalizeGovernancePath,
  type GovernanceBoundary,
} from '../scope-state-classify';
import {
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  _ARTIFACT_NAMES,
  isObservedPassClass,
  isObservedFailClass,
  isInferredOnlyClass,
  isProbeBlueprintClass,
  isUnreachableClass,
  isNotExecutableClass,
  isCriticalRiskLevel,
  isHighRiskLevel,
  isGovernedValidationMode,
  isEvidenceStatusPassed,
  isEvidenceStatusFailed,
  isBlockedHumanRequiredMatrixStatus,
  isUntestedMatrixStatus,
  isHumanRequiredExecutionMode,
  isObservationOnlyExecutionMode,
  unique,
} from './kernel-helpers';

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

export function isSafeToExecute(
  mp: PulseExecutionMatrixPath,
  governanceBoundary: GovernanceBoundary = loadGovernanceBoundary(process.cwd()),
): boolean {
  return !isProtectedGovernanceSurface(mp, governanceBoundary);
}

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

export function computeCoveragePercent(paths: PathCoverageEntry[]): number {
  if (paths.length === deriveZeroValue()) {
    return 100;
  }

  const covered = paths.filter(
    (p) => isObservedPassClass(p.classification) || isObservedFailClass(p.classification),
  ).length;

  return Math.min(100, Math.round((covered / paths.length) * 100));
}

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
    hasMapped ||
    Boolean(
      mp.entrypoint.filePath || mp.entrypoint.nodeId || mp.filePaths.length > deriveZeroValue(),
    )
  );
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

export {
  isProtectedGovernanceSurface,
  detectRouteMethod,
  canGenerateProbeBlueprint,
  getEvidenceMode,
  isCriticalRisk,
  isHighOrCriticalRisk,
  normalizeCoverageExecutionMode,
};
