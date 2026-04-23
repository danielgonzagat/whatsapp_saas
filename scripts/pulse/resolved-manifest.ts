import type {
  PulseCodebaseTruth,
  PulseDiscoveredFlowCandidate,
  PulseManifest,
  PulseManifestFlowSpec,
  PulseManifestModule,
  PulseScopeModuleAggregate,
  PulseScopeState,
  PulseResolvedFlowGroup,
  PulseResolvedFlowKind,
  PulseResolvedManifest,
  PulseResolvedModule,
} from './types';

interface SemanticFlowDescriptor {
  id: string;
  canonicalName: string;
  flowKind: PulseResolvedFlowKind;
  aliases: string[];
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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

function matchesOverride(candidate: string, values: string[]): boolean {
  const normalized = normalizeText(candidate);
  return values.some((value) => normalizeText(value) === normalized);
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

function getPath(flow: PulseDiscoveredFlowCandidate): string {
  return (flow.backendRoute || flow.endpoint || '').toLowerCase();
}

function getHaystack(flow: PulseDiscoveredFlowCandidate): string {
  return normalizeText(
    [
      flow.id,
      flow.moduleKey,
      flow.moduleName,
      flow.pageRoute,
      flow.elementLabel,
      flow.endpoint,
      flow.backendRoute || '',
    ].join(' '),
  );
}

function inferAction(flow: PulseDiscoveredFlowCandidate): string {
  const haystack = getHaystack(flow);
  if (haystack.includes('reply')) {
    return 'reply';
  }
  if (haystack.includes('send')) {
    return 'send';
  }
  if (haystack.includes('toggle')) {
    return 'toggle';
  }
  if (haystack.includes('connect')) {
    return 'connect';
  }
  if (haystack.includes('default')) {
    return 'default';
  }
  if (haystack.includes('approve')) {
    return 'approve';
  }
  if (haystack.includes('start')) {
    return 'start';
  }
  if (haystack.includes('sync')) {
    return 'sync';
  }
  if (haystack.includes('generate')) {
    return 'generate';
  }
  if (haystack.includes('save')) {
    return 'save';
  }

  const method = flow.httpMethod.toUpperCase();
  if (method === 'DELETE') {
    return 'delete';
  }
  if (method === 'PUT' || method === 'PATCH') {
    return 'update';
  }
  return 'create';
}

function getEndpointSegments(flow: PulseDiscoveredFlowCandidate): string[] {
  const source = getPath(flow)
    .replace(/^\/+/g, '')
    .split('/')
    .map((part) => part.replace(/^:+/, ''))
    .filter(Boolean)
    .filter((part) => !['api', 'v1', 'kloel'].includes(part));

  return source.filter(
    (part) =>
      !/^(id|workspaceid|orderid|planid|productid|campaignid|conversationid|paymentmethodid|studentid|phone|tag|slug)$/i.test(
        part,
      ),
  );
}

function inferResourceFamily(flow: PulseDiscoveredFlowCandidate): string {
  const segments = getEndpointSegments(flow)
    .filter((segment) => normalizeText(segment) !== flow.moduleKey)
    .filter(
      (segment) =>
        ![
          'send',
          'reply',
          'toggle',
          'connect',
          'default',
          'approve',
          'start',
          'sync',
          'generate',
          'save',
        ].includes(normalizeText(segment)),
    );
  const selected = segments.slice(0, 2).map((segment) => slugify(segment));
  return selected.length > 0 ? selected.join('-') : 'flow';
}

function isLegacyNoise(flow: PulseDiscoveredFlowCandidate): boolean {
  const haystack = getHaystack(flow);
  const path = getPath(flow);
  return (
    haystack.includes('fontfamily') ||
    haystack.includes('fontsize') ||
    haystack.includes('borderradius') ||
    path.includes('param)}') ||
    path.includes('…') ||
    path.endsWith('/flow')
  );
}

function inferFlowKind(
  flow: PulseDiscoveredFlowCandidate,
  action: string,
  family: string,
): PulseResolvedFlowKind {
  const haystack = getHaystack(flow);
  const path = getPath(flow);

  if (
    flow.moduleKey === 'e2e' ||
    haystack.includes('spec ') ||
    haystack.includes(' test ') ||
    path.includes('/e2e/')
  ) {
    return 'ops_internal';
  }

  if (isLegacyNoise(flow)) {
    return 'legacy_noise';
  }

  if (!flow.connected && !flow.persistent && family === 'flow') {
    return 'legacy_noise';
  }

  if (
    ['reply', 'send', 'toggle', 'connect', 'default', 'approve', 'start', 'sync'].includes(
      action,
    ) &&
    (flow.connected || flow.persistent)
  ) {
    return 'shared_capability';
  }

  return 'feature_flow';
}

function buildDescriptorId(
  flow: PulseDiscoveredFlowCandidate,
  flowKind: PulseResolvedFlowKind,
  family: string,
  action: string,
): string {
  const moduleKey = slugify(flow.moduleKey || 'module');

  if (flowKind === 'ops_internal') {
    return `ops-${moduleKey}-${family}-${action}`;
  }
  if (flowKind === 'legacy_noise') {
    return `legacy-${moduleKey}-${family}-${action}`;
  }
  if (flowKind === 'shared_capability') {
    return `shared-${family}-${action}`;
  }
  if (['create', 'update', 'delete'].includes(action) && family !== 'flow') {
    return `${moduleKey}-${family}-management`;
  }
  return `${moduleKey}-${family}-${action}`;
}

function buildDescriptorName(
  flow: PulseDiscoveredFlowCandidate,
  flowKind: PulseResolvedFlowKind,
  family: string,
  action: string,
): string {
  const moduleName = titleCase(flow.moduleName || flow.moduleKey || 'Module');
  const familyName = titleCase(family);
  const actionName = titleCase(action);

  if (flowKind === 'ops_internal') {
    return `${moduleName} Ops Harness`;
  }
  if (flowKind === 'legacy_noise') {
    return `${moduleName} Legacy Noise`;
  }
  if (flowKind === 'shared_capability') {
    return `Shared ${familyName} ${actionName}`;
  }
  if (['create', 'update', 'delete'].includes(action) && family !== 'flow') {
    return `${moduleName} ${familyName} Management`;
  }
  return `${moduleName} ${familyName} ${actionName}`;
}

function describeFlow(flow: PulseDiscoveredFlowCandidate): SemanticFlowDescriptor {
  const action = inferAction(flow);
  const family = inferResourceFamily(flow);
  const flowKind = inferFlowKind(flow, action, family);

  return {
    id: buildDescriptorId(flow, flowKind, family, action),
    canonicalName: buildDescriptorName(flow, flowKind, family, action),
    flowKind,
    aliases: unique([
      flow.id,
      `${family}-${action}`,
      flow.endpoint,
      flow.backendRoute || '',
    ]).filter(Boolean),
  };
}

function inferFlowSpecMatch(
  manifest: PulseManifest | null,
  group: PulseResolvedFlowGroup,
): string | null {
  if (!manifest) {
    return null;
  }

  const overrides = manifest.overrides || {};
  if (overrides.flowAliases?.[group.id]) {
    return overrides.flowAliases[group.id];
  }
  if (overrides.flowAliases?.[group.canonicalName]) {
    return overrides.flowAliases[group.canonicalName];
  }

  const haystack = normalizeText(
    [
      group.id,
      group.canonicalName,
      ...group.aliases,
      ...group.pageRoutes,
      ...group.endpoints,
      ...group.backendRoutes,
      ...group.moduleKeys,
      ...group.moduleNames,
    ].join(' '),
  );
  const groupTokens = new Set(tokenize(haystack));
  let bestMatch: { id: string; score: number } | null = null;

  for (const spec of manifest.flowSpecs) {
    const specHaystack = normalizeText(
      [spec.id, spec.surface, spec.runner, spec.oracle, spec.notes, ...spec.preconditions].join(
        ' ',
      ),
    );
    const specTokens = tokenize(specHaystack);
    const overlap = specTokens.filter((token) => groupTokens.has(token));
    const actionOverlap = group.actions.filter((action) =>
      specHaystack.includes(normalizeText(action)),
    );
    const surfaceOverlap = group.moduleKeys.some(
      (key) => normalizeText(spec.surface) === normalizeText(key),
    );
    const score = overlap.length + actionOverlap.length * 2 + (surfaceOverlap ? 2 : 0);

    if (score <= 0) {
      continue;
    }
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: spec.id, score };
    }
  }

