import type { PulseProductCapability, PulseProductFlow, PulseProductSurface } from '../../types';
import type { BehaviorNode } from '../../types.behavior-graph';
import type { ScenarioCategory, ScenarioRole } from '../../types.scenario-engine';

function resolveCategory(
  surface: PulseProductSurface | null,
  capabilities: PulseProductCapability[],
  flows: PulseProductFlow[],
  endpoints: BehaviorNode[],
): ScenarioCategory {
  if (!surface) return 'system-flow';
  if (flows.length > 0 || capabilities.some((capability) => capability.flowIds.length > 0)) {
    return endpoints.length > 0 ? 'interaction-flow' : 'runtime-flow';
  }
  return 'surface-map';
}

function resolveRole(
  surface: PulseProductSurface | null,
  endpoints: BehaviorNode[],
  capabilities: PulseProductCapability[],
): ScenarioRole {
  const discoveredTokens = [
    surface?.id,
    surface?.name,
    ...(surface?.artifactIds || []),
    ...(surface?.capabilities || []),
    ...capabilities.flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.artifactIds,
    ]),
    ...endpoints.map((endpoint) => endpoint.filePath),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/\badmin\b/.test(discoveredTokens)) {
    return 'admin';
  }
  if (/\boperator\b/.test(discoveredTokens)) {
    return 'operator';
  }
  if (/\bproducer\b/.test(discoveredTokens)) {
    return 'producer';
  }
  if (/\baffiliate\b/.test(discoveredTokens)) {
    return 'affiliate';
  }
  if (/\bcustomer\b/.test(discoveredTokens)) {
    return 'customer';
  }
  if (
    endpoints.length === 0 &&
    capabilities.every((capability) => capability.truthMode !== 'observed')
  ) {
    return 'anonymous';
  }
  return 'anonymous';
}

export { resolveCategory, resolveRole };
