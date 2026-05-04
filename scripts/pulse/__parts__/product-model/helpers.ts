import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseScopeState,
  PulseResolvedManifest,
  PulseProductCapability,
  PulseTruthMode,
} from '../../types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from '../../structural-family';
import type { ArtifactLayer, CapabilityTruthMode } from './types';

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function limitSorted<T>(values: T[], maxItems: number): T[] {
  return values.slice(0, maxItems);
}

export function buildAdjacency(graph: PulseStructuralGraph): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, new Set<string>());
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  return adjacency;
}

export function nodeFamilies(node: PulseStructuralNode): string[] {
  const metadataValues = Object.values(node.metadata).flatMap((value) =>
    Array.isArray(value) ? value.map(String) : [String(value || '')],
  );
  return deriveStructuralFamilies([node.id, node.label, node.file, ...metadataValues]);
}

export function classifyNodeLayers(node: PulseStructuralNode): ArtifactLayer[] {
  const lowerFile = node.file.toLowerCase();
  const layers: ArtifactLayer[] = [];

  if (node.role === 'interface' || lowerFile.includes('frontend/')) {
    layers.push('frontend');
  }
  if (
    node.kind === 'api_call' ||
    node.kind === 'proxy_route' ||
    node.kind === 'backend_route' ||
    lowerFile.includes('backend/')
  ) {
    layers.push('backend');
  }
  if (
    node.role === 'persistence' ||
    node.kind === 'persistence_model' ||
    lowerFile.includes('prisma/') ||
    lowerFile.includes('schema.prisma')
  ) {
    layers.push('persistence');
  }
  if (lowerFile.includes('worker/')) {
    layers.push('worker');
  }
  if (lowerFile.includes('webhook') || lowerFile.includes('provider')) {
    layers.push('external');
  }
  if (
    node.kind === 'evidence' ||
    lowerFile.includes('logger') ||
    lowerFile.includes('monitor') ||
    lowerFile.includes('metric') ||
    lowerFile.includes('observability')
  ) {
    layers.push('evidence');
  }

  return unique(layers);
}

export function nodeHasLayer(node: PulseStructuralNode, layer: ArtifactLayer): boolean {
  return classifyNodeLayers(node).includes(layer);
}

export function hasValidationEvidence(node: PulseStructuralNode): boolean {
  const lowerFile = node.file.toLowerCase();
  return (
    node.truthMode === 'observed' ||
    lowerFile.includes('validator') ||
    lowerFile.includes('.dto.') ||
    lowerFile.endsWith('.dto.ts') ||
    lowerFile.endsWith('.dto.tsx')
  );
}

export function buildCriticalSurfaceIds(
  scopeState: PulseScopeState,
  manifest: PulseResolvedManifest,
): Set<string> {
  const criticalSurfaceIds = new Set<string>();

  for (const moduleEntry of manifest.modules) {
    if (!moduleEntry.critical) {
      continue;
    }
    for (const family of deriveStructuralFamilies([
      moduleEntry.key,
      moduleEntry.name,
      moduleEntry.canonicalName,
      ...moduleEntry.aliases,
      ...moduleEntry.routeRoots,
    ])) {
      criticalSurfaceIds.add(family);
    }
  }

  for (const domain of manifest.criticalDomains) {
    const surfaceId = slugifyStructural(domain);
    if (surfaceId) {
      criticalSurfaceIds.add(surfaceId);
    }
  }

  for (const aggregate of scopeState.moduleAggregates) {
    if (aggregate.runtimeCriticalFileCount === 0 && aggregate.humanRequiredFileCount === 0) {
      continue;
    }
    const surfaceId = slugifyStructural(aggregate.moduleKey);
    if (surfaceId) {
      criticalSurfaceIds.add(surfaceId);
    }
  }

  return criticalSurfaceIds;
}

export function isStructuralFlowCandidate(nodes: PulseStructuralNode[]): boolean {
  if (nodes.length === 0) {
    return false;
  }
  const hasEntry = nodes.some(
    (node) =>
      node.userFacing ||
      nodeHasLayer(node, 'frontend') ||
      Boolean(node.metadata.frontendPath) ||
      Boolean(node.metadata.fullPath),
  );
  const hasAction = nodes.some(
    (node) =>
      nodeHasLayer(node, 'backend') ||
      Boolean(node.metadata.endpoint) ||
      Boolean(node.metadata.backendPath),
  );
  const hasStatefulOrSideEffect = nodes.some(
    (node) =>
      nodeHasLayer(node, 'persistence') ||
      node.role === 'side_effect' ||
      Boolean(node.metadata.backendPath) ||
      Boolean(node.metadata.endpoint),
  );
  return hasEntry && hasAction && hasStatefulOrSideEffect;
}

export function deriveCapabilityFlowId(
  capability: PulseProductCapability,
  nodes: PulseStructuralNode[],
): string | null {
  const routeFamilies = unique(
    nodes
      .flatMap((node) => [
        node.metadata.fullPath,
        node.metadata.frontendPath,
        node.metadata.normalizedPath,
        node.metadata.endpoint,
        node.metadata.backendPath,
      ])
      .map((value) => deriveRouteFamily(String(value || ''), 2))
      .filter((value): value is string => Boolean(value)),
  ).sort((left, right) => getStructuralSpecificity(right) - getStructuralSpecificity(left));

  const routeFamily = routeFamilies[0];

  if (routeFamily) {
    return `flow-${routeFamily}`;
  }

  const labelFamily = deriveStructuralFamilies([
    capability.name,
    capability.surfaceId,
    ...nodes.map((node) => node.label),
  ])[0];
  return labelFamily ? `flow-${labelFamily}` : null;
}

