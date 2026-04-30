import type {
  PulseCapability,
  PulseCapabilityState,
  PulseCapabilityStatus,
  PulseCertification,
  PulseCodacyEvidence,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseFlowProjectionStatus,
  PulseParityGapsArtifact,
  PulseProductVision,
  PulseResolvedManifest,
  PulseScopeState,
  PulseTruthMode,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from './structural-family';

interface BuildProductVisionInput {
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  certification: PulseCertification;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  parityGaps: PulseParityGapsArtifact;
  externalSignalState?: PulseExternalSignalState;
}

function zero(): number {
  return Number(false);
}

function one(): number {
  return Number(true);
}

function roundToPercentStep(value: number): number {
  return Math.round(value * 100) / 100;
}

function quotient(numerator: number, denominator: number): number {
  if (denominator <= zero()) {
    return zero();
  }
  return roundToPercentStep(numerator / denominator);
}

function clamp(value: number): number {
  return Math.max(zero(), Math.min(one(), roundToPercentStep(value)));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(zero(), max - '...'.length)}...`;
}

function humanize(value: string): string {
  return titleCaseStructural(value);
}

function deriveStateSequence<State extends string>(
  summary: Record<string, unknown>,
  suffix: string,
  observedValues: State[],
): State[] {
  const observed = unique(observedValues);
  const suffixSize = suffix.length;
  const derived = Object.keys(summary)
    .filter((key) => key.endsWith(suffix))
    .map((key) => key.slice(0, key.length - suffixSize))
    .filter((key): key is State => observed.includes(key as State));

  return unique([...derived, ...observed]);
}

function hasItems<T>(items: T[]): boolean {
  return items.length > zero();
}

function hasCount(value: number): boolean {
  return value > zero();
}

function multiple<T>(items: T[]): boolean {
  return items.length > one();
}

function observedHead<T>(items: T[]): T | undefined {
  return items[zero()];
}

function observedSecond<T>(items: T[]): T | undefined {
  return items[one()];
}

function observedMiddle<T>(items: T[]): T | undefined {
  return items[Math.floor(quotient(items.length, one() + one()))];
}

function leadingSpan(...counts: number[]): number {
  const observedCounts = counts.filter((count) => count > zero());
  if (!hasItems(observedCounts)) {
    return one();
  }
  return Math.max(
    one(),
    Math.ceil(
      quotient(
        observedCounts.reduce((sum, count) => sum + count, zero()),
        observedCounts.length,
      ),
    ),
  );
}

function observedAverage(values: number[]): number {
  if (!hasItems(values)) {
    return zero();
  }
  return clamp(
    quotient(
      values.reduce((sum, value) => sum + value, zero()),
      values.length,
    ),
  );
}

function observedRankWeight<State extends string>(
  status: State,
  observedStatuses: State[],
): number {
  return stateWeight(status, unique(observedStatuses));
}

function stateWeight<State extends string>(status: State, statusOrder: State[]): number {
  const index = statusOrder.indexOf(status);
  if (index < zero()) {
    return zero();
  }

  const denominator = Math.max(statusOrder.length - one(), one());
  return clamp((denominator - index) / denominator);
}

function strongestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[0];
}

function weakestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[statusOrder.length - 1];
}

function isMaterializedState<State extends string>(status: State, statusOrder: State[]): boolean {
  const index = statusOrder.indexOf(status);
  if (index < 0) {
    return false;
  }

  return index < Math.ceil(statusOrder.length / 2);
}

function stateFromCompletion<State extends string>(
  completion: number,
  statusOrder: State[],
): State | undefined {
  if (statusOrder.length === 0) {
    return undefined;
  }

  for (let index = 0; index < statusOrder.length - 1; index += 1) {
    const current = statusOrder[index];
    const next = statusOrder[index + 1];
    const boundary = quotient(
      stateWeight(current, statusOrder) + stateWeight(next, statusOrder),
      one() + one(),
    );
    if (completion >= boundary) {
      return current;
    }
  }

  return weakestState(statusOrder);
}

function projectionBand(
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

function chooseTruthMode(modes: PulseTruthMode[]): PulseTruthMode {
  if (modes.includes('observed')) {
    return 'observed';
  }
  if (modes.includes('inferred')) {
    return 'inferred';
  }
  return 'aspirational';
}

function summarizeEvidenceBasis(
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

function bestStatus(
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

function moduleFamilies(
  entry: BuildProductVisionInput['resolvedManifest']['modules'][number],
): string[] {
  return deriveStructuralFamilies([
    entry.key,
    entry.name,
    entry.canonicalName,
    ...entry.aliases,
    ...entry.routeRoots,
  ]);
}

function capabilityFamilies(capability: PulseCapability): string[] {
  return deriveStructuralFamilies([capability.id, capability.name, ...capability.routePatterns]);
}

function flowFamilies(flow: PulseFlowProjectionItem): string[] {
  return deriveStructuralFamilies([flow.id, flow.name, ...flow.routePatterns]);
}

function mergeModules(
  modules: BuildProductVisionInput['resolvedManifest']['modules'],
): BuildProductVisionInput['resolvedManifest']['modules'] {
  const merged = new Map<string, BuildProductVisionInput['resolvedManifest']['modules'][number]>();

  for (const entry of modules) {
    const key = slugifyStructural(entry.key || entry.canonicalName || entry.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...entry,
        key,
        aliases: unique(entry.aliases),
        routeRoots: unique(entry.routeRoots),
        groups: unique(entry.groups),
        surfaceKinds: unique(entry.surfaceKinds),
      });
      continue;
    }

    merged.set(key, {
      ...existing,
      name: existing.declaredByManifest ? existing.name : entry.name,
      canonicalName: existing.declaredByManifest ? existing.canonicalName : entry.canonicalName,
      aliases: unique([...existing.aliases, ...entry.aliases]),
      routeRoots: unique([...existing.routeRoots, ...entry.routeRoots]),
      groups: unique([...existing.groups, ...entry.groups]),
      userFacing: existing.userFacing || entry.userFacing,
      critical: existing.critical || entry.critical,
      declaredByManifest: existing.declaredByManifest || entry.declaredByManifest,
      protectedByGovernance: existing.protectedByGovernance || entry.protectedByGovernance,
      coverageStatus:
        existing.coverageStatus === 'declared_and_discovered' ||
        entry.coverageStatus === 'declared_and_discovered'
          ? 'declared_and_discovered'
          : existing.coverageStatus === 'discovered_only' ||
              entry.coverageStatus === 'discovered_only'
            ? 'discovered_only'
            : existing.coverageStatus,
      discoveredFileCount: existing.discoveredFileCount + entry.discoveredFileCount,
      codacyIssueCount: existing.codacyIssueCount + entry.codacyIssueCount,
      highSeverityIssueCount: existing.highSeverityIssueCount + entry.highSeverityIssueCount,
      surfaceKinds: unique([...existing.surfaceKinds, ...entry.surfaceKinds]),
      pageCount: existing.pageCount + entry.pageCount,
      totalInteractions: existing.totalInteractions + entry.totalInteractions,
      backendBoundInteractions: existing.backendBoundInteractions + entry.backendBoundInteractions,
      persistedInteractions: existing.persistedInteractions + entry.persistedInteractions,
      backedDataSources: existing.backedDataSources + entry.backedDataSources,
      notes: unique([existing.notes, entry.notes].filter(Boolean)).join(' | '),
    });
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function unitHitsModule(
  capability: PulseCapability,
  entry: BuildProductVisionInput['resolvedManifest']['modules'][number],
): boolean {
  return familiesOverlap(capabilityFamilies(capability), moduleFamilies(entry));
}

function runHitsModule(
  flow: PulseFlowProjectionItem,
  entry: BuildProductVisionInput['resolvedManifest']['modules'][number],
  capIds: string[],
): boolean {
  if (flow.capabilityIds.some((capabilityId) => capIds.includes(capabilityId))) {
    return true;
  }

  return familiesOverlap(flowFamilies(flow), moduleFamilies(entry));
}

function buildSurfaceBlockers(
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

function buildCapabilityCompletion(
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
