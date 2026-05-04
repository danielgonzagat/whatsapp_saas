import type {
  PulseCapability,
  PulseCapabilityStatus,
  PulseFlowProjectionItem,
  PulseFlowProjectionStatus,
} from '../../types';
import {
  zero,
  hasCount,
  hasItems,
  leadingSpan,
  observedAverage,
  stateWeight,
  strongestState,
  unique,
} from './math-utils';
import type { BuildProductVisionInput } from './types';

export function buildSurfaceBlockers(
  unitHits: PulseCapability[],
  runHits: PulseFlowProjectionItem[],
  entry: BuildProductVisionInput['resolvedManifest']['modules'][number],
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): string[] {
  const capBest = strongestState(capSeq);
  const flowBest = strongestState(flowSeq);

  return unique([
    ...unitHits
      .filter(
        (capability) =>
          capability.status !== capBest || hasCount(capability.highSeverityIssueCount),
      )
      .map(
        (capability) =>
          capability.blockingReasons[0] || `${capability.name} remains ${capability.status}.`,
      ),
    ...runHits
      .filter((flow) => flow.status !== flowBest)
      .map((flow) => flow.blockingReasons[0] || `${flow.name} remains ${flow.status}.`),
    entry.coverageStatus === 'declared_only'
      ? `${entry.name} is declared in the promise model but has no discovered implementation yet.`
      : '',
  ])
    .filter(Boolean)
    .slice(zero(), leadingSpan(unitHits.length, runHits.length, entry.routeRoots.length));
}

export function buildCapabilityCompletion(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): number {
  const weights = [
    ...capabilities.map((capability) => stateWeight(capability.status, capSeq)),
    ...flows.map((flow) => stateWeight(flow.status, flowSeq)),
  ];
  return observedAverage(weights);
}
