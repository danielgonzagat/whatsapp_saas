// TODO(phase-8): Wire DefinitionOfDoneEngine into capability status computation.
// For each capability emitted by buildCapabilityState, call evaluateDone() from
// './definition-of-done' using the capability's structural role evidence and
// Codacy high count to drive the final CapabilityStatus ('real'/'partial'/'latent'/'phantom').
// See: scripts/pulse/definition-of-done.ts and scripts/pulse/__tests__/definition-of-done.spec.ts

import type {
  PulseCapability,
  PulseCapabilityState,
  PulseCodacyEvidence,
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralRole,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
} from './structural-family';
import { buildObservationFootprint, footprintMatchesFamilies } from './execution-observation';
import { hasApiCalls, shouldSkipUiSeed } from './capability-ui-seeds';
import {
  buildFallbackGroups,
  buildSeedGroups,
  type CapabilitySeedGroup,
} from './capability-seed-groups';

interface BuildCapabilityStateInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

import {
  buildCapabilityMaturity,
  chooseDominantLabel,
  chooseTruthMode,
  capabilityCompletenessScore,
  confidenceFromCapabilityEvidence,
  getNodeFamilies,
  getNodeRoutePatterns,
  getPrimaryFamily,
  graphTraversalDepthLimit,
  inferStatus,
  missingProductionRoles,
  pickExecutionMode,
  pickOwnerLane,
  reachableRoutePatternLimit,
  shouldTraverseNeighbor,
  unique,
} from './capability-model-helpers';
import type { PulseCapabilityDoD } from './types.capabilities';
import { evaluateDone } from './definition-of-done';
import {
  CAPABILITY_REQUIRED_DOD_ROLES,
  buildCapabilityDoDEvidence,
  toDoDStatus,
} from './capability-model.dod';
import { mergeExistingCapability } from './capability-model.merge';

// DoD helpers (`buildCapabilityDoDEvidence`, `toDoDStatus`) and the
// `CAPABILITY_REQUIRED_DOD_ROLES` constant were extracted into
// `./capability-model.dod` so this file stays under the 600-line
// touched-file architecture cap. Their behaviour is unchanged.

type PulseScenarioResultItem = NonNullable<PulseExecutionEvidence['customer']>['results'][number];

function hasScenarioResults(value: unknown): value is { results: PulseScenarioResultItem[] } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'results' in value &&
    Array.isArray(value.results)
  );
}

function collectScenarioResults(
  executionEvidence: Partial<PulseExecutionEvidence> | undefined,
): PulseScenarioResultItem[] {
  if (!executionEvidence) {
    return [];
  }

  return Object.values(executionEvidence).flatMap((evidenceBlock) =>
    hasScenarioResults(evidenceBlock) ? evidenceBlock.results : [],
  );
}

function sameToken(left: string | null | undefined, right: string): boolean {
  return left === right;
}

function roleBlocksTraversal(role: PulseStructuralRole): boolean {
  return ['persistence', 'side_effect', 'simulation'].includes(role);
}

function roleContributesRouteEvidence(role: PulseStructuralRole): boolean {
  return !['persistence', 'side_effect'].includes(role);
}

function nodeKindExposesInterface(kind: string): boolean {
  return ['api_call', 'proxy_route', 'backend_route'].includes(kind);
}

function isObservedFailedStatus(status: string | undefined): boolean {
  return sameToken(status, 'failed');
}

function statusIs(status: string | undefined, expected: string): boolean {
  return sameToken(status, expected);
}

function maturityStageIs(stage: string | undefined, expected: string): boolean {
  return sameToken(stage, expected);
}

function nonzero(value: number): boolean {
  return value > 0;
}

function fallbackNumber(value: number | undefined): number {
  return value ?? 0;
}

function zero(): number {
  return Number(false);
}

function countCapabilityStatus(
  capabilities: PulseCapability[],
  status: PulseCapability['status'],
): number {
  return capabilities.filter((item) => statusIs(item.status, status)).length;
}

function countMaturityStage(
  capabilities: PulseCapability[],
  stage: PulseCapability['maturity']['stage'],
): number {
  return capabilities.filter((item) => maturityStageIs(item.maturity.stage, stage)).length;
}

function countHumanRequiredCapabilities(capabilities: PulseCapability[]): number {
  return capabilities.filter(
    (item) =>
      sameToken(item.executionMode, 'human_required') ||
      sameToken(item.executionMode, 'observation_only'),
  ).length;
}
