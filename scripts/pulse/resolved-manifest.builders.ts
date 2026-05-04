/** Flow group and scenario synthesis builders for resolved-manifest. */

import type {
  PulseDiscoveredFlowCandidate,
  PulseManifest,
  PulseResolvedFlowGroup,
  PulseResolvedFlowKind,
} from './types';
import {
  normalizeText,
  slugify,
  tokenize,
  unique,
  titleCase,
  matchesOverride,
} from './resolved-manifest.module-helpers';

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

export function inferAction(flow: PulseDiscoveredFlowCandidate): string {
  const haystack = getHaystack(flow);
  if (haystack.includes('reply')) return 'reply';
  if (haystack.includes('send')) return 'send';
  if (haystack.includes('toggle')) return 'toggle';
  if (haystack.includes('connect')) return 'connect';
  if (haystack.includes('default')) return 'default';
  if (haystack.includes('approve')) return 'approve';
  if (haystack.includes('start')) return 'start';
  if (haystack.includes('sync')) return 'sync';
  if (haystack.includes('generate')) return 'generate';
  if (haystack.includes('save')) return 'save';
  const method = flow.httpMethod.toUpperCase();
  if (method === 'DELETE') return 'delete';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  return 'create';
}

const ACTION_VERBS = [
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
];
const ID_PARAMS =
  /^(id|workspaceid|orderid|planid|productid|campaignid|conversationid|paymentmethodid|studentid|phone|tag|slug)$/i;
function getEndpointSegments(flow: PulseDiscoveredFlowCandidate): string[] {
  return getPath(flow)
    .replace(/^\/+/g, '')
    .split('/')
    .map((p) => p.replace(/^:+/, ''))
    .filter(Boolean)
    .filter((p) => !['api', 'v1', 'kloel'].includes(p))
    .filter((p) => !ID_PARAMS.test(p));
}
function inferResourceFamily(flow: PulseDiscoveredFlowCandidate): string {
  const segments = getEndpointSegments(flow)
    .filter((s) => normalizeText(s) !== flow.moduleKey)
    .filter((s) => !ACTION_VERBS.includes(normalizeText(s)));
  const selected = segments.slice(0, 2).map((s) => slugify(s));
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

const SHARED_ACTIONS = [
  'reply',
  'send',
  'toggle',
  'connect',
  'default',
  'approve',
  'start',
  'sync',
];
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
  )
    return 'ops_internal';
  if (isLegacyNoise(flow)) return 'legacy_noise';
  if (!flow.connected && !flow.persistent && family === 'flow') return 'legacy_noise';
  if (SHARED_ACTIONS.includes(action) && (flow.connected || flow.persistent))
    return 'shared_capability';
  return 'feature_flow';
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
  if (['create', 'update', 'delete'].includes(action) && family !== 'flow')
    return `${moduleKey}-${family}-management`;
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
  if (['create', 'update', 'delete'].includes(action) && family !== 'flow')
    return `${moduleName} ${familyName} Management`;
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
