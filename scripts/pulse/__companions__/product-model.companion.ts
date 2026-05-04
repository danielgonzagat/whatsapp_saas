function buildAdjacency(graph: PulseStructuralGraph): Map<string, Set<string>> {
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

function deriveCapabilityFlowId(
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

function getStructuralSpecificity(value: string): number {
  return value.split('-').filter(Boolean).length;
}

function deriveSurfaceId(node: PulseStructuralNode): string | null {
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

function buildScopeFileCountBySurface(scopeState: PulseScopeState): Map<string, number> {
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

function describeSurface(
  artifactCount: number,
  routeCount: number,
  scopeFileCount: number,
): string {
  return `Discovered from ${artifactCount} structural artifact(s), ${routeCount} declared route root(s), and ${scopeFileCount} scoped file(s).`;
}

function findSurfaceComponentIds(
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

function chooseCapabilityLabelNode(nodes: PulseStructuralNode[]): PulseStructuralNode | undefined {
  return (
    nodes.find((node) => node.role === 'interface') ||
    nodes.find((node) => node.kind === 'backend_route') ||
    nodes.find((node) => node.kind === 'api_call') ||
    nodes[0]
  );
}

function calculateSurfaceCompleteness(graph: PulseStructuralGraph, artifactIds: string[]): number {
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

function classifyTruthModeFromScore(score: number): PulseTruthMode {
  if (score < 50) {
    return 'inferred';
  }
  if (score < 80) {
    return 'aspirational';
  }
  return 'observed';
}

function classifyCapabilityTruthMode(maturityScore: number): PulseTruthMode {
  if (maturityScore < 50) {
    return 'inferred';
  }
  if (maturityScore < 85) {
    return 'aspirational';
  }
  return 'observed';
}

/** Map PULSE truth mode to extended capability classification */
function mapToExtendedMode(tm: PulseTruthMode): CapabilityTruthMode {
  if (tm === 'observed') {
    return 'real';
  }
  if (tm === 'aspirational') {
    return 'latent';
  }
  // 'inferred' maps to phantom (no layer evidence, just structure)
  return 'phantom';
}

function inferCriticality(
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

function computeCapabilityBlockers(hasUI: boolean, hasAPI: boolean, hasStorage: boolean): string[] {
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

function determineTruthModeFromCapabilities(caps: PulseProductCapability[]): PulseTruthMode {
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

function isExcludedArtifact(file: string): boolean {
  return /\.(?:spec|test|d)\.[cm]?[jt]sx?$/.test(file) || file.endsWith('.config.ts');
}
