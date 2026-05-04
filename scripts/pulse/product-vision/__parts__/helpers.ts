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
} from '../../types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from '../../structural-family';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverCapabilityStatusLabels,
  discoverTruthModeLabels,
} from '../../dynamic-reality-kernel';

export { deriveUnitValue, deriveZeroValue };

export interface BuildProductVisionInput {
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  certification: PulseCertification;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  parityGaps: PulseParityGapsArtifact;
  externalSignalState?: PulseExternalSignalState;
}

function roundToPercentStep(value: number): number {
  const scale = deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue());
  return Math.round(value * scale) / scale;
}

export function quotient(numerator: number, denominator: number): number {
  if (denominator <= deriveZeroValue()) {
    return deriveZeroValue();
  }
  return roundToPercentStep(numerator / denominator);
}

function clamp(value: number): number {
  return Math.max(deriveZeroValue(), Math.min(deriveUnitValue(), roundToPercentStep(value)));
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(deriveZeroValue(), max - '...'.length)}...`;
}

export function humanize(value: string): string {
  return titleCaseStructural(value);
}

export function deriveStateSequence<State extends string>(
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

export function hasItems<T>(items: T[]): boolean {
  return items.length > deriveZeroValue();
}

export function hasCount(value: number): boolean {
  return value > deriveZeroValue();
}

export function multiple<T>(items: T[]): boolean {
  return items.length > deriveUnitValue();
}

export function observedHead<T>(items: T[]): T | undefined {
  return items[deriveZeroValue()];
}

export function observedSecond<T>(items: T[]): T | undefined {
  return items[deriveUnitValue()];
}

export function observedMiddle<T>(items: T[]): T | undefined {
  return items[Math.floor(quotient(items.length, deriveUnitValue() + deriveUnitValue()))];
}

export function leadingSpan(...counts: number[]): number {
  const observedCounts = counts.filter((count) => count > deriveZeroValue());
  if (!hasItems(observedCounts)) {
    return deriveUnitValue();
  }
  return Math.max(
    deriveUnitValue(),
    Math.ceil(
      quotient(
        observedCounts.reduce((sum, count) => sum + count, deriveZeroValue()),
        observedCounts.length,
      ),
    ),
  );
}

export function observedAverage(values: number[]): number {
  if (!hasItems(values)) {
    return deriveZeroValue();
  }
  return clamp(
    quotient(
      values.reduce((sum, value) => sum + value, deriveZeroValue()),
      values.length,
    ),
  );
}

export function observedRankWeight<State extends string>(
  status: State,
  observedStatuses: State[],
): number {
  return stateWeight(status, unique(observedStatuses));
}

export function stateWeight<State extends string>(status: State, statusOrder: State[]): number {
  const index = statusOrder.indexOf(status);
  if (index < deriveZeroValue()) {
    return deriveZeroValue();
  }

  const denominator = Math.max(statusOrder.length - deriveUnitValue(), deriveUnitValue());
  return clamp((denominator - index) / denominator);
}

export function strongestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[0];
}

export function weakestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[statusOrder.length - 1];
}

export function isMaterializedState<State extends string>(
  status: State,
  statusOrder: State[],
): boolean {
  const index = statusOrder.indexOf(status);
  if (index < 0) {
    return false;
  }

  return index < Math.ceil(statusOrder.length / 2);
}

export function stateFromCompletion<State extends string>(
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
      deriveUnitValue() + deriveUnitValue(),
    );
    if (completion >= boundary) {
      return current;
    }
  }

  return weakestState(statusOrder);
}

export function projectionBand(
  unitRatio: number,
  runRatio: number,
  highIssues: number,
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): 'red' | 'yellow' | 'green' {
  const capGreen = quotient(
    stateWeight(observedHead(capSeq) ?? capSeq[deriveZeroValue()], capSeq) +
      stateWeight(
        observedSecond(capSeq) ?? observedHead(capSeq) ?? capSeq[deriveZeroValue()],
        capSeq,
      ),
    deriveUnitValue() + deriveUnitValue(),
  );
  const flowGreen = quotient(
    stateWeight(observedHead(flowSeq) ?? flowSeq[deriveZeroValue()], flowSeq) +
      stateWeight(
        observedSecond(flowSeq) ?? observedHead(flowSeq) ?? flowSeq[deriveZeroValue()],
        flowSeq,
      ),
    deriveUnitValue() + deriveUnitValue(),
  );
  const capYellow = stateWeight(
    observedMiddle(capSeq) ?? observedHead(capSeq) ?? capSeq[deriveZeroValue()],
    capSeq,
  );
  const flowYellow = stateWeight(
    observedMiddle(flowSeq) ?? observedHead(flowSeq) ?? flowSeq[deriveZeroValue()],
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

export function deriveWeakestCapabilityStatus(): string {
  const members = [...discoverCapabilityStatusLabels()];
  return members[members.length - deriveUnitValue()];
}

export function chooseTruthMode(modes: PulseTruthMode[]): PulseTruthMode {
  const labels = [...discoverTruthModeLabels()] as PulseTruthMode[];
  for (const label of labels) {
    if (modes.includes(label)) return label;
  }
  return labels[labels.length - deriveUnitValue()];
}

export function truthModeAspirationalLabel(): PulseTruthMode {
  const labels = [...discoverTruthModeLabels()] as PulseTruthMode[];
  return labels[labels.length - deriveUnitValue()];
}

export function truthModeInferredLabel(): PulseTruthMode {
  const labels = [...discoverTruthModeLabels()] as PulseTruthMode[];
  return labels[deriveUnitValue()];
}

function discoverCoverageStatusSet(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.resolved-manifest.ts',
    'PulseResolvedModuleCoverageStatus',
  );
}

export function isDeclaredOnlyCoverageStatus(status: string): boolean {
  const labels = [...discoverCoverageStatusSet()];
  const idx = labels.length - deriveUnitValue() - deriveUnitValue();
  return idx >= 0 && labels[idx] === status;
}

export function isExcludedCoverageStatus(status: string): boolean {
  const labels = [...discoverCoverageStatusSet()];
  return labels[labels.length - deriveUnitValue()] === status;
}

export function summarizeEvidenceBasis(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
): { observed: number; inferred: number; projected: number } {
  const counts: Record<string, number> = {
    observed: deriveZeroValue(),
    inferred: deriveZeroValue(),
    projected: deriveZeroValue(),
  };

  for (const item of [...capabilities, ...flows]) {
    counts[item.truthMode] += deriveUnitValue();
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
    return weakestState(capSeq) ?? (deriveWeakestCapabilityStatus() as PulseCapabilityStatus);
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
    return weakestState(capSeq) ?? (deriveWeakestCapabilityStatus() as PulseCapabilityStatus);
  }

  const weakest = ranked[ranked.length - 1]?.status;
  if (
    weakest &&
    strongest === strongestState(capSeq) &&
    weakest === weakestState(capSeq) &&
    capSeq.length > deriveUnitValue()
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

export function mergeModules(
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
      coverageStatus: (() => {
        const statusPriority = [...discoverCoverageStatusSet()];
        for (const candidate of statusPriority) {
          if (existing.coverageStatus === candidate || entry.coverageStatus === candidate) {
            return candidate;
          }
        }
        return existing.coverageStatus;
      })(),
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

export function unitHitsModule(
  capability: PulseCapability,
  entry: BuildProductVisionInput['resolvedManifest']['modules'][number],
): boolean {
  return familiesOverlap(capabilityFamilies(capability), moduleFamilies(entry));
}

export function runHitsModule(
  flow: PulseFlowProjectionItem,
  entry: BuildProductVisionInput['resolvedManifest']['modules'][number],
  capIds: string[],
): boolean {
  if (flow.capabilityIds.some((capabilityId) => capIds.includes(capabilityId))) {
    return true;
  }

  return familiesOverlap(flowFamilies(flow), moduleFamilies(entry));
}

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
    isDeclaredOnlyCoverageStatus(entry.coverageStatus)
      ? `${entry.name} is declared in the promise model but has no discovered implementation yet.`
      : '',
  ])
    .filter(Boolean)
    .slice(
      deriveZeroValue(),
      leadingSpan(unitHits.length, runHits.length, entry.routeRoots.length),
    );
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
