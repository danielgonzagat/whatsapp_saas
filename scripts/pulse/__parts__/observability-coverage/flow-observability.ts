import { signalMatchesPillar } from './types-and-utils';
import type { ObservabilityRuntimeContext } from './types-and-utils';
import type {
  FlowObservability,
  ObservabilityPillar,
  ObservabilityStatus,
} from '../../types.observability-coverage';
import type { CapabilityObservability } from '../../types.observability-coverage';
import type { PulseFlowProjectionItem } from '../../types';

export function buildFlowObservability(
  flows: PulseFlowProjectionItem[],
  capabilityItems: CapabilityObservability[],
  runtimeContext: ObservabilityRuntimeContext,
): FlowObservability[] {
  const capById = new Map(capabilityItems.map((c) => [c.capabilityId, c]));

  return flows.map((flow) => {
    const flowCapabilityIds: string[] = (flow.capabilityIds as string[]) ?? [];
    const flowCaps = flowCapabilityIds
      .map((cid) => capById.get(cid))
      .filter(Boolean) as CapabilityObservability[];

    const pillarCounts = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => [pillar, { observed: 0, total: flowCaps.length }]),
    ) as Record<ObservabilityPillar, { observed: number; total: number }>;

    for (const cap of flowCaps) {
      for (const pillar of runtimeContext.pillars) {
        if (cap.pillars[pillar] === 'observed') {
          pillarCounts[pillar].observed++;
        }
      }
    }

    for (const signal of runtimeContext.runtimeSignalsByFlow.get(flow.id) ?? []) {
      if (signal.evidenceMode === 'simulated') continue;
      for (const pillar of runtimeContext.pillars) {
        if (
          signalMatchesPillar(signal.source, pillar) ||
          signalMatchesPillar(signal.type, pillar) ||
          signalMatchesPillar(signal.message, pillar)
        ) {
          pillarCounts[pillar].observed = Math.max(pillarCounts[pillar].observed, 1);
          pillarCounts[pillar].total = Math.max(pillarCounts[pillar].total, 1);
        }
      }
    }

    const pillars = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => {
        const count = pillarCounts[pillar];
        if (count.total === 0) return [pillar, 'not_applicable' as ObservabilityStatus];
        const ratio = count.observed / count.total;
        if (ratio >= 0.8) return [pillar, 'observed' as ObservabilityStatus];
        if (ratio > 0) return [pillar, 'partial' as ObservabilityStatus];
        return [pillar, 'missing' as ObservabilityStatus];
      }),
    ) as Record<ObservabilityPillar, ObservabilityStatus>;

    const overallStatus = computeOverallStatus(pillars);

    return {
      flowId: flow.id,
      flowName: flow.name,
      pillars,
      capabilities: flowCaps,
      overallStatus,
    };
  });
}

export function computeOverallStatus(
  pillars: Record<ObservabilityPillar, ObservabilityStatus>,
): 'covered' | 'partial' | 'uncovered' {
  const statuses = Object.values(pillars) as ObservabilityStatus[];
  const observed = statuses.filter((s) => s === 'observed').length;
  const totalRelevant = statuses.filter((s) => s !== 'not_applicable').length;

  if (totalRelevant === 0) return 'uncovered';
  const ratio = observed / totalRelevant;
  if (ratio >= 0.8) return 'covered';
  if (ratio > 0) return 'partial';
  return 'uncovered';
}
