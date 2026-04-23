import type {
  PulseCapability,
  PulseConvergenceExecutionMode,
  PulseFlowProjectionItem,
  PulseParityGap,
  PulseParityGapKind,
  PulseParityGapsArtifact,
  PulseParityGapSeverity,
  PulseResolvedManifest,
  PulseTruthMode,
} from './types';
import { deriveStructuralFamilies, slugifyStructural } from './structural-family';
import { isInterfaceOnlyWithoutRoutes } from './parity-capability-classifiers';
import { unique } from './parity-utils';

export function capabilityFamilies(capability: PulseCapability): string[] {
  return deriveStructuralFamilies([
    capability.id,
    capability.name,
    ...capability.routePatterns,
    ...capability.filePaths,
  ]);
}

export function flowFamilies(flow: PulseFlowProjectionItem): string[] {
  return deriveStructuralFamilies([flow.id, flow.name, ...flow.routePatterns]);
}

export function moduleFamilies(moduleEntry: PulseResolvedManifest['modules'][number]): string[] {
  return deriveStructuralFamilies([
    moduleEntry.key,
    moduleEntry.name,
    moduleEntry.canonicalName,
    ...moduleEntry.aliases,
    ...moduleEntry.routeRoots,
  ]);
}

export function textFamilies(value: string): string[] {
  const routePrefix = value.startsWith('/') ? value.split(/\s+/)[0] || value : value;
  return deriveStructuralFamilies([value, routePrefix]);
}

function compact(value: string, max: number = 280): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

function pickExecutionMode(
  values: Array<PulseConvergenceExecutionMode | undefined>,
): PulseConvergenceExecutionMode {
  if (values.includes('human_required')) {
    return 'human_required';
  }
  if (values.includes('observation_only')) {
    return 'observation_only';
  }
  return 'ai_safe';
}

function chooseTruthMode(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
  fallback: PulseTruthMode = 'inferred',
): PulseTruthMode {
  const modes = [
    ...capabilities.map((item) => item.truthMode),
    ...flows.map((item) => item.truthMode),
  ];
  if (modes.includes('observed')) {
    return 'observed';
  }
  if (modes.includes('inferred')) {
    return 'inferred';
  }
  if (modes.includes('aspirational')) {
    return 'aspirational';
  }
  return fallback;
}

function chooseSeverity(
  kind: PulseParityGapKind,
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
): PulseParityGapSeverity {
  const runtimeCritical = capabilities.some((item) => item.runtimeCritical);
  const userFacing = capabilities.some((item) => item.userFacing);
  const reliabilityOnly =
    capabilities.length > 0 && capabilities.every((item) => item.ownerLane === 'reliability');
  const operatorOrSecurity = capabilities.some((item) =>
    ['operator-admin', 'security'].includes(item.ownerLane),
  );
  const interfaceOnlyWithoutRoutes =
    capabilities.length > 0 && capabilities.every(isInterfaceOnlyWithoutRoutes);
  const hasPhantom =
    capabilities.some((item) => item.status === 'phantom') ||
    flows.some((item) => item.status === 'phantom');

  if (kind === 'integration_without_observability') {
    return runtimeCritical ? 'critical' : 'high';
  }
  if (kind === 'runtime_without_product_surface') {
    return runtimeCritical ? 'high' : 'medium';
  }
  if (kind === 'feature_declared_without_runtime') {
    return runtimeCritical || userFacing ? 'high' : 'medium';
  }
  if (kind === 'front_without_back' || kind === 'ui_without_persistence') {
    if (interfaceOnlyWithoutRoutes && !operatorOrSecurity && !hasPhantom) {
      return 'medium';
    }
    return runtimeCritical || hasPhantom ? 'high' : 'medium';
  }
  if (kind === 'back_without_front') {
    if (reliabilityOnly) {
      return 'medium';
    }
    return runtimeCritical ? 'high' : 'medium';
  }
  if (kind === 'flow_without_validation') {
    return userFacing ? 'high' : 'medium';
  }
  return hasPhantom ? 'high' : 'medium';
}

export function buildGap(
  kind: PulseParityGapKind,
  title: string,
  summary: string,
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
  routePatterns: string[],
  relatedFiles: string[],
  validationTargets: string[],
): PulseParityGap {
  return {
    id: `${kind}:${slugifyStructural(title) || slugifyStructural(summary)}`,
    kind,
    severity: chooseSeverity(kind, capabilities, flows),
    truthMode: chooseTruthMode(capabilities, flows),
    executionMode: pickExecutionMode(capabilities.map((item) => item.executionMode)),
    title,
    summary: compact(summary),
    relatedFiles: unique(relatedFiles).sort(),
    routePatterns: unique(routePatterns).sort(),
    affectedCapabilityIds: unique(capabilities.map((item) => item.id)).sort(),
    affectedFlowIds: unique(flows.map((item) => item.id)).sort(),
    validationTargets: unique(validationTargets).filter(Boolean),
  };
}

export function buildSummary(gaps: PulseParityGap[]): PulseParityGapsArtifact['summary'] {
  const byKind = {
    front_without_back: 0,
    back_without_front: 0,
    ui_without_persistence: 0,
    persistence_without_consumer: 0,
    flow_without_validation: 0,
    integration_without_observability: 0,
    feature_declared_without_runtime: 0,
    runtime_without_product_surface: 0,
  } satisfies Record<PulseParityGapKind, number>;

  for (const gap of gaps) {
    byKind[gap.kind] += 1;
  }

  return {
    totalGaps: gaps.length,
    criticalGaps: gaps.filter((item) => item.severity === 'critical').length,
    highGaps: gaps.filter((item) => item.severity === 'high').length,
    byKind,
  };
}
