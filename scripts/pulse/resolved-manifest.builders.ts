/** Flow group and scenario synthesis builders for resolved-manifest. */

import type { PulseDiscoveredFlowCandidate } from './types.truth';
import type { PulseManifest } from './types.manifest';
import type { PulseResolvedFlowGroup, PulseResolvedFlowKind } from './types.resolved-manifest';
import {
  normalizeText,
  slugify,
  tokenize,
  unique,
  titleCase,
  matchesOverride,
} from './resolved-manifest.module-helpers';
import { discoverAllObservedHttpMethods } from './dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from './dynamic-reality-kernel/__parts__/type-contract-labels';

export {
  normalizeText,
  slugify,
  tokenize,
  unique,
  titleCase,
  matchesOverride,
} from './resolved-manifest.module-helpers';

export interface SemanticFlowDescriptor {
  id: string;
  canonicalName: string;
  flowKind: PulseResolvedFlowKind;
  aliases: string[];
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

function tokenSetFromObservedFlow(flow: PulseDiscoveredFlowCandidate): Set<string> {
  return new Set(tokenize(getHaystack(flow)));
}

function discoverActionTokensFromObservedFlow(flow: PulseDiscoveredFlowCandidate): string[] {
  const method = flow.httpMethod.toUpperCase();
  const allMethods = discoverAllObservedHttpMethods().map((value) => value.toUpperCase());
  const methodIndex = allMethods.indexOf(method);
  const endpointTokens = getEndpointSegments(flow).map((segment) => normalizeText(segment));
  const textTokens = [...tokenSetFromObservedFlow(flow)].filter((token) => token.length > 2);
  const terminalEndpointToken = endpointTokens[endpointTokens.length - 1];
  const semanticCandidate = [...textTokens]
    .reverse()
    .find((token) => endpointTokens.includes(token) && token !== normalizeText(flow.moduleKey));
  return unique([
    semanticCandidate || '',
    terminalEndpointToken || '',
    methodIndex >= 0 ? allMethods[methodIndex].toLowerCase() : '',
  ]).filter(Boolean);
}

export function inferAction(flow: PulseDiscoveredFlowCandidate): string {
  const [candidate] = discoverActionTokensFromObservedFlow(flow);
  return candidate || slugify(flow.httpMethod || flow.id || flow.moduleKey || 'flow');
}

function parameterSegmentRatio(segment: string): number {
  const normalized = normalizeText(segment);
  if (!normalized) return 0;
  const tokenCount = tokenize(normalized).length || 1;
  const signalCount = [
    segment.startsWith(':'),
    normalized.endsWith('id'),
    /^\{.*\}$/.test(segment),
    /^\[.*\]$/.test(segment),
  ].filter(Boolean).length;
  return signalCount / tokenCount;
}

function isProtocolSegment(segment: string, index: number): boolean {
  const normalized = normalizeText(segment);
  const methodTokens = new Set(
    discoverAllObservedHttpMethods().map((value) => value.toLowerCase()),
  );
  return index === 0 && (methodTokens.has(normalized) || /^v\d+$/i.test(segment));
}

function getEndpointSegments(flow: PulseDiscoveredFlowCandidate): string[] {
  return getPath(flow)
    .replace(/^\/+/g, '')
    .split('/')
    .map((part) => part.replace(/^:+/, ''))
    .filter(Boolean)
    .filter((part, index) => !isProtocolSegment(part, index))
    .filter((part) => parameterSegmentRatio(part) === 0);
}

function inferResourceFamily(flow: PulseDiscoveredFlowCandidate): string {
  const actionTokens = new Set(discoverActionTokensFromObservedFlow(flow).map(normalizeText));
  const moduleToken = normalizeText(flow.moduleKey);
  const segments = getEndpointSegments(flow)
    .map((segment) => slugify(segment))
    .filter((segment) => segment && segment !== moduleToken)
    .filter((segment) => !actionTokens.has(normalizeText(segment)));
  const selected = unique(segments).slice(0, Math.max(1, Math.min(segments.length, 2)));
  return selected.length > 0
    ? selected.join('-')
    : slugify(flow.moduleKey || flow.moduleName || flow.id || 'flow');
}

function discoverFlowKindLabel(preferred: string): PulseResolvedFlowKind {
  const labels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.resolved-manifest.ts',
    'PulseResolvedFlowKind',
  );
  if (labels.has(preferred)) return preferred as PulseResolvedFlowKind;
  const [fallback] = [...labels];
  return (fallback || preferred) as PulseResolvedFlowKind;
}

function unresolvedTemplateSignal(flow: PulseDiscoveredFlowCandidate): boolean {
  const path = getPath(flow);
  return path !== decodeURIComponent(path) || /[{}\[\]…]/u.test(path);
}

function inferFlowKind(
  flow: PulseDiscoveredFlowCandidate,
  action: string,
  family: string,
): PulseResolvedFlowKind {
  const tokens = tokenSetFromObservedFlow(flow);
  const pathTokens = new Set(getEndpointSegments(flow).map(normalizeText));
  const hasExecutionHarnessEvidence = [...tokens].some(
    (token) => token === normalizeText(flow.moduleKey),
  );
  const connected = Boolean(flow.connected || flow.persistent);
  if (unresolvedTemplateSignal(flow)) return discoverFlowKindLabel('legacy_noise');
  if (!connected && family === slugify(flow.moduleKey || flow.moduleName || flow.id || 'flow')) {
    return discoverFlowKindLabel('legacy_noise');
  }
  if (connected && pathTokens.has(normalizeText(action)))
    return discoverFlowKindLabel('shared_capability');
  if (hasExecutionHarnessEvidence && !connected) return discoverFlowKindLabel('ops_internal');
  return discoverFlowKindLabel('feature_flow');
}

function buildDescriptorId(
  flow: PulseDiscoveredFlowCandidate,
  flowKind: PulseResolvedFlowKind,
  family: string,
  action: string,
): string {
  const moduleKey = slugify(flow.moduleKey || 'module');
  if (flowKind === 'ops_internal') return `ops-${moduleKey}-${family}-${action}`;
  if (flowKind === 'legacy_noise') return `legacy-${moduleKey}-${family}-${action}`;
  if (flowKind === 'shared_capability') return `shared-${family}-${action}`;
  if (action && family && action !== family) return `${moduleKey}-${family}-${action}`;
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
  if (flowKind === 'ops_internal') return `${moduleName} Ops Harness`;
  if (flowKind === 'legacy_noise') return `${moduleName} Legacy Noise`;
  if (flowKind === 'shared_capability') return `Shared ${familyName} ${actionName}`;
  if (action && family && action !== family) return `${moduleName} ${familyName} ${actionName}`;
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

export { synthesizeScenarioFlowGroups, buildFlowGroups } from './resolved-manifest.flow-groups';
