import type { PulseCapability } from '../types.capabilities/03-capability';
import type {
  PulseCodacyEvidence,
  PulseStructuralGraph,
  PulseStructuralRole,
} from '../types.structural';
import type { PulseExecutionEvidence } from '../types.evidence';
import type { PulseResolvedManifest } from '../types.resolved-manifest';
import type { PulseScopeState } from '../types.truth.scope';

export interface BuildCapabilityStateInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

export type PulseScenarioResultItem = NonNullable<
  PulseExecutionEvidence['customer']
>['results'][number];

export function hasScenarioResults(
  value: unknown,
): value is { results: PulseScenarioResultItem[] } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    value !== null &&
    'results' in value &&
    Array.isArray(value.results)
  );
}

export function collectScenarioResults(
  executionEvidence: Partial<PulseExecutionEvidence> | undefined,
): PulseScenarioResultItem[] {
  if (!executionEvidence) {
    return [];
  }

  return Object.values(executionEvidence).flatMap((evidenceBlock) =>
    hasScenarioResults(evidenceBlock) ? evidenceBlock.results : [],
  );
}

export function sameToken(left: string | null | undefined, right: string): boolean {
  return left === right;
}

export function roleBlocksTraversal(role: PulseStructuralRole): boolean {
  return ['persistence', 'side_effect', 'simulation'].includes(role);
}

export function roleContributesRouteEvidence(role: PulseStructuralRole): boolean {
  return !['persistence', 'side_effect'].includes(role);
}

export function nodeKindExposesInterface(kind: string): boolean {
  return ['api_call', 'proxy_route', 'backend_route'].includes(kind);
}

export function isObservedFailedStatus(status: string | undefined): boolean {
  return sameToken(status, 'failed');
}

export function statusIs(status: string | undefined, expected: string): boolean {
  return sameToken(status, expected);
}

export function maturityStageIs(stage: string | undefined, expected: string): boolean {
  return sameToken(stage, expected);
}

export function countCapabilityStatus(
  capabilities: PulseCapability[],
  status: PulseCapability['status'],
): number {
  return capabilities.filter((item) => statusIs(item.status, status)).length;
}

export function countMaturityStage(
  capabilities: PulseCapability[],
  stage: PulseCapability['maturity']['stage'],
): number {
  return capabilities.filter((item) => maturityStageIs(item.maturity.stage, stage)).length;
}

export function countHumanRequiredCapabilities(capabilities: PulseCapability[]): number {
  return capabilities.filter(
    (item) =>
      sameToken(item.executionMode, 'human_required') ||
      sameToken(item.executionMode, 'observation_only'),
  ).length;
}
