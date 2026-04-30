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

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100) / 100;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compact(value: string, max: number = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
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

function stateScore<State extends string>(status: State, statusOrder: State[]): number {
  const index = statusOrder.indexOf(status);
  if (index < 0) {
    return 0;
  }

  const denominator = Math.max(statusOrder.length - 1, 1);
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
    const boundary = (stateScore(current, statusOrder) + stateScore(next, statusOrder)) / 2;
    if (completion >= boundary) {
      return current;
    }
  }

  return weakestState(statusOrder);
}

function getProjectedReadiness(
  unitRatio: number,
  runRatio: number,
  highIssues: number,
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): 'red' | 'yellow' | 'green' {
  const capGreen = ratio(
    stateScore(capSeq[0], capSeq) + stateScore(capSeq[1] ?? capSeq[0], capSeq),
    2,
  );
  const flowGreen = ratio(
    stateScore(flowSeq[0], flowSeq) + stateScore(flowSeq[1] ?? flowSeq[0], flowSeq),
    2,
  );
  const capYellow = stateScore(capSeq[Math.floor(capSeq.length / 2)] ?? capSeq[0], capSeq);
  const flowYellow = stateScore(flowSeq[Math.floor(flowSeq.length / 2)] ?? flowSeq[0], flowSeq);

  if (unitRatio >= capGreen && runRatio >= flowGreen && highIssues === 0) {
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
        (capability) => capability.status !== capBest || capability.highSeverityIssueCount > 0,
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
    .slice(0, 6);
}

function buildCapabilityCompletion(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
  capSeq: PulseCapabilityStatus[],
  flowSeq: PulseFlowProjectionStatus[],
): number {
  const scores = [
    ...capabilities.map((capability) => stateScore(capability.status, capSeq)),
    ...flows.map((flow) => stateScore(flow.status, flowSeq)),
  ];
  if (scores.length === 0) {
    return 0;
  }
  return clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length);
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
    (capability) => capability.userFacing || capability.routePatterns.length > 0,
  );
  const scopedUnits = productUnits.length > 0 ? productUnits : input.capabilityState.capabilities;
  const totalUnits = scopedUnits.length || 1;
  const totalFlows = input.flowProjection.summary.totalFlows || 1;
  const readyUnits = scopedUnits.filter((capability) =>
    isMaterializedState(capability.status, capSeq),
  ).length;
  const readyRuns = input.flowProjection.flows.filter((flow) =>
    isMaterializedState(flow.status, flowSeq),
  ).length;
  const unitRatio = ratio(readyUnits, totalUnits);
  const runRatio = ratio(readyRuns, totalFlows);
  const readiness = getProjectedReadiness(
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
    .filter((entry) => entry.userFacing && entry.coverageStatus !== 'excluded')
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
          unitHits.length === 0 && runHits.length === 0 ? 'aspirational' : 'inferred',
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
        return stateScore(right.status, capSeq) - stateScore(left.status, capSeq);
      }
      if (left.completion !== right.completion) {
        return right.completion - left.completion;
      }
      return left.name.localeCompare(right.name);
    });

  const runtimeProbes = input.certification.evidenceSummary.runtime.probes || [];
  const runResults = input.certification.evidenceSummary.flows.results || [];
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
      const executionStatusScores = scenario.flowSpecs.map((runSpec) => {
        const result = runResults.find((entry) => entry.flowId === runSpec);
        if (!result) {
          return 0;
        }
        if (result.status === 'passed') {
          return 1;
        }
        if (result.status === 'accepted') {
          return 0.75;
        }
        if (result.status === 'missing_evidence' || result.status === 'skipped') {
          return 0.2;
        }
        return 0;
      });
      const runtimeScore =
        scenario.runtimeProbes.length === 0
          ? 1
          : clamp(
              scenario.runtimeProbes.reduce((sum, probeId) => {
                const probe = runtimeProbes.find((entry) => entry.probeId === probeId);
                if (!probe) {
                  return sum;
                }
                return sum + (probe.status === 'passed' ? 1 : 0);
              }, 0) / scenario.runtimeProbes.length,
            );
      const surfaceScore =
        experienceSurfaces.length === 0
          ? 0
          : clamp(
              experienceSurfaces.reduce((sum, surface) => sum + surface.completion, 0) /
                experienceSurfaces.length,
            );
      const runScore =
        experienceRuns.length === 0
          ? 0
          : clamp(
              experienceRuns.reduce((sum, flow) => sum + stateScore(flow.status, flowSeq), 0) /
                experienceRuns.length,
            );
      const completion = clamp(
        surfaceScore * 0.45 +
          runScore * 0.35 +
          (executionStatusScores.length > 0
            ? executionStatusScores.reduce((sum, value) => sum + value, 0) /
              executionStatusScores.length
            : 0) *
            0.15 +
          runtimeScore * 0.05,
      );
      const status: PulseFlowProjectionStatus =
        stateFromCompletion(completion, flowSeq) ?? flowWeak ?? 'phantom';

      const blockers = unique([
        ...scenario.runtimeProbes
          .filter((probeId) => !runtimeProbes.some((probe) => probe.probeId === probeId))
          .map((probeId) => `Runtime probe ${probeId} is still missing from live evidence.`),
        ...scenario.runtimeProbes
          .map((probeId) => runtimeProbes.find((probe) => probe.probeId === probeId))
          .filter((probe): probe is NonNullable<typeof probe> => Boolean(probe))
          .filter((probe) => probe.status !== 'passed')
          .map((probe) => probe.summary || `Runtime probe ${probe.probeId} is not passing.`),
        ...experienceSurfaces.flatMap((surface) => surface.blockers.slice(0, 2)),
        ...experienceRuns
          .filter((flow) => flow.status !== flowBest)
          .map((flow) => flow.blockingReasons[0] || `${flow.name} remains ${flow.status}.`),
      ])
        .filter(Boolean)
        .slice(0, 6);

      return {
        id: scenario.id,
        name: humanize(scenario.id),
        status,
        truthMode: chooseTruthMode([
          ...experienceSurfaces.map((surface) => surface.truthMode),
          ...experienceRuns.map((flow) => flow.truthMode),
          completion === 0 ? 'aspirational' : 'inferred',
        ]),
        completion,
        routePatterns: unique(scenario.routePatterns).sort(),
        capabilityIds: experienceUnits.sort(),
        flowIds: unique([...scenario.flowSpecs, ...experienceRuns.map((flow) => flow.id)]).sort(),
        blockers,
        expectedOutcome: compact(
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
    realSurfaces: surfaces.filter((surface) => surface.status === capSeq[0]).length,
    partialSurfaces: surfaces.filter((surface) => surface.status === capSeq[1]).length,
    latentSurfaces: surfaces.filter((surface) => surface.status === capSeq[2]).length,
    phantomSurfaces: surfaces.filter((surface) => surface.status === capWeak).length,
    productFacingWeakUnits,
    systemWeakUnits,
    criticalGaps: surfaces
      .filter(
        (surface) =>
          surface.status !== capBest &&
          (surface.declaredByManifest || surface.critical || surface.routePatterns.length > 1),
      )
      .slice(0, 8)
      .map(
        (surface) =>
          `${surface.name}: ${surface.blockers[0] || `${surface.status} surface with incomplete materialization.`}`,
      ),
  };

  const topBlockers = unique([
    ...(input.externalSignalState?.signals || [])
      .filter((signal) => signal.impactScore >= 0.75)
      .slice(0, 5)
      .map((signal) => `${signal.source}/${signal.type}: ${signal.summary}`),
    ...promiseToProductionDelta.criticalGaps,
    ...input.parityGaps.gaps.slice(0, 5).map((gap) => `${gap.title}: ${gap.summary}`),
    ...experiences
      .filter((experience) => experience.status !== flowBest)
      .slice(0, 5)
      .map(
        (experience) =>
          `${experience.name}: ${experience.blockers[0] || `${experience.status} experience.`}`,
      ),
    ...scopedUnits
      .filter(
        (capability) => capability.status === capWeak || capability.highSeverityIssueCount > 0,
      )
      .slice(0, 5)
      .map((capability) =>
        capability.highSeverityIssueCount > 0
          ? `${capability.name}: ${capability.highSeverityIssueCount} HIGH Codacy issue(s).`
          : `${capability.name}: capability still phantom.`,
      ),
  ]).slice(0, 10);

  const evidenceBasis = summarizeEvidenceBasis(scopedUnits, input.flowProjection.flows);

  const surfaceNames = surfaces
    .filter((surface) => isMaterializedState(surface.status, capSeq))
    .slice(0, 8)
    .map((surface) => surface.name);

  const inferredProductIdentity =
    surfaceNames.length > 0
      ? `If the currently connected structures converge, the product resolves toward a unified operational platform centered on ${unique(surfaceNames).join(', ')}.`
      : 'The current repository still exposes too little converged surface area to infer a stable product identity.';

  return {
    generatedAt: new Date().toISOString(),
    truthMode: 'aspirational',
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
    topBlockers,
  };
}
