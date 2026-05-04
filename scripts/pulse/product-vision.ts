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
import {
  deriveHttpStatusFromObservedCatalog,
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverCapabilityStatusLabels,
  discoverTruthModeLabels,
} from './dynamic-reality-kernel';

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

function roundToPercentStep(value: number): number {
  const scale =
    deriveHttpStatusFromObservedCatalog('OK') /
    (deriveUnitValue() + deriveUnitValue());
  return Math.round(value * scale) / scale;
}

function quotient(numerator: number, denominator: number): number {
  if (denominator <= deriveZeroValue()) {
    return deriveZeroValue();
  }
  return roundToPercentStep(numerator / denominator);
}

function clamp(value: number): number {
  return Math.max(deriveZeroValue(), Math.min(deriveUnitValue(), roundToPercentStep(value)));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compactPayload(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(deriveZeroValue(), max - '...'.length)}...`;
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
    .map((key) => key.slice(deriveZeroValue(), key.length - suffixSize))
    .filter((key): key is State => observed.includes(key as State));

  return unique([...derived, ...observed]);
}

function hasItems<T>(items: T[]): boolean {
  return items.length > deriveZeroValue();
}

function hasCount(value: number): boolean {
  return value > deriveZeroValue();
}

function multiple<T>(items: T[]): boolean {
  return items.length > deriveUnitValue();
}

function observedHead<T>(items: T[]): T | undefined {
  return items[deriveZeroValue()];
}

function observedSecond<T>(items: T[]): T | undefined {
  return items[deriveUnitValue()];
}

function observedMiddle<T>(items: T[]): T | undefined {
  return items[Math.floor(quotient(items.length, deriveUnitValue() + deriveUnitValue()))];
}

function leadingSpan(...counts: number[]): number {
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

function observedAverage(values: number[]): number {
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

function observedRankWeight<State extends string>(
  status: State,
  observedStatuses: State[],
): number {
  return stateWeight(status, unique(observedStatuses));
}

function stateWeight<State extends string>(status: State, statusOrder: State[]): number {
  const index = statusOrder.indexOf(status);
  if (index < deriveZeroValue()) {
    return deriveZeroValue();
  }

  const denominator = Math.max(statusOrder.length - deriveUnitValue(), deriveUnitValue());
  return clamp((denominator - index) / denominator);
}

function strongestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[deriveZeroValue()];
}

function weakestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[statusOrder.length - deriveUnitValue()];
}

function discoverReadinessBandLabels(): string[] {
  return [...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.product-vision.ts',
    'projectedProductionReadiness',
  )];
}

function isMaterializedState<State extends string>(status: State, statusOrder: State[]): boolean {
  const index = statusOrder.indexOf(status);
  if (index < deriveZeroValue()) {
    return deriveZeroValue() > deriveZeroValue();
  }

  return index < Math.ceil(statusOrder.length / (deriveUnitValue() + deriveUnitValue()));
}

function stateFromCompletion<State extends string>(
  completion: number,
  statusOrder: State[],
): State | undefined {
  if (statusOrder.length === deriveZeroValue()) {
    return undefined;
  }

  for (let index = deriveZeroValue(); index < statusOrder.length - deriveUnitValue(); index += deriveUnitValue()) {
    const current = statusOrder[index];
    const next = statusOrder[index + deriveUnitValue()];
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

function strongestReadinessLabel(): string {
  const labels = discoverReadinessBandLabels();
  return labels[labels.length - deriveUnitValue()];
}
function midReadinessLabel(): string {
  const labels = discoverReadinessBandLabels();
  return labels[deriveUnitValue()];
}
function weakestReadinessLabel(): string {
  const labels = discoverReadinessBandLabels();
  return labels[deriveZeroValue()];
}

function projectionBand(
  unitRatio: number,
  runRatio: number,
  highIssues: number,
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): string {
  const capGreen = quotient(
    stateWeight(observedHead(capSeq) ?? capSeq[deriveZeroValue()], capSeq) +
      stateWeight(observedSecond(capSeq) ?? observedHead(capSeq) ?? capSeq[deriveZeroValue()], capSeq),
    deriveUnitValue() + deriveUnitValue(),
  );
  const flowGreen = quotient(
    stateWeight(observedHead(flowSeq) ?? flowSeq[deriveZeroValue()], flowSeq) +
      stateWeight(observedSecond(flowSeq) ?? observedHead(flowSeq) ?? flowSeq[deriveZeroValue()], flowSeq),
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
    return strongestReadinessLabel();
  }
  if (unitRatio >= capYellow || runRatio >= flowYellow) {
    return midReadinessLabel();
  }
  return weakestReadinessLabel();
}

function deriveWeakestCapabilityStatus(): string {
  const members = [...discoverCapabilityStatusLabels()];
  return members[members.length - deriveUnitValue()];
}

function chooseTruthMode(modes: PulseTruthMode[]): PulseTruthMode {
  const labels = [...discoverTruthModeLabels()] as PulseTruthMode[];
  for (const label of labels) {
    if (modes.includes(label)) return label;
  }
  return labels[labels.length - deriveUnitValue()];
}

function truthModeAspirationalLabel(): PulseTruthMode {
  const labels = [...discoverTruthModeLabels()] as PulseTruthMode[];
  return labels[labels.length - deriveUnitValue()];
}

function truthModeInferredLabel(): PulseTruthMode {
  const labels = [...discoverTruthModeLabels()] as PulseTruthMode[];
  return labels[deriveUnitValue()];
}

function discoverCoverageStatusSet(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.resolved-manifest.ts',
    'PulseResolvedModuleCoverageStatus',
  );
}

function isDeclaredOnlyCoverageStatus(status: string): boolean {
  const labels = [...discoverCoverageStatusSet()];
  const idx = labels.length - deriveUnitValue() - deriveUnitValue();
  return idx >= deriveZeroValue() && labels[idx] === status;
}

function isExcludedCoverageStatus(status: string): boolean {
  const labels = [...discoverCoverageStatusSet()];
  return labels[labels.length - deriveUnitValue()] === status;
}

function summarizeEvidenceBasis(
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

function bestStatus(
  capStates: PulseCapabilityStatus[],
  flowStates: PulseFlowProjectionStatus[],
  capSeq: PulseCapabilityStatus[],
): PulseCapabilityStatus {
  const all = [...capStates, ...flowStates];
  if (all.length === deriveZeroValue()) {
    return weakestState(capSeq) ?? deriveWeakestCapabilityStatus() as PulseCapabilityStatus;
  }

  const ranked = unique(all)
    .map((status) => ({
      status: status as PulseCapabilityStatus,
      index: capSeq.indexOf(status as PulseCapabilityStatus),
    }))
    .filter((entry) => entry.index >= deriveZeroValue())
    .sort((left, right) => left.index - right.index);

    const strongest = ranked[deriveZeroValue()]?.status;
  if (!strongest) {
    return weakestState(capSeq) ?? deriveWeakestCapabilityStatus() as PulseCapabilityStatus;
  }

    const weakest = ranked[ranked.length - deriveUnitValue()]?.status;
  if (
    weakest &&
    strongest === strongestState(capSeq) &&
    weakest === weakestState(capSeq) &&
    capSeq.length > deriveUnitValue()
  ) {
    return capSeq[deriveUnitValue()];
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
  return flow.capabilityIds.some((capabilityId) => capIds.includes(capabilityId))
    || familiesOverlap(flowFamilies(flow), moduleFamilies(entry));
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
    isDeclaredOnlyCoverageStatus(entry.coverageStatus)
      ? `${entry.name} is declared in the promise model but has no discovered implementation yet.`
      : '',
  ])
    .filter(Boolean)
    .slice(deriveZeroValue(), leadingSpan(unitHits.length, runHits.length, entry.routeRoots.length));
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

/** Build projected product vision from current capability and flow states. */
export function buildProductVision(input: BuildProductVisionInput): PulseProductVision {
  const capSeq = deriveStateSequence(
    input.capabilityState.summary as unknown as Record<string, unknown>,
    'Capabilities',
    input.capabilityState.capabilities.map((item) => item.status),
  );
  const flowSeq = deriveStateSequence(
    input.flowProjection.summary as unknown as Record<string, unknown>,
    'Flows',
    input.flowProjection.flows.map((item) => item.status),
  );
  const capBest = strongestState(capSeq);
  const capWeak = weakestState(capSeq);
  const flowBest = strongestState(flowSeq);
  const flowWeak = weakestState(flowSeq);
  const productUnits = input.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || hasItems(capability.routePatterns),
  );
  const scopedUnits = hasItems(productUnits) ? productUnits : input.capabilityState.capabilities;
  const totalUnits = Math.max(scopedUnits.length, deriveUnitValue());
  const totalFlows = Math.max(input.flowProjection.summary.totalFlows, deriveUnitValue());
  const readyUnits = scopedUnits.filter((capability) =>
    isMaterializedState(capability.status, capSeq),
  ).length;
  const readyRuns = input.flowProjection.flows.filter((flow) =>
    isMaterializedState(flow.status, flowSeq),
  ).length;
  const unitRatio = quotient(readyUnits, totalUnits);
  const runRatio = quotient(readyRuns, totalFlows);
  const readiness = projectionBand(
    unitRatio,
    runRatio,
    input.codacyEvidence.summary.highIssues,
    capSeq,
    flowSeq,
  );
  const productFacingWeakUnits = scopedUnits.filter(
    (capability) => capability.status === capWeak,
  ).length;
  const systemWeakUnits = input.capabilityState.summary.phantomCapabilities;

  const mergedEntries = mergeModules(input.resolvedManifest.modules);
  const surfaces = mergedEntries
    .filter((entry) => entry.userFacing && !isExcludedCoverageStatus(entry.coverageStatus))
    .map((entry) => {
      const unitHits = input.capabilityState.capabilities.filter((capability) =>
        unitHitsModule(capability, entry),
      );
      const capIds = unitHits.map((capability) => capability.id);
      const runHits = input.flowProjection.flows.filter((flow) =>
        runHitsModule(flow, entry, capIds),
      );
      const status = bestStatus(
        unitHits.map((capability) => capability.status),
        runHits.map((flow) => flow.status),
        capSeq,
      );
      const blockers = buildSurfaceBlockers(unitHits, runHits, entry, capSeq, flowSeq);
      return {
        id: `surface:${entry.key}`,
        name: entry.name,
        declaredByManifest: entry.declaredByManifest,
        critical: entry.critical,
        status,
        truthMode: chooseTruthMode([
          ...unitHits.map((capability) => capability.truthMode),
          ...runHits.map((flow) => flow.truthMode),
          !hasItems(unitHits) && !hasItems(runHits) ? truthModeAspirationalLabel() : truthModeInferredLabel(),
        ]),
        completion: buildCapabilityCompletion(unitHits, runHits, capSeq, flowSeq),
        routePatterns: unique([
          ...entry.routeRoots,
          ...unitHits.flatMap((capability) => capability.routePatterns),
          ...runHits.flatMap((flow) => flow.routePatterns),
        ]).sort(),
        capabilityIds: capIds.sort(),
        flowIds: runHits.map((flow) => flow.id).sort(),
        blockers,
      };
    })
    .sort((left, right) => {
      if (left.declaredByManifest !== right.declaredByManifest) {
        return Number(right.declaredByManifest) - Number(left.declaredByManifest);
      }
      if (left.critical !== right.critical) {
        return Number(right.critical) - Number(left.critical);
      }
      if (left.status !== right.status) {
        return stateWeight(right.status, capSeq) - stateWeight(left.status, capSeq);
      }
      if (left.completion !== right.completion) {
        return right.completion - left.completion;
      }
      return left.name.localeCompare(right.name);
    });

  const runtimeProbes = input.certification.evidenceSummary.runtime.probes || [];
  const runResults = input.certification.evidenceSummary.flows.results || [];
  const runResultStates = runResults.map((entry) => entry.status);
  const runtimeProbeStates = runtimeProbes.map((entry) => entry.status);
  const completeRuntimeProbeState = observedHead(unique(runtimeProbeStates));
  const experiences = input.resolvedManifest.scenarioSpecs
    .filter((scenario) => scenario.critical)
    .map((scenario) => {
      const scenarioFamilies = deriveStructuralFamilies([
        ...scenario.moduleKeys,
        ...scenario.routePatterns,
        ...scenario.flowSpecs,
      ]);
      const experienceSurfaces = surfaces.filter((surface) =>
        familiesOverlap(
          scenarioFamilies,
          deriveStructuralFamilies([surface.id, surface.name, ...surface.routePatterns]),
        ),
      );
      const experienceUnits = unique(
        experienceSurfaces.flatMap((surface) => surface.capabilityIds),
      );
      const experienceRuns = input.flowProjection.flows.filter((flow) => {
        const runStructuralFamilies = deriveStructuralFamilies([
          flow.id,
          flow.name,
          ...flow.routePatterns,
        ]);
        const pathHit = familiesOverlap(scenarioFamilies, runStructuralFamilies);
        const unitHit = flow.capabilityIds.some((capabilityId) =>
          experienceUnits.includes(capabilityId),
        );
        const declaredRunHit = familiesOverlap(scenario.flowSpecs, [flow.id, flow.name]);
        return pathHit || unitHit || declaredRunHit;
      });
      const executionWeights = scenario.flowSpecs.map((runSpec) => {
        const result = runResults.find((entry) => entry.flowId === runSpec);
        if (!result) {
          return deriveZeroValue();
        }
        return observedRankWeight(result.status, runResultStates);
      });
      const runtimeWeight = observedAverage(
        scenario.runtimeProbes.map((probeId) => {
          const probe = runtimeProbes.find((entry) => entry.probeId === probeId);
          return probe ? observedRankWeight(probe.status, runtimeProbeStates) : deriveZeroValue();
        }),
      );
      const surfaceWeight = observedAverage(
        experienceSurfaces.map((surface) => surface.completion),
      );
      const runWeight = observedAverage(
        experienceRuns.map((flow) => stateWeight(flow.status, flowSeq)),
      );
      const completion = observedAverage([
        ...(hasItems(experienceSurfaces) ? [surfaceWeight] : []),
        ...(hasItems(experienceRuns) ? [runWeight] : []),
        ...(hasItems(executionWeights) ? [observedAverage(executionWeights)] : []),
        ...(hasItems(scenario.runtimeProbes) ? [runtimeWeight] : []),
      ]);
      const status: PulseFlowProjectionStatus =
        stateFromCompletion(completion, flowSeq) ?? flowWeak ?? deriveWeakestCapabilityStatus() as PulseCapabilityStatus;

      const blockers = unique([
        ...scenario.runtimeProbes
          .filter((probeId) => !runtimeProbes.some((probe) => probe.probeId === probeId))
          .map((probeId) => `Runtime probe ${probeId} is still missing from live evidence.`),
        ...scenario.runtimeProbes
          .map((probeId) => runtimeProbes.find((probe) => probe.probeId === probeId))
          .filter((probe): probe is NonNullable<typeof probe> => Boolean(probe))
          .filter((probe) =>
            completeRuntimeProbeState ? probe.status !== completeRuntimeProbeState : !deriveZeroValue(),
          )
          .map((probe) => probe.summary || `Runtime probe ${probe.probeId} is not passing.`),
        ...experienceSurfaces.flatMap((surface) =>
          surface.blockers.slice(deriveZeroValue(), Math.max(deriveUnitValue(), surface.blockers.length)),
        ),
        ...experienceRuns
          .filter((flow) => flow.status !== flowBest)
          .map((flow) => flow.blockingReasons[0] || `${flow.name} remains ${flow.status}.`),
      ])
        .filter(Boolean)
        .slice(
          deriveZeroValue(),
          leadingSpan(
            scenario.runtimeProbes.length,
            experienceSurfaces.length,
            experienceRuns.length,
          ),
        );

      return {
        id: scenario.id,
        name: humanize(scenario.id),
        status,
        truthMode: chooseTruthMode([
          ...experienceSurfaces.map((surface) => surface.truthMode),
          ...experienceRuns.map((flow) => flow.truthMode),
          completion === deriveZeroValue() ? truthModeAspirationalLabel() : truthModeInferredLabel(),
        ]),
        completion,
        routePatterns: unique(scenario.routePatterns).sort(),
        capabilityIds: experienceUnits.sort(),
        flowIds: unique([...scenario.flowSpecs, ...experienceRuns.map((flow) => flow.id)]).sort(),
        blockers,
        expectedOutcome: compactPayload(
          scenario.notes ||
            `Experience ${scenario.id} should converge as a coherent product journey with real persistence and visible outcomes.`,
          260,
        ),
      };
    })
    .sort(
      (left, right) => right.completion - left.completion || left.name.localeCompare(right.name),
    );

  const promiseToProductionDelta = {
    declaredSurfaces: surfaces.length,
    realSurfaces: surfaces.filter((surface) => surface.status === capBest).length,
    partialSurfaces: surfaces.filter((surface) => surface.status === observedSecond(capSeq)).length,
    latentSurfaces: surfaces.filter((surface) => surface.status === observedMiddle(capSeq)).length,
    phantomSurfaces: surfaces.filter((surface) => surface.status === capWeak).length,
    productFacingPhantomCapabilities: productFacingWeakUnits,
    systemPhantomCapabilities: systemWeakUnits,
    criticalGaps: surfaces
      .filter(
        (surface) =>
          surface.status !== capBest &&
          (surface.declaredByManifest || surface.critical || multiple(surface.routePatterns)),
      )
      .slice(deriveZeroValue(), leadingSpan(surfaces.length, input.parityGaps.gaps.length))
      .map(
        (surface) =>
          `${surface.name}: ${surface.blockers[0] || `${surface.status} surface with incomplete materialization.`}`,
      ),
  };

  const externalSignals = input.externalSignalState?.signals || [];
  const blockerSpan = leadingSpan(
    externalSignals.length,
    promiseToProductionDelta.criticalGaps.length,
    input.parityGaps.gaps.length,
    experiences.length,
    scopedUnits.length,
  );
  const leadingBlockers = unique([
    ...[...externalSignals]
      .sort((left, right) => right.impactScore - left.impactScore)
      .slice(deriveZeroValue(), blockerSpan)
      .map((signal) => `${signal.source}/${signal.type}: ${signal.summary}`),
    ...promiseToProductionDelta.criticalGaps,
    ...input.parityGaps.gaps
      .slice(deriveZeroValue(), blockerSpan)
      .map((gap) => `${gap.title}: ${gap.summary}`),
    ...experiences
      .filter((experience) => experience.status !== flowBest)
      .slice(deriveZeroValue(), blockerSpan)
      .map(
        (experience) =>
          `${experience.name}: ${experience.blockers[0] || `${experience.status} experience.`}`,
      ),
    ...scopedUnits
      .filter(
        (capability) =>
          capability.status === capWeak || hasCount(capability.highSeverityIssueCount),
      )
      .slice(deriveZeroValue(), blockerSpan)
      .map((capability) =>
        hasCount(capability.highSeverityIssueCount)
          ? `${capability.name}: ${capability.highSeverityIssueCount} HIGH Codacy issue(s).`
          : `${capability.name}: capability still phantom.`,
      ),
  ]).slice(deriveZeroValue(), leadingSpan(blockerSpan, promiseToProductionDelta.criticalGaps.length));

  const evidenceBasis = summarizeEvidenceBasis(scopedUnits, input.flowProjection.flows);

  const surfaceNames = surfaces
    .filter((surface) => isMaterializedState(surface.status, capSeq))
    .slice(deriveZeroValue(), leadingSpan(surfaces.length, experiences.length))
    .map((surface) => surface.name);

  const inferredProductIdentity = hasItems(surfaceNames)
    ? `If the currently connected structures converge, the product resolves toward a unified operational platform centered on ${unique(surfaceNames).join(', ')}.`
    : 'The current repository still exposes too little converged surface area to infer a stable product identity.';

  return {
    generatedAt: new Date().toISOString(),
    truthMode: truthModeAspirationalLabel(),
    evidenceBasis,
    currentCheckpoint: {
      tier: input.certification.blockingTier,
      status: input.certification.status,
      score: input.certification.score,
    },
    projectedCheckpoint: {
      capabilityRealnessRatio: unitRatio,
      flowRealnessRatio: runRatio,
      projectedProductionReadiness: readiness,
    },
    currentStateSummary: `The current product-facing system materializes ${capSeq
      .map(
        (status) =>
          `${scopedUnits.filter((capability) => capability.status === status).length} ${status} capability(ies)`,
      )
      .join(', ')}. System-wide phantom capability count is ${systemWeakUnits}.`,
    projectedProductSummary: `If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to ${readyUnits}/${totalUnits} capability(ies) and ${readyRuns}/${totalFlows} flow(s) at least partially real, with readiness ${readiness}.`,
    inferredProductIdentity,
    distanceSummary: `Distance to projected readiness is driven by ${productFacingWeakUnits} product-facing phantom capability(ies), ${systemWeakUnits} system-wide phantom capability(ies), ${input.flowProjection.summary.phantomFlows} phantom flow(s), ${input.parityGaps.summary.totalGaps} structural parity gap(s), and ${input.codacyEvidence.summary.highIssues} HIGH Codacy issue(s).`,
    promiseToProductionDelta,
    externalSignalSummary: input.externalSignalState?.summary,
    surfaces,
    experiences,
    topBlockers: leadingBlockers,
  };
}
