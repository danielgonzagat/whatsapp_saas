import type {
  PulseCodebaseTruth,
  PulseManifest,
  PulseManifestModule,
  PulseScopeModuleAggregate,
  PulseScopeState,
  PulseResolvedManifest,
  PulseResolvedModule,
} from './types';
import {
  normalizeText,
  slugify,
  tokenize,
  unique,
  titleCase,
  matchesOverride,
  buildFlowGroups,
  synthesizeScenarioFlowGroups,
} from './resolved-manifest.builders';

function getActiveModules(manifest: PulseManifest | null): PulseManifestModule[] {
  return manifest?.modules || [];
}

function getLegacyModules(manifest: PulseManifest | null): PulseManifestModule[] {
  return manifest?.legacyModules || [];
}

function findManifestModule(
  entries: PulseManifestModule[],
  candidates: string[],
): PulseManifestModule | null {
  const normalizedCandidates = candidates.map(normalizeText).filter(Boolean);
  for (const entry of entries) {
    const normalizedEntry = normalizeText(entry.name);
    if (normalizedCandidates.includes(normalizedEntry)) {
      return entry;
    }
  }
  return null;
}

function buildModuleCandidates(
  module: PulseCodebaseTruth['discoveredModules'][number],
  manifest: PulseManifest | null,
): string[] {
  const overrides = manifest?.overrides || {};
  const explicitAlias =
    overrides.moduleAliases?.[module.key] || overrides.moduleAliases?.[module.name] || null;
  return unique(
    [
      module.name,
      module.declaredModule || '',
      explicitAlias || '',
      titleCase(module.key),
      ...module.routeRoots.map(titleCase),
    ].filter(Boolean),
  );
}

function buildModuleResolution(
  manifest: PulseManifest | null,
  module: PulseCodebaseTruth['discoveredModules'][number],
  scopeAggregate: PulseScopeModuleAggregate | null,
): PulseResolvedModule {
  const overrides = manifest?.overrides || {};
  const candidates = buildModuleCandidates(module, manifest);
  const manualModule = findManifestModule(getActiveModules(manifest), candidates);
  const legacyModule = findManifestModule(getLegacyModules(manifest), candidates);
  const excluded =
    matchesOverride(module.key, overrides.excludedModules || []) ||
    matchesOverride(module.name, overrides.excludedModules || []);
  const criticalOverride =
    matchesOverride(module.key, overrides.criticalModules || []) ||
    matchesOverride(module.name, overrides.criticalModules || []);
  const internalOverride =
    matchesOverride(module.key, overrides.internalModules || []) ||
    matchesOverride(module.name, overrides.internalModules || []);

  const moduleKind = internalOverride || !module.userFacing ? 'internal' : 'user_facing';
  const resolution = excluded ? 'excluded' : manualModule ? 'matched' : 'derived';
  const canonicalName = manualModule?.name || legacyModule?.name || module.name;
  const canonicalKey = slugify(canonicalName) || module.key;
  const coverageStatus = excluded
    ? 'excluded'
    : manualModule
      ? 'declared_and_discovered'
      : 'discovered_only';
  const critical =
    !excluded &&
    (criticalOverride ||
      Boolean(manualModule?.critical) ||
      ((scopeAggregate?.runtimeCriticalFileCount || 0) > 0 &&
        ((scopeAggregate?.userFacingFileCount || 0) > 0 || moduleKind === 'user_facing')));
  const aliases = unique(
    [
      module.name,
      manualModule?.name || '',
      legacyModule?.name || '',
      ...module.routeRoots.map(titleCase),
    ].filter(Boolean),
  );

  let notes = module.notes;
  if (manualModule) {
    notes = `${notes}; source="${manualModule.name}".`;
  } else if (legacyModule) {
    notes = `${notes}; legacy source="${legacyModule.name}".`;
  } else if (resolution === 'derived') {
    notes = `${notes}; derived directly from codebase truth.`;
  }
  if (resolution === 'excluded') {
    notes = `${notes}; excluded by manifest override.`;
  }

  return {
    key: canonicalKey,
    name: canonicalName,
    canonicalName,
    aliases,
    routeRoots: module.routeRoots,
    groups: module.groups,
    moduleKind,
    userFacing: moduleKind === 'user_facing',
    shellComplexity: module.shellComplexity,
    state: moduleKind === 'internal' ? 'INTERNAL' : module.state,
    critical,
    resolution,
    sourceModule: manualModule?.name || null,
    legacySource: legacyModule?.name || null,
    coverageStatus,
    declaredByManifest: Boolean(manualModule),
    discoveredFileCount: scopeAggregate?.fileCount || 0,
    codacyIssueCount: scopeAggregate?.observedCodacyIssueCount || 0,
    highSeverityIssueCount: scopeAggregate?.highSeverityIssueCount || 0,
    protectedByGovernance: (scopeAggregate?.humanRequiredFileCount || 0) > 0,
    surfaceKinds: scopeAggregate?.surfaces || [],
    pageCount: module.pageCount,
    totalInteractions: module.totalInteractions,
    backendBoundInteractions: module.backendBoundInteractions,
    persistedInteractions: module.persistedInteractions,
    backedDataSources: module.backedDataSources,
    notes,
  };
}