  return bestMatch?.id || null;
}

function matchesScenarioRoute(route: string, pattern: string): boolean {
  if (!route || !pattern) {
    return false;
  }

  if (route === pattern) {
    return true;
  }

  const dynamicIndex = pattern.indexOf('[');
  const staticPrefix = dynamicIndex >= 0 ? pattern.slice(0, dynamicIndex) : pattern;
  if (!staticPrefix || staticPrefix === '/') {
    return route === '/' || route.startsWith('/');
  }

  return route.startsWith(staticPrefix.endsWith('/') ? staticPrefix : `${staticPrefix}/`);
}

function synthesizeScenarioFlowGroups(
  manifest: PulseManifest | null,
  codebaseTruth: PulseCodebaseTruth,
  existingFlowGroups: PulseResolvedFlowGroup[],
): PulseResolvedFlowGroup[] {
  if (!manifest) {
    return [];
  }

  const existingIds = new Set(existingFlowGroups.map((group) => group.id));
  const discoveredModuleByKey = new Map(
    codebaseTruth.discoveredModules.map((module) => [module.key, module] as const),
  );
  const discoveredRoutes = codebaseTruth.pages.map((page) => page.route);
  const flowSpecIds = new Set(manifest.flowSpecs.map((spec) => spec.id));
  const synthesized: PulseResolvedFlowGroup[] = [];

  for (const scenario of manifest.scenarioSpecs) {
    const scenarioModules = scenario.moduleKeys.filter((key) => discoveredModuleByKey.has(key));
    const scenarioRoutes = discoveredRoutes.filter((route) =>
      scenario.routePatterns.some((pattern) => matchesScenarioRoute(route, pattern)),
    );

    if (scenarioModules.length === 0 && scenarioRoutes.length === 0) {
      continue;
    }

    for (const groupId of scenario.flowGroups) {
      if (existingIds.has(groupId)) {
        continue;
      }

      const matchedFlowSpec =
        scenario.flowSpecs.find((flowSpecId) => flowSpecIds.has(flowSpecId)) || null;
      const moduleNames = scenarioModules
        .map((key) => discoveredModuleByKey.get(key)?.name)
        .filter((value): value is string => Boolean(value));
      const primaryModuleKey = scenarioModules[0] || 'shared';
      const primaryModuleName = moduleNames[0] || 'Shared Capability';

      synthesized.push({
        id: groupId,
        canonicalName: titleCase(groupId.replace(/^shared-/, '').replace(/-/g, ' ')),
        aliases: unique([groupId, ...scenario.flowSpecs]).sort(),
        flowKind: 'shared_capability',
        moduleKey: primaryModuleKey,
        moduleName: primaryModuleName,
        moduleKeys: unique(scenarioModules).sort(),
        moduleNames: unique(moduleNames).sort(),
        pageRoutes: unique(
          scenarioRoutes.length > 0 ? scenarioRoutes : scenario.routePatterns,
        ).sort(),
        actions: [],
        endpoints: [],
        backendRoutes: [],
        connected: false,
        persistent: false,
        memberCount: 0,
        critical: scenario.critical || Boolean(matchedFlowSpec),
        resolution: matchedFlowSpec ? 'matched' : 'grouped',
        matchedFlowSpec,
        notes: `Synthesized from scenario "${scenario.id}" because the declared flow group "${groupId}" has matching modules/routes in codebase truth.`,
      });
      existingIds.add(groupId);
    }
  }

  return synthesized;
}

