import type { Break } from './types';
import {
  deriveDynamicFindingIdentity,
  type PulseDynamicFindingIdentity,
  type PulseFindingActionability,
  type PulseFindingTruthMode,
} from './finding-identity';

export interface PulseFindingEventSurfaceCounts {
  observed: number;
  confirmed_static: number;
  inferred: number;
  weak_signal: number;
}

export interface PulseFindingEventActionabilityCounts {
  fix_now: number;
  needs_probe: number;
  needs_context: number;
  ignore: number;
}

export interface PulseFindingTopEvent {
  eventName: string;
  eventKey: string;
  summary: string;
  count: number;
  truthMode: PulseFindingTruthMode;
  actionability: PulseFindingActionability;
  falsePositiveRisk: number;
  sampleLocations: string[];
  evidenceChain: string[];
}

export interface PulseFindingEventSurface {
  totalBreaks: number;
  uniqueEvents: number;
  truthModeCounts: PulseFindingEventSurfaceCounts;
  actionabilityCounts: PulseFindingEventActionabilityCounts;
  topEvents: PulseFindingTopEvent[];
}

interface EventAccumulator {
  identity: PulseDynamicFindingIdentity;
  count: number;
  sampleLocations: string[];
}

const DEFAULT_TOP_EVENT_LIMIT = 8;
const SAMPLE_LOCATION_LIMIT = 3;

function emptyTruthModeCounts(): PulseFindingEventSurfaceCounts {
  return {
    observed: 0,
    confirmed_static: 0,
    inferred: 0,
    weak_signal: 0,
  };
}

function emptyActionabilityCounts(): PulseFindingEventActionabilityCounts {
  return {
    fix_now: 0,
    needs_probe: 0,
    needs_context: 0,
    ignore: 0,
  };
}

function locationFor(item: Break): string {
  return `${item.file}:${item.line}`;
}

function incrementTruthModeCount(
  counts: PulseFindingEventSurfaceCounts,
  truthMode: PulseFindingTruthMode,
): void {
  counts[truthMode] += 1;
}

function incrementActionabilityCount(
  counts: PulseFindingEventActionabilityCounts,
  actionability: PulseFindingActionability,
): void {
  counts[actionability] += 1;
}

function operationalSummary(identity: PulseDynamicFindingIdentity, count: number): string {
  const occurrenceLabel = count === 1 ? '1 finding' : `${count} findings`;
  return `${identity.eventName} - ${occurrenceLabel}, ${identity.truthMode}, ${identity.actionability}`;
}

function toTopEvent(accumulator: EventAccumulator): PulseFindingTopEvent {
  return {
    eventName: accumulator.identity.eventName,
    eventKey: accumulator.identity.eventKey,
    summary: operationalSummary(accumulator.identity, accumulator.count),
    count: accumulator.count,
    truthMode: accumulator.identity.truthMode,
    actionability: accumulator.identity.actionability,
    falsePositiveRisk: accumulator.identity.falsePositiveRisk,
    sampleLocations: accumulator.sampleLocations,
    evidenceChain: accumulator.identity.evidenceChain,
  };
}

function compareTopEvents(left: EventAccumulator, right: EventAccumulator): number {
  return (
    right.count - left.count ||
    left.identity.falsePositiveRisk - right.identity.falsePositiveRisk ||
    left.identity.eventName.localeCompare(right.identity.eventName)
  );
}

export function buildFindingEventSurface(
  breaks: readonly Break[],
  topEventLimit: number = DEFAULT_TOP_EVENT_LIMIT,
): PulseFindingEventSurface {
  const truthModeCounts = emptyTruthModeCounts();
  const actionabilityCounts = emptyActionabilityCounts();
  const events = new Map<string, EventAccumulator>();

  for (const item of breaks) {
    const identity = deriveDynamicFindingIdentity(item);
    incrementTruthModeCount(truthModeCounts, identity.truthMode);
    incrementActionabilityCount(actionabilityCounts, identity.actionability);

    const existing = events.get(identity.eventKey);
    if (existing) {
      existing.count += 1;
      if (existing.sampleLocations.length < SAMPLE_LOCATION_LIMIT) {
        existing.sampleLocations.push(locationFor(item));
      }
      continue;
    }

    events.set(identity.eventKey, {
      identity,
      count: 1,
      sampleLocations: [locationFor(item)],
    });
  }

  const normalizedLimit = Math.max(0, Math.trunc(topEventLimit));
  const topEvents = [...events.values()]
    .sort(compareTopEvents)
    .slice(0, normalizedLimit)
    .map(toTopEvent);

  return {
    totalBreaks: breaks.length,
    uniqueEvents: events.size,
    truthModeCounts,
    actionabilityCounts,
    topEvents,
  };
}
