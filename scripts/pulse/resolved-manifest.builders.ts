/** Flow group and scenario synthesis builders for resolved-manifest. */

import type {
  PulseCodebaseTruth,
  PulseDiscoveredFlowCandidate,
  PulseManifest,
  PulseResolvedFlowGroup,
  PulseResolvedFlowKind,
} from './types';

export interface SemanticFlowDescriptor {
  id: string;
  canonicalName: string;
  flowKind: PulseResolvedFlowKind;
  aliases: string[];
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function matchesOverride(candidate: string, values: string[]): boolean {
  const normalized = normalizeText(candidate);
  return values.some((value) => normalizeText(value) === normalized);
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

export function inferAction(flow: PulseDiscoveredFlowCandidate): string {
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
  const p = getPath(flow);
  return (
    haystack.includes('fontfamily') ||
    haystack.includes('fontsize') ||
    haystack.includes('borderradius') ||
    p.includes('param)}') ||
    p.includes('…') ||
    p.endsWith('/flow')
  );
}

function inferFlowKind(
  flow: PulseDiscoveredFlowCandidate,
  action: string,
  family: string,
): PulseResolvedFlowKind {
  const haystack = getHaystack(flow);
  const p = getPath(flow);
  if (
    flow.moduleKey === 'e2e' ||
    haystack.includes('spec ') ||
    haystack.includes(' test ') ||
    p.includes('/e2e/')
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

export function describeFlow(flow: PulseDiscoveredFlowCandidate): SemanticFlowDescriptor {
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

export function inferFlowSpecMatch(
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

export function synthesizeScenarioFlowGroups(
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
