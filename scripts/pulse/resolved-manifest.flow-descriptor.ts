/**
 * Flow descriptor inference helpers (private implementation).
 * Companion to resolved-manifest.flow-helpers.ts.
 * Exports: SemanticFlowDescriptor, describeFlow, inferAction.
 */
import type { PulseDiscoveredFlowCandidate, PulseResolvedFlowKind } from './types';
import { normalizeText, slugify, titleCase, unique } from './resolved-manifest.module-helpers';

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
      flow.declaredFlow || '',
      flow.pageRoute,
      flow.elementLabel,
      flow.endpoint,
      flow.backendRoute || '',
      ...(flow.semanticTokens || []),
    ].join(' '),
  );
}

export function inferAction(flow: PulseDiscoveredFlowCandidate): string {
  const h = getHaystack(flow);
  for (const verb of [
    'reply',
    'send',
    'toggle',
    'connect',
    'default',
    'approve',
    'start',
    'sync',
    'generate',
    'save',
  ]) {
    if (h.includes(verb)) return verb;
  }
  const method = flow.httpMethod.toUpperCase();
  if (method === 'DELETE') return 'delete';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  return 'create';
}

const VERSION_SEGMENT = /^v\d+$/i;
const GENERIC_IDENTIFIER_SEGMENT = /^(?:[a-z0-9]+id|id|uuid|slug|key|token|phone)$/i;

function getEndpointSegments(flow: PulseDiscoveredFlowCandidate): string[] {
  return getPath(flow)
    .replace(/^\/+/g, '')
    .split('/')
    .map((p) => p.replace(/^:+/, ''))
    .filter(Boolean)
    .filter((p) => normalizeText(p) !== 'api' && !VERSION_SEGMENT.test(p))
    .filter((p) => !GENERIC_IDENTIFIER_SEGMENT.test(p));
}

function inferResourceFamily(flow: PulseDiscoveredFlowCandidate): string {
  const actionVerbs = [
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
  const declaredFamily = slugify(flow.declaredFlow || '');
  if (declaredFamily) {
    return declaredFamily;
  }

  const semanticFamily = unique(flow.semanticTokens || [])
    .map(slugify)
    .filter(Boolean)
    .find((token) => token !== slugify(flow.moduleKey) && !actionVerbs.includes(token));
  if (semanticFamily) {
    return semanticFamily;
  }

  const segments = getEndpointSegments(flow)
    .filter((segment) => normalizeText(segment) !== flow.moduleKey)
    .filter((segment) => !actionVerbs.includes(normalizeText(segment)));
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
  if (isLegacyNoise(flow)) return 'legacy_noise';
  if (!flow.connected && !flow.persistent && family === 'flow') return 'legacy_noise';
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