function mergeResolvedModules(modules: PulseResolvedModule[]): PulseResolvedModule[] {
  const merged = new Map<string, PulseResolvedModule>();

  for (const module of modules) {
    const existing = merged.get(module.key);
    if (!existing) {
      merged.set(module.key, {
        ...module,
        aliases: unique(module.aliases),
        routeRoots: unique(module.routeRoots),
        groups: unique(module.groups),
        surfaceKinds: unique(module.surfaceKinds),
      });
      continue;
    }
    merged.set(module.key, {
      ...existing,
      name: existing.declaredByManifest ? existing.name : module.name,
      canonicalName: existing.declaredByManifest ? existing.canonicalName : module.canonicalName,
      aliases: unique([...existing.aliases, ...module.aliases]),
      routeRoots: unique([...existing.routeRoots, ...module.routeRoots]),
      groups: unique([...existing.groups, ...module.groups]),
      userFacing: existing.userFacing || module.userFacing,
      critical: existing.critical || module.critical,
      declaredByManifest: existing.declaredByManifest || module.declaredByManifest,
      protectedByGovernance: existing.protectedByGovernance || module.protectedByGovernance,
      resolution:
        existing.resolution === 'matched' || module.resolution === 'matched'
          ? 'matched'
          : existing.resolution,
      coverageStatus:
        existing.coverageStatus === 'declared_and_discovered' ||
        module.coverageStatus === 'declared_and_discovered'
          ? 'declared_and_discovered'
          : existing.coverageStatus === 'discovered_only' ||
              module.coverageStatus === 'discovered_only'
            ? 'discovered_only'
            : existing.coverageStatus,
      discoveredFileCount: existing.discoveredFileCount + module.discoveredFileCount,
      codacyIssueCount: existing.codacyIssueCount + module.codacyIssueCount,
      highSeverityIssueCount: existing.highSeverityIssueCount + module.highSeverityIssueCount,
      surfaceKinds: unique([...existing.surfaceKinds, ...module.surfaceKinds]),
      pageCount: existing.pageCount + module.pageCount,
      totalInteractions: existing.totalInteractions + module.totalInteractions,
      backendBoundInteractions: existing.backendBoundInteractions + module.backendBoundInteractions,
      persistedInteractions: existing.persistedInteractions + module.persistedInteractions,
      backedDataSources: existing.backedDataSources + module.backedDataSources,
      notes: unique([existing.notes, module.notes].filter(Boolean)).join(' | '),
    });
  }
  return [...merged.values()].sort((left, right) => left.key.localeCompare(right.key));
}