export function getStructuralSpecificity(value: string): number {
  return value.split('-').filter(Boolean).length;
}

export function deriveSurfaceId(node: PulseStructuralNode): string | null {
  const routeFamily = [
    node.metadata.fullPath,
    node.metadata.frontendPath,
    node.metadata.normalizedPath,
    node.metadata.endpoint,
    node.metadata.backendPath,
  ]
    .map((value) => deriveRouteFamily(String(value || ''), 1))
    .find((value): value is string => Boolean(value));
  if (routeFamily) {
    return routeFamily;
  }

  const families = nodeFamilies(node);
  const firstFamily = families[0];
  if (!firstFamily) {
    return null;
  }
  return firstFamily.split('-').filter(Boolean)[0] || null;
}

export function buildScopeFileCountBySurface(scopeState: PulseScopeState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of scopeState.files) {
    const surfaceId = slugifyStructural(
      file.moduleCandidate || deriveRouteFamily(file.path, 1) || file.surface,
    );
    if (!surfaceId) {
      continue;
    }
    counts.set(surfaceId, (counts.get(surfaceId) || 0) + 1);
  }
  return counts;
}

export function describeSurface(
  artifactCount: number,
  routeCount: number,
  scopeFileCount: number,
): string {
  return `Discovered from ${artifactCount} structural artifact(s), ${routeCount} declared route root(s), and ${scopeFileCount} scoped file(s).`;
}

export function findSurfaceComponentIds(
  adjacency: Map<string, Set<string>>,
  nodeId: string,
  allowedIds: Set<string>,
): string[] {
  const visited = new Set<string>();
  const queue: string[] = [nodeId];
  visited.add(nodeId);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const nextId of adjacency.get(currentId) || []) {
      if (!allowedIds.has(nextId) || visited.has(nextId)) {
        continue;
      }
      visited.add(nextId);
      queue.push(nextId);
    }
  }

  return Array.from(visited);
}

export function chooseCapabilityLabelNode(
  nodes: PulseStructuralNode[],
): PulseStructuralNode | undefined {
  return (
    nodes.find((node) => node.role === 'interface') ||
    nodes.find((node) => node.kind === 'backend_route') ||
    nodes.find((node) => node.kind === 'api_call') ||
    nodes[0]
  );
}

export function calculateSurfaceCompleteness(
  graph: PulseStructuralGraph,
  artifactIds: string[],
): number {
  const nodes = artifactIds
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter((n) => n !== undefined) as PulseStructuralNode[];
  if (nodes.length === 0) {
    return 0;
  }

  const hasUI = nodes.some((node) => nodeHasLayer(node, 'frontend'));
  const hasAPI = nodes.some((node) => nodeHasLayer(node, 'backend'));
  const hasStorage = nodes.some((node) => nodeHasLayer(node, 'persistence'));

  let score = 0;
  if (hasUI) {
    score += 33;
  }
  if (hasAPI) {
    score += 33;
  }
  if (hasStorage) {
    score += 34;
  }
  return score;
}

export function classifyTruthModeFromScore(score: number): PulseTruthMode {
  if (score < 50) {
    return 'inferred';
  }
  if (score < 80) {
    return 'aspirational';
  }
  return 'observed';
}

export function classifyCapabilityTruthMode(maturityScore: number): PulseTruthMode {
  if (maturityScore < 50) {
    return 'inferred';
  }
  if (maturityScore < 85) {
    return 'aspirational';
  }
  return 'observed';
}

export function mapToExtendedMode(tm: PulseTruthMode): CapabilityTruthMode {
  if (tm === 'observed') {
    return 'real';
  }
  if (tm === 'aspirational') {
    return 'latent';
  }
  return 'phantom';
}

export function inferCriticality(
  nodes: PulseStructuralNode[],
  surfaceId: string,
  criticalSurfaceIds: Set<string>,
): 'must_have' | 'should_have' | 'nice_to_have' {
  if (
    criticalSurfaceIds.has(surfaceId) ||
    nodes.some((node) => node.runtimeCritical || node.protectedByGovernance)
  ) {
    return 'must_have';
  }
  if (nodes.some((node) => node.userFacing || node.truthMode === 'observed')) {
    return 'should_have';
  }
  return 'nice_to_have';
}

export function computeCapabilityBlockers(
  hasUI: boolean,
  hasAPI: boolean,
  hasStorage: boolean,
): string[] {
  const blockers: string[] = [];
  if (!hasUI) {
    blockers.push('Missing UI layer');
  }
  if (!hasAPI) {
    blockers.push('Missing API layer');
  }
  if (!hasStorage) {
    blockers.push('Missing storage layer');
  }
  return blockers;
}

export function determineTruthModeFromCapabilities(caps: PulseProductCapability[]): PulseTruthMode {
  if (caps.length === 0) {
    return 'inferred';
  }
  if (caps.some((c) => c.truthMode === 'inferred')) {
    return 'inferred';
  }
  if (caps.some((c) => c.truthMode === 'aspirational')) {
    return 'aspirational';
  }
  return 'observed';
}

export function isExcludedArtifact(file: string): boolean {
  return /\.(?:spec|test|d)\.[cm]?[jt]sx?$/.test(file) || file.endsWith('.config.ts');
}
