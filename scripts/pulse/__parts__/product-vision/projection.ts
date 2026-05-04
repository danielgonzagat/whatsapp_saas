import type {
  PulseCapability,
  PulseCapabilityStatus,
  PulseFlowProjectionItem,
  PulseFlowProjectionStatus,
  PulseTruthMode,
} from '../../types';
import {
  zero,
  one,
  hasCount,
  hasItems,
  observedAverage,
  observedHead,
  observedMiddle,
  observedSecond,
  quotient,
  stateWeight,
  strongestState,
  unique,
  weakestState,
} from './math-utils';

export function projectionBand(
  unitRatio: number,
  runRatio: number,
  highIssues: number,
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): 'red' | 'yellow' | 'green' {
  const capGreen = quotient(
    stateWeight(observedHead(capSeq) ?? capSeq[zero()], capSeq) +
      stateWeight(observedSecond(capSeq) ?? observedHead(capSeq) ?? capSeq[zero()], capSeq),
    one() + one(),
  );
  const flowGreen = quotient(
    stateWeight(observedHead(flowSeq) ?? flowSeq[zero()], flowSeq) +
      stateWeight(observedSecond(flowSeq) ?? observedHead(flowSeq) ?? flowSeq[zero()], flowSeq),
    one() + one(),
  );
  const capYellow = stateWeight(
    observedMiddle(capSeq) ?? observedHead(capSeq) ?? capSeq[zero()],
    capSeq,
  );
  const flowYellow = stateWeight(
    observedMiddle(flowSeq) ?? observedHead(flowSeq) ?? flowSeq[zero()],
    flowSeq,
  );

  if (unitRatio >= capGreen && runRatio >= flowGreen && !hasCount(highIssues)) {
    return 'green';
  }
  if (unitRatio >= capYellow || runRatio >= flowYellow) {
    return 'yellow';
  }
  return 'red';
}

export function chooseTruthMode(modes: PulseTruthMode[]): PulseTruthMode {
  if (modes.includes('observed')) {
    return 'observed';
  }
  if (modes.includes('inferred')) {
    return 'inferred';
  }
  return 'aspirational';
}

export function summarizeEvidenceBasis(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
): { observed: number; inferred: number; projected: number } {
  const counts = {
    observed: 0,
    inferred: 0,
    projected: 0,
  };

  for (const item of [...capabilities, ...flows]) {
    counts[item.truthMode] += 1;
  }

  return counts;
}

export function bestStatus(
  capStates: PulseCapabilityStatus[],
  flowStates: PulseFlowProjectionStatus[],
  capSeq: PulseCapabilityStatus[],
): PulseCapabilityStatus {
  const all = [...capStates, ...flowStates];
  if (all.length === 0) {
    return weakestState(capSeq) ?? 'phantom';
  }

  const ranked = unique(all)
    .map((status) => ({
      status: status as PulseCapabilityStatus,
      index: capSeq.indexOf(status as PulseCapabilityStatus),
    }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index);

  const strongest = ranked[0]?.status;
  if (!strongest) {
    return weakestState(capSeq) ?? 'phantom';
  }

  const weakest = ranked[ranked.length - 1]?.status;
  if (
    weakest &&
    strongest === strongestState(capSeq) &&
    weakest === weakestState(capSeq) &&
    capSeq.length > 1
  ) {
    return capSeq[1];
  }

  return strongest;
}