/** Build resolved manifest. */
export function buildResolvedManifest(
  manifest: PulseManifest | null,
  manifestPath: string | null,
  codebaseTruth: PulseCodebaseTruth,
  scopeState?: PulseScopeState | null,
): PulseResolvedManifest {
  const scopeAggregateMap = new Map(
    (scopeState?.moduleAggregates || []).map(
      (aggregate) => [aggregate.moduleKey, aggregate] as const,
    ),
  );
  const modules = mergeResolvedModules(
    codebaseTruth.discoveredModules.map((module) =>
      buildModuleResolution(manifest, module, scopeAggregateMap.get(module.key) || null),
    ),
  );
  const criticalModuleKeys = new Set(
    modules.filter((module) => module.critical).map((module) => module.key),
  );
  const resolvedFlowGroups = buildFlowGroups(
    manifest,
    codebaseTruth.discoveredFlows,
    criticalModuleKeys,
  );
  const flowGroups = [
    ...resolvedFlowGroups,
    ...synthesizeScenarioFlowGroups(manifest, codebaseTruth, resolvedFlowGroups),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const matchedModuleNames = new Set(
    modules.map((module) => module.sourceModule).filter((value): value is string => Boolean(value)),
  );
  const orphanManualModules = getActiveModules(manifest)
    .filter((entry) => !matchedModuleNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const legacyManualModules = getLegacyModules(manifest)
    .map((entry) => entry.name)
    .sort();

  const matchedFlowSpecs = new Set(
    flowGroups
      .map((group) => group.matchedFlowSpec)
      .filter((value): value is string => Boolean(value)),
  );
  const orphanFlowSpecs = (manifest?.flowSpecs || [])
    .filter((spec) => !matchedFlowSpecs.has(spec.id))
    .map((spec) => spec.id)
    .sort();

  const unresolvedModules: string[] = [];
  const resolvedModuleKeys = new Set(modules.map((module) => module.key));
  const scopeOnlyModuleCandidates = (scopeState?.moduleAggregates || [])
    .filter(
      (aggregate) =>
        aggregate.userFacingFileCount > 0 && !resolvedModuleKeys.has(aggregate.moduleKey),
    )
    .map((aggregate) => aggregate.moduleKey)
    .sort();
  const humanRequiredModules = modules
    .filter((module) => module.protectedByGovernance)
    .map((module) => module.key)
    .sort();

  const unresolvedFlowGroups = flowGroups
    .filter(
      (group) =>
        group.resolution === 'candidate' &&
        group.flowKind !== 'ops_internal' &&
        group.flowKind !== 'legacy_noise',
    )
    .map((group) => group.id)
    .sort();

  const excludedModules = modules
    .filter((module) => module.resolution === 'excluded')
    .map((module) => module.name)
    .sort();
  const excludedFlowGroups = flowGroups
    .filter((group) => group.resolution === 'excluded')
    .map((group) => group.id)
    .sort();
  const groupedFlowGroups = flowGroups
    .filter((group) => group.resolution === 'grouped')
    .map((group) => group.id)
    .sort();
  const sharedCapabilityGroups = flowGroups
    .filter((group) => group.flowKind === 'shared_capability')
    .map((group) => group.id)
    .sort();
  const opsInternalFlowGroups = flowGroups
    .filter((group) => group.flowKind === 'ops_internal')
    .map((group) => group.id)
    .sort();
  const legacyNoiseFlowGroups = flowGroups
    .filter((group) => group.flowKind === 'legacy_noise')
    .map((group) => group.id)
    .sort();

  const blockerCount =
    unresolvedModules.length + orphanFlowSpecs.length + unresolvedFlowGroups.length;
  const warningCount =
    excludedModules.length +
    excludedFlowGroups.length +
    humanRequiredModules.length +
    scopeOnlyModuleCandidates.length +
    orphanManualModules.length +
    legacyManualModules.length +
    opsInternalFlowGroups.length +
    legacyNoiseFlowGroups.length;

  return {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: manifestPath,
    projectId: manifest?.projectId || 'unknown',
    projectName: manifest?.projectName || 'unknown',
    systemType: manifest?.systemType || 'unknown',
    supportedStacks: manifest?.supportedStacks || [],
    surfaces: manifest?.surfaces || [],
    criticalDomains: modules
      .filter((module) => module.critical && module.moduleKind === 'user_facing')
      .map((module) => module.key)
      .sort(),
    modules,
    flowGroups,
    actorProfiles: manifest?.actorProfiles || [],
    scenarioSpecs: manifest?.scenarioSpecs || [],
    flowSpecs: manifest?.flowSpecs || [],
    invariantSpecs: manifest?.invariantSpecs || [],
    temporaryAcceptances: manifest?.temporaryAcceptances || [],
    certificationTiers: manifest?.certificationTiers || [],
    finalReadinessCriteria: manifest?.finalReadinessCriteria || {
      requireAllTiersPass: true,
      requireNoAcceptedCriticalFlows: true,
      requireNoAcceptedCriticalScenarios: true,
      requireWorldStateConvergence: true,
    },
    securityRequirements: manifest?.securityRequirements || [],
    recoveryRequirements: manifest?.recoveryRequirements || [],
    slos: manifest?.slos || {},
    summary: {
      totalModules: modules.length,
      resolvedModules: modules.filter((module) => module.resolution !== 'excluded').length,
      unresolvedModules: unresolvedModules.length,
      scopeOnlyModuleCandidates: scopeOnlyModuleCandidates.length,
      humanRequiredModules: humanRequiredModules.length,
      totalFlowGroups: flowGroups.length,
      resolvedFlowGroups: flowGroups.filter((group) => group.resolution !== 'candidate').length,
      unresolvedFlowGroups: unresolvedFlowGroups.length,
      orphanManualModules: orphanManualModules.length,
      orphanFlowSpecs: orphanFlowSpecs.length,
      excludedModules: excludedModules.length,
      excludedFlowGroups: excludedFlowGroups.length,
      groupedFlowGroups: groupedFlowGroups.length,
      sharedCapabilityGroups: sharedCapabilityGroups.length,
      opsInternalFlowGroups: opsInternalFlowGroups.length,
      legacyNoiseFlowGroups: legacyNoiseFlowGroups.length,
      legacyManualModules: legacyManualModules.length,
    },
    diagnostics: {
      unresolvedModules,
      orphanManualModules,
      scopeOnlyModuleCandidates,
      humanRequiredModules,
      unresolvedFlowGroups,
      orphanFlowSpecs,
      excludedModules,
      excludedFlowGroups,
      legacyManualModules,
      groupedFlowGroups,
      sharedCapabilityGroups,
      opsInternalFlowGroups,
      legacyNoiseFlowGroups,
      blockerCount,
      warningCount,
    },
  };
}
