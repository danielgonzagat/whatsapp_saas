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

const CAPABILITY_STATUS_SCORE: Record<PulseCapabilityStatus, number> = {
  real: 1,
  partial: 0.65,
  latent: 0.35,
  phantom: 0,
};

const FLOW_STATUS_SCORE: Record<PulseFlowProjectionStatus, number> = {
  real: 1,
  partial: 0.65,
  latent: 0.35,
  phantom: 0,
};

function getProjectedReadiness(
  capabilityRatio: number,
  flowRatio: number,
  highIssues: number,
): 'red' | 'yellow' | 'green' {
  if (capabilityRatio >= 0.8 && flowRatio >= 0.8 && highIssues === 0) {
    return 'green';
  }
  if (capabilityRatio >= 0.45 || flowRatio >= 0.45) {
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
  capabilityStatuses: PulseCapabilityStatus[],
  flowStatuses: PulseFlowProjectionStatus[],
): PulseCapabilityStatus {
  const all = [...capabilityStatuses, ...flowStatuses];
  if (all.length === 0) {
    return 'phantom';
  }
  if (all.includes('real')) {
    return all.includes('phantom') ? 'partial' : 'real';
  }
  if (all.includes('partial')) {
    return 'partial';
  }
  if (all.includes('latent')) {
    return 'latent';
  }
  return 'phantom';
}

function moduleFamilies(
  moduleEntry: BuildProductVisionInput['resolvedManifest']['modules'][number],
): string[] {
  return deriveStructuralFamilies([
    moduleEntry.key,
    moduleEntry.name,
    moduleEntry.canonicalName,
    ...moduleEntry.aliases,
    ...moduleEntry.routeRoots,
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

  for (const moduleEntry of modules) {
    const key = slugifyStructural(moduleEntry.key || moduleEntry.canonicalName || moduleEntry.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...moduleEntry,
        key,
        aliases: unique(moduleEntry.aliases),
        routeRoots: unique(moduleEntry.routeRoots),
        groups: unique(moduleEntry.groups),
        surfaceKinds: unique(moduleEntry.surfaceKinds),
      });
      continue;
    }

    merged.set(key, {
      ...existing,
      name: existing.declaredByManifest ? existing.name : moduleEntry.name,
      canonicalName: existing.declaredByManifest
        ? existing.canonicalName
        : moduleEntry.canonicalName,
      aliases: unique([...existing.aliases, ...moduleEntry.aliases]),
      routeRoots: unique([...existing.routeRoots, ...moduleEntry.routeRoots]),
      groups: unique([...existing.groups, ...moduleEntry.groups]),
      userFacing: existing.userFacing || moduleEntry.userFacing,
      critical: existing.critical || moduleEntry.critical,
      declaredByManifest: existing.declaredByManifest || moduleEntry.declaredByManifest,
      protectedByGovernance: existing.protectedByGovernance || moduleEntry.protectedByGovernance,
      coverageStatus:
        existing.coverageStatus === 'declared_and_discovered' ||
        moduleEntry.coverageStatus === 'declared_and_discovered'
          ? 'declared_and_discovered'
          : existing.coverageStatus === 'discovered_only' ||
              moduleEntry.coverageStatus === 'discovered_only'
            ? 'discovered_only'
            : existing.coverageStatus,
      discoveredFileCount: existing.discoveredFileCount + moduleEntry.discoveredFileCount,
      codacyIssueCount: existing.codacyIssueCount + moduleEntry.codacyIssueCount,
      highSeverityIssueCount: existing.highSeverityIssueCount + moduleEntry.highSeverityIssueCount,
      surfaceKinds: unique([...existing.surfaceKinds, ...moduleEntry.surfaceKinds]),
      pageCount: existing.pageCount + moduleEntry.pageCount,
      totalInteractions: existing.totalInteractions + moduleEntry.totalInteractions,
      backendBoundInteractions:
        existing.backendBoundInteractions + moduleEntry.backendBoundInteractions,
      persistedInteractions: existing.persistedInteractions + moduleEntry.persistedInteractions,
      backedDataSources: existing.backedDataSources + moduleEntry.backedDataSources,
      notes: unique([existing.notes, moduleEntry.notes].filter(Boolean)).join(' | '),
    });
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function capabilityMatchesModule(
  capability: PulseCapability,
  moduleEntry: BuildProductVisionInput['resolvedManifest']['modules'][number],
): boolean {
  return familiesOverlap(capabilityFamilies(capability), moduleFamilies(moduleEntry));
}

function flowMatchesModule(
  flow: PulseFlowProjectionItem,
  moduleEntry: BuildProductVisionInput['resolvedManifest']['modules'][number],
  capabilityIds: string[],
): boolean {
  if (flow.capabilityIds.some((capabilityId) => capabilityIds.includes(capabilityId))) {
    return true;
  }

  return familiesOverlap(flowFamilies(flow), moduleFamilies(moduleEntry));
}

function buildSurfaceBlockers(
  capabilityMatches: PulseCapability[],
  flowMatches: PulseFlowProjectionItem[],
  moduleEntry: BuildProductVisionInput['resolvedManifest']['modules'][number],
): string[] {
  return unique([
    ...capabilityMatches
      .filter((capability) => capability.status !== 'real' || capability.highSeverityIssueCount > 0)
      .map(
        (capability) =>
          capability.blockingReasons[0] || `${capability.name} remains ${capability.status}.`,
      ),
    ...flowMatches
      .filter((flow) => flow.status !== 'real')
      .map((flow) => flow.blockingReasons[0] || `${flow.name} remains ${flow.status}.`),
    moduleEntry.coverageStatus === 'declared_only'
      ? `${moduleEntry.name} is declared in the promise model but has no discovered implementation yet.`
      : '',
  ])
    .filter(Boolean)
    .slice(0, 6);
}

function buildCapabilityCompletion(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
): number {
  const scores = [
    ...capabilities.map((capability) => CAPABILITY_STATUS_SCORE[capability.status]),
    ...flows.map((flow) => FLOW_STATUS_SCORE[flow.status]),
  ];
  if (scores.length === 0) {
    return 0;
  }
  return clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

/** Build projected product vision from current capability and flow states. */
export function buildProductVision(input: BuildProductVisionInput): PulseProductVision {
  const productCapabilities = input.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || capability.routePatterns.length > 0,
  );
  const scopedCapabilities =
    productCapabilities.length > 0 ? productCapabilities : input.capabilityState.capabilities;
  const totalCapabilities = scopedCapabilities.length || 1;
  const totalFlows = input.flowProjection.summary.totalFlows || 1;
  const realLikeCapabilities = scopedCapabilities.filter(
    (capability) => capability.status === 'real' || capability.status === 'partial',
  ).length;
  const realLikeFlows =
    input.flowProjection.summary.realFlows + input.flowProjection.summary.partialFlows;
  const capabilityRatio = ratio(realLikeCapabilities, totalCapabilities);
  const flowRatio = ratio(realLikeFlows, totalFlows);
  const readiness = getProjectedReadiness(
    capabilityRatio,
    flowRatio,
    input.codacyEvidence.summary.highIssues,
  );
  const productFacingPhantomCapabilities = scopedCapabilities.filter(
    (capability) => capability.status === 'phantom',
  ).length;
  const systemPhantomCapabilities = input.capabilityState.summary.phantomCapabilities;

  const mergedModules = mergeModules(input.resolvedManifest.modules);
  const surfaces = mergedModules
    .filter((moduleEntry) => moduleEntry.userFacing && moduleEntry.coverageStatus !== 'excluded')
    .map((moduleEntry) => {
      const capabilityMatches = input.capabilityState.capabilities.filter((capability) =>
        capabilityMatchesModule(capability, moduleEntry),
      );
      const capabilityIds = capabilityMatches.map((capability) => capability.id);
      const flowMatches = input.flowProjection.flows.filter((flow) =>
        flowMatchesModule(flow, moduleEntry, capabilityIds),
      );
      const status = bestStatus(
        capabilityMatches.map((capability) => capability.status),
        flowMatches.map((flow) => flow.status),
      );
      const blockers = buildSurfaceBlockers(capabilityMatches, flowMatches, moduleEntry);
      return {
        id: `surface:${moduleEntry.key}`,
        name: moduleEntry.name,
        declaredByManifest: moduleEntry.declaredByManifest,
        critical: moduleEntry.critical,
        status,
        truthMode: chooseTruthMode([
          ...capabilityMatches.map((capability) => capability.truthMode),
          ...flowMatches.map((flow) => flow.truthMode),
          capabilityMatches.length === 0 && flowMatches.length === 0 ? 'aspirational' : 'inferred',
        ]),
        completion: buildCapabilityCompletion(capabilityMatches, flowMatches),
        routePatterns: unique([
          ...moduleEntry.routeRoots,
          ...capabilityMatches.flatMap((capability) => capability.routePatterns),
          ...flowMatches.flatMap((flow) => flow.routePatterns),
        ]).sort(),
        capabilityIds: capabilityIds.sort(),
        flowIds: flowMatches.map((flow) => flow.id).sort(),
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
        return CAPABILITY_STATUS_SCORE[right.status] - CAPABILITY_STATUS_SCORE[left.status];
      }
      if (left.completion !== right.completion) {
        return right.completion - left.completion;
      }
      return left.name.localeCompare(right.name);
    });

  const runtimeProbes = input.certification.evidenceSummary.runtime.probes || [];
  const flowResults = input.certification.evidenceSummary.flows.results || [];
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
      const experienceCapabilities = unique(
        experienceSurfaces.flatMap((surface) => surface.capabilityIds),
      );
      const experienceFlows = input.flowProjection.flows.filter((flow) => {
        const flowStructuralFamilies = deriveStructuralFamilies([
          flow.id,
          flow.name,
          ...flow.routePatterns,
        ]);
        const routeMatch = familiesOverlap(scenarioFamilies, flowStructuralFamilies);
        const capabilityMatch = flow.capabilityIds.some((capabilityId) =>
          experienceCapabilities.includes(capabilityId),
        );
        const declaredFlowMatch = familiesOverlap(scenario.flowSpecs, [flow.id, flow.name]);
        return routeMatch || capabilityMatch || declaredFlowMatch;
      });
      const executionStatusScores = scenario.flowSpecs.map((flowSpec) => {
        const result = flowResults.find((entry) => entry.flowId === flowSpec);
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
      const flowScore =
        experienceFlows.length === 0
          ? 0
          : clamp(
              experienceFlows.reduce((sum, flow) => sum + FLOW_STATUS_SCORE[flow.status], 0) /
                experienceFlows.length,
            );
      const completion = clamp(
        surfaceScore * 0.45 +
          flowScore * 0.35 +
          (executionStatusScores.length > 0
            ? executionStatusScores.reduce((sum, value) => sum + value, 0) /
              executionStatusScores.length
            : 0) *
            0.15 +
          runtimeScore * 0.05,
      );
      const status: PulseFlowProjectionStatus =
        completion >= 0.85
          ? 'real'
          : completion >= 0.5
            ? 'partial'
            : completion > 0
              ? 'latent'
              : 'phantom';

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
        ...experienceFlows
          .filter((flow) => flow.status !== 'real')
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
          ...experienceFlows.map((flow) => flow.truthMode),
          completion === 0 ? 'aspirational' : 'inferred',
        ]),
        completion,
        routePatterns: unique(scenario.routePatterns).sort(),
        capabilityIds: experienceCapabilities.sort(),
        flowIds: unique([...scenario.flowSpecs, ...experienceFlows.map((flow) => flow.id)]).sort(),
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
    realSurfaces: surfaces.filter((surface) => surface.status === 'real').length,
    partialSurfaces: surfaces.filter((surface) => surface.status === 'partial').length,
    latentSurfaces: surfaces.filter((surface) => surface.status === 'latent').length,
    phantomSurfaces: surfaces.filter((surface) => surface.status === 'phantom').length,
    productFacingPhantomCapabilities,
    systemPhantomCapabilities,
    criticalGaps: surfaces
      .filter(
        (surface) =>
          surface.status !== 'real' &&
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
      .filter((experience) => experience.status !== 'real')
      .slice(0, 5)
      .map(
        (experience) =>
          `${experience.name}: ${experience.blockers[0] || `${experience.status} experience.`}`,
      ),
    ...scopedCapabilities
      .filter(
        (capability) => capability.status === 'phantom' || capability.highSeverityIssueCount > 0,
      )
      .slice(0, 5)
      .map((capability) =>
        capability.highSeverityIssueCount > 0
          ? `${capability.name}: ${capability.highSeverityIssueCount} HIGH Codacy issue(s).`
          : `${capability.name}: capability still phantom.`,
      ),
  ]).slice(0, 10);

  const evidenceBasis = summarizeEvidenceBasis(scopedCapabilities, input.flowProjection.flows);

  const surfaceNames = surfaces
    .filter((surface) => surface.status === 'real' || surface.status === 'partial')
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
      capabilityRealnessRatio: capabilityRatio,
      flowRealnessRatio: flowRatio,
      projectedProductionReadiness: readiness,
    },
    currentStateSummary: `The current product-facing system materializes ${scopedCapabilities.filter((capability) => capability.status === 'real').length} real capability(ies), ${scopedCapabilities.filter((capability) => capability.status === 'partial').length} partial capability(ies), ${scopedCapabilities.filter((capability) => capability.status === 'latent').length} latent capability(ies), and ${productFacingPhantomCapabilities} product-facing phantom capability(ies). System-wide phantom capability count is ${systemPhantomCapabilities}.`,
    projectedProductSummary: `If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to ${realLikeCapabilities}/${totalCapabilities} capability(ies) and ${realLikeFlows}/${totalFlows} flow(s) at least partially real, with readiness ${readiness}.`,
    inferredProductIdentity,
    distanceSummary: `Distance to projected readiness is driven by ${productFacingPhantomCapabilities} product-facing phantom capability(ies), ${systemPhantomCapabilities} system-wide phantom capability(ies), ${input.flowProjection.summary.phantomFlows} phantom flow(s), ${input.parityGaps.summary.totalGaps} structural parity gap(s), and ${input.codacyEvidence.summary.highIssues} HIGH Codacy issue(s).`,
    promiseToProductionDelta,
    externalSignalSummary: input.externalSignalState?.summary,
    surfaces,
    experiences,
    topBlockers,
  };
}