function buildFlowGroups(
  manifest: PulseManifest | null,
  flows: PulseDiscoveredFlowCandidate[],
  criticalModuleKeys: Set<string>,
): PulseResolvedFlowGroup[] {
  const byGroup = new Map<
    string,
    { descriptor: SemanticFlowDescriptor; flows: PulseDiscoveredFlowCandidate[] }
  >();

  for (const flow of flows) {
    const descriptor = describeFlow(flow);
    const current = byGroup.get(descriptor.id);
    if (current) {
      current.flows.push(flow);
      current.descriptor.aliases = unique([...current.descriptor.aliases, ...descriptor.aliases]);
    } else {
      byGroup.set(descriptor.id, {
        descriptor,
        flows: [flow],
      });
    }
  }

  const activeAcceptances = new Set(
    (manifest?.temporaryAcceptances || [])
      .filter((entry) => entry.targetType === 'flow')
      .map((entry) => entry.target),
  );
  const excludedCandidates = manifest?.overrides?.excludedFlowCandidates || [];

  return [...byGroup.entries()]
    .map(([id, group]) => {
      const moduleKeys = unique(group.flows.map((item) => item.moduleKey)).sort();
      const moduleNames = unique(group.flows.map((item) => item.moduleName)).sort();
      const primaryModuleKey =
        group.descriptor.flowKind === 'shared_capability' ? 'shared' : moduleKeys[0];
      const primaryModuleName =
        group.descriptor.flowKind === 'shared_capability' ? 'Shared Capability' : moduleNames[0];
      const matchedFlowSpec = inferFlowSpecMatch(manifest, {
        id,
        canonicalName: group.descriptor.canonicalName,
        aliases: group.descriptor.aliases,
        flowKind: group.descriptor.flowKind,
        moduleKey: primaryModuleKey,
        moduleName: primaryModuleName,
        moduleKeys,
        moduleNames,
        pageRoutes: [],
        actions: [],
        endpoints: [],
        backendRoutes: [],
        connected: false,
        persistent: false,
        memberCount: 0,
        critical: false,
        resolution: 'candidate',
        matchedFlowSpec: null,
        notes: '',
      });
      const accepted = matchedFlowSpec ? activeAcceptances.has(matchedFlowSpec) : false;
      const excluded =
        matchesOverride(id, excludedCandidates) ||
        group.descriptor.aliases.some((alias) => matchesOverride(alias, excludedCandidates));
      const connected = group.flows.some((item) => item.connected);
      const persistent = group.flows.some((item) => item.persistent);
      const critical =
        moduleKeys.some((key) => criticalModuleKeys.has(key)) ||
        persistent ||
        Boolean(matchedFlowSpec);

      let resolution: PulseResolvedFlowGroup['resolution'];
      if (excluded) {
        resolution = 'excluded';
      } else if (accepted) {
        resolution = 'accepted';
      } else if (matchedFlowSpec) {
        resolution = 'matched';
      } else {
        resolution = 'grouped';
      }

      return {
        id,
        canonicalName: group.descriptor.canonicalName,
        aliases: unique([
          ...group.descriptor.aliases,
          ...group.flows.map((item) => item.id),
        ]).sort(),
        flowKind: group.descriptor.flowKind,
        moduleKey: primaryModuleKey,
        moduleName: primaryModuleName,
        moduleKeys,
        moduleNames,
        pageRoutes: unique(group.flows.map((item) => item.pageRoute)).sort(),
        actions: unique(group.flows.map(inferAction)).sort(),
        endpoints: unique(group.flows.map((item) => item.endpoint)).sort(),
        backendRoutes: unique(
          group.flows
            .map((item) => item.backendRoute)
            .filter((value): value is string => Boolean(value)),
        ).sort(),
        connected,
        persistent,
        memberCount: group.flows.length,
        critical,
        resolution,
        matchedFlowSpec,
        notes: matchedFlowSpec
          ? `Grouped from ${group.flows.length} raw flow candidate(s); matched flow spec "${matchedFlowSpec}".`
          : excluded
            ? `Grouped from ${group.flows.length} raw flow candidate(s); excluded by override.`
            : `Grouped from ${group.flows.length} raw flow candidate(s) as ${group.descriptor.flowKind}.`,
      } satisfies PulseResolvedFlowGroup;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
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
