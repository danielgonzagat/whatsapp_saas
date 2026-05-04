// PULSE — Live Codebase Nervous System
// Resolved manifest: flow group resolution and synthesis helpers

import type {
  PulseCodebaseTruth,
  PulseDiscoveredFlowCandidate,
  PulseManifest,
  PulseResolvedFlowGroup,
} from './types';
import {
  normalizeText,
  tokenize,
  unique,
  matchesOverride,
  titleCase,
} from './resolved-manifest.module-helpers';
import {
  type SemanticFlowDescriptor,
  describeFlow,
  inferAction,
} from './resolved-manifest.flow-descriptor';

export function inferFlowSpecMatch(
  manifest: PulseManifest | null,
  group: PulseResolvedFlowGroup,
): string | null {
  if (!manifest) return null;
  const overrides = manifest.overrides || {};
  if (overrides.flowAliases?.[group.id]) return overrides.flowAliases[group.id];
  if (overrides.flowAliases?.[group.canonicalName])
    return overrides.flowAliases[group.canonicalName];

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
    if (score <= 0) continue;
    if (!bestMatch || score > bestMatch.score) bestMatch = { id: spec.id, score };
  }
  return bestMatch?.id || null;
}

function matchesScenarioRoute(route: string, pattern: string): boolean {
  if (!route || !pattern) return false;
  if (route === pattern) return true;
  const dynamicIndex = pattern.indexOf('[');
  const staticPrefix = dynamicIndex >= 0 ? pattern.slice(0, dynamicIndex) : pattern;
  if (!staticPrefix || staticPrefix === '/') return route === '/' || route.startsWith('/');
  return route.startsWith(staticPrefix.endsWith('/') ? staticPrefix : `${staticPrefix}/`);
}

export function synthesizeScenarioFlowGroups(
  manifest: PulseManifest | null,
  codebaseTruth: PulseCodebaseTruth,
  existingFlowGroups: PulseResolvedFlowGroup[],
): PulseResolvedFlowGroup[] {
  if (!manifest) return [];
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
    if (scenarioModules.length === 0 && scenarioRoutes.length === 0) continue;

    for (const groupId of scenario.flowGroups) {
      if (existingIds.has(groupId)) continue;
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

export function buildFlowGroups(
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
      byGroup.set(descriptor.id, { descriptor, flows: [flow] });
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
      if (excluded) resolution = 'excluded';
      else if (accepted) resolution = 'accepted';
      else if (matchedFlowSpec) resolution = 'matched';
      else resolution = 'grouped';

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
