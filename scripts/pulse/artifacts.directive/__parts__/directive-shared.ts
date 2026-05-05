/**
 * Directive shared helpers — internal constants, normalizers, and builders
 * reused across multiple directive parts. NOT re-exported from the shim.
 */
import { safeJoin } from '../../safe-path';
import { readOptionalJson } from '../../artifacts.io';
import { normalizeArtifactStatus, normalizeArtifactExecutionMode } from '../../artifacts.queue';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type { QueueUnit } from '../../artifacts.queue';

export const CURRENT_PULSE_ARTIFACT_DIR = '.pulse/current';
export const OBSERVED_ARTIFACT_FILENAMES = discoverAllObservedArtifactFilenames();

export type DirectiveExecutionMatrixPath = object & {
  status: string;
  executionMode: string;
};
export type DirectiveExecutionMatrixSummary = object & {
  byStatus: Record<string, number>;
};
export type DirectiveExternalSignalSummary = object;

export type PulseMachineDirectiveUnit = Record<string, string | number | boolean | string[] | null>;

export type MachineProofRegistryEvidence = {
  authority: 'artifact_registry' | 'registry_gap';
  artifactPaths: string[];
  relatedFiles: string[];
  proofBasis: string[];
};

export function readCurrentPulseArtifact<T>(artifactName: string): T | null {
  return readOptionalJson<T>(safeJoin(process.cwd(), CURRENT_PULSE_ARTIFACT_DIR, artifactName));
}

export function artifactJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'string' ? normalizeArtifactStatus(value) : value;
}

export function normalizeMatrixStatusForDirective(status: string): string {
  return normalizeArtifactStatus(status);
}

export function normalizeExecutionMatrixSummaryForDirective(
  summary: DirectiveExecutionMatrixSummary,
): Record<string, unknown> {
  const byStatusEntries = Object.entries(summary.byStatus).map(([status, count]) => [
    normalizeMatrixStatusForDirective(status),
    count,
  ]);
  return {
    ...summary,
    byStatus: Object.fromEntries(byStatusEntries),
    observationOnly: (summary as Record<string, unknown>).blockedHumanRequired,
    blockedHumanRequired: undefined,
  };
}

export function normalizeExecutionMatrixPathForDirective(
  path: DirectiveExecutionMatrixPath,
): Record<string, unknown> {
  return {
    ...path,
    status: normalizeMatrixStatusForDirective(path.status as string),
    executionMode: normalizeArtifactExecutionMode(path.executionMode as QueueUnit['executionMode']),
  };
}

export function normalizeExternalSignalSummaryForDirective(
  summary: DirectiveExternalSignalSummary,
): Record<string, unknown> {
  return {
    ...summary,
    observationOnlySignals: (summary as Record<string, unknown>).humanRequiredSignals,
    humanRequiredSignals: undefined,
  };
}

export function buildDefaultExitCriteria(unit: QueueUnit): string[] {
  const kind = unit.kind;
  if (kind === 'capability') {
    return [
      JSON.stringify({
        id: `${unit.id}-exit-0`,
        type: 'artifact-assertion',
        target: OBSERVED_ARTIFACT_FILENAMES.certificate,
        expected: { score: 66 },
        comparison: 'gte',
      }),
    ];
  }
  if (kind === 'scenario') {
    return [
      JSON.stringify({
        id: `${unit.id}-exit-0`,
        type: 'scenario-passed',
        target:
          Array.isArray(unit.scenarioIds) && unit.scenarioIds.length > 0
            ? unit.scenarioIds[0]
            : unit.id.replace(/^recover-/, ''),
        expected: { status: 'passed' },
        comparison: 'eq',
      }),
    ];
  }
  return [];
}
