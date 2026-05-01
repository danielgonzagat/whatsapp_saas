/**
 * PULSE Product Model Layer (P1)
 *
 * Transforms code artifacts into product capabilities, flows, and surfaces.
 * This is the "reconstruction layer" that turns files into product vision.
 *
 * Key concepts:
 * - Surface: Top-level product area discovered from manifest and code evidence
 * - Capability: Feature that spans UI, API, and persistence
 * - Flow: User journey across capabilities
 *
 * Extended truth modes for capabilities/flows (beyond PULSE standard):
 * - real: Exists and works with evidence (observed + complete)
 * - partial: Exists but broken or incomplete (partial mode)
 * - latent: Declared/aspirational - strong signals but not implemented (aspirational mode)
 * - phantom: Parece existir but is illusion of orphaned front/back (inferred only)
 */

import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseScopeState,
  PulseResolvedManifest,
  PulseTruthMode,
  PulseProductGraph,
  PulseProductCapability,
  PulseProductFlow,
  PulseProductSurface,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from './structural-family';

/** Input to product model builder */
export interface BuildProductModelInput {
  /** Structural graph property. */
  structuralGraph: PulseStructuralGraph;
  /** Scope state property. */
  scopeState: PulseScopeState;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
}

/** Extended truth mode for capability/flow classification */
type CapabilityTruthMode = 'real' | 'partial' | 'latent' | 'phantom';

type ArtifactLayer = 'frontend' | 'backend' | 'persistence' | 'worker' | 'external' | 'evidence';

const MAX_PRODUCT_SURFACES = 120;
const MAX_SURFACE_ARTIFACT_IDS = 250;
const MAX_PRODUCT_CAPABILITIES = 400;
const MAX_CAPABILITY_ARTIFACT_IDS = 120;
const MAX_PRODUCT_FLOWS = 300;

/**
 * Build product graph from structural graph
 * Transforms code into product surfaces, capabilities, and flows
 */
export function buildProductModel(input: BuildProductModelInput): PulseProductGraph {
  const { structuralGraph, scopeState, resolvedManifest } = input;

  const surfaces = discoverSurfaces(structuralGraph, scopeState, resolvedManifest);
  const capabilities = discoverCapabilities(
    structuralGraph,
    surfaces,
    scopeState,
    resolvedManifest,
  );
  const flows = discoverFlows(capabilities, structuralGraph, resolvedManifest);
  const orphanedArtifactIds = findOrphanedArtifactIds(structuralGraph, capabilities);

  return {
    surfaces,
    capabilities,
    flows,
    orphanedArtifactIds,
    phantomCapabilities: capabilities
      .filter((c) => mapToExtendedMode(c.truthMode) === 'phantom')
      .map((c) => c.id),
    latentCapabilities: capabilities
      .filter((c) => mapToExtendedMode(c.truthMode) === 'latent')
      .map((c) => c.id),
  };
}

// ============ Discovery Functions ============

/** Discover product surfaces from manifest promises and structural graph evidence. */
function discoverSurfaces(
  graph: PulseStructuralGraph,
  scopeState: PulseScopeState,
  manifest: PulseResolvedManifest,
): PulseProductSurface[] {
  const surfacesById = new Map<string, PulseProductSurface>();
  const scopeFileCountBySurface = buildScopeFileCountBySurface(scopeState);

  for (const moduleEntry of manifest.modules.filter((item) => item.coverageStatus !== 'excluded')) {
    const families = deriveStructuralFamilies([
      moduleEntry.key,
      moduleEntry.name,
      moduleEntry.canonicalName,
      ...moduleEntry.aliases,
      ...moduleEntry.routeRoots,
    ]);
    const artifactIds = limitSorted(
      graph.nodes
        .filter((node) => familiesOverlap(nodeFamilies(node), families))
        .map((node) => node.id),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    if (artifactIds.length === 0 && !moduleEntry.declaredByManifest) {
      continue;
    }
    const surfaceId = slugifyStructural(
      moduleEntry.key || moduleEntry.canonicalName || moduleEntry.name,
    );
    if (!surfaceId) {
      continue;
    }
    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: moduleEntry.name || titleCaseStructural(surfaceId),
      description: describeSurface(
        artifactIds.length,
        moduleEntry.routeRoots.length,
        scopeFileCountBySurface.get(surfaceId) || 0,
      ),
      artifactIds,
      capabilities: [],
      completeness,
      truthMode: artifactIds.length > 0 ? classifyTruthModeFromScore(completeness) : 'aspirational',
    });
  }

  for (const aggregate of scopeState.moduleAggregates) {
    const surfaceId = slugifyStructural(aggregate.moduleKey);
    if (!surfaceId || surfacesById.has(surfaceId)) {
      continue;
    }
    const artifactIds = limitSorted(
      graph.nodes
        .filter((node) => familiesOverlap(nodeFamilies(node), surfaceId))
        .map((node) => node.id),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: titleCaseStructural(surfaceId),
      description: describeSurface(artifactIds.length, 0, aggregate.fileCount),
      artifactIds,
      capabilities: [],
      completeness,
      truthMode: artifactIds.length > 0 ? classifyTruthModeFromScore(completeness) : 'aspirational',
    });
  }

  const groupedArtifactIds = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    const surfaceId = deriveSurfaceId(node);
    if (!surfaceId) {
      continue;
    }
    if (!groupedArtifactIds.has(surfaceId)) {
      groupedArtifactIds.set(surfaceId, new Set<string>());
    }
    groupedArtifactIds.get(surfaceId)!.add(node.id);
  }

  for (const [surfaceId, ids] of groupedArtifactIds) {
    const existing = surfacesById.get(surfaceId);
    const artifactIds = limitSorted(
      unique([...(existing?.artifactIds || []), ...ids]),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: existing?.name || titleCaseStructural(surfaceId),
      description:
        existing?.description ||
        describeSurface(artifactIds.length, 0, scopeFileCountBySurface.get(surfaceId) || 0),
      artifactIds,
      capabilities: existing?.capabilities || [],
      completeness,
      truthMode: classifyTruthModeFromScore(completeness),
    });
  }

  return limitSorted(
    [...surfacesById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    MAX_PRODUCT_SURFACES,
  );
}

/** Discover capabilities from structural graph */
function discoverCapabilities(
  graph: PulseStructuralGraph,
  surfaces: PulseProductSurface[],
  scopeState: PulseScopeState,
  manifest: PulseResolvedManifest,
): PulseProductCapability[] {
  const capabilities: PulseProductCapability[] = [];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const adjacency = buildAdjacency(graph);
  const criticalSurfaceIds = buildCriticalSurfaceIds(scopeState, manifest);

  for (const surface of surfaces) {
    const surfaceArtifactIds = new Set(surface.artifactIds);
    const visited = new Set<string>();

    for (const artifactId of surface.artifactIds) {
      if (visited.has(artifactId)) {
        continue;
      }

      const relatedIds = limitSorted(
        findSurfaceComponentIds(adjacency, artifactId, surfaceArtifactIds),
        MAX_CAPABILITY_ARTIFACT_IDS,
      );
      relatedIds.forEach((id) => visited.add(id));

      if (relatedIds.length < 2) {
        continue;
      }

      const relatedNodes = relatedIds
        .map((id) => nodeById.get(id))
        .filter((n) => n !== undefined) as PulseStructuralNode[];
      const labelNode = chooseCapabilityLabelNode(relatedNodes);

      const hasUI = relatedNodes.some((node) => nodeHasLayer(node, 'frontend'));
      const hasAPI = relatedNodes.some((node) => nodeHasLayer(node, 'backend'));
      const hasStorage = relatedNodes.some((node) => nodeHasLayer(node, 'persistence'));
      const hasRuntime = relatedNodes.some(
        (node) => node.role === 'orchestration' || nodeHasLayer(node, 'worker'),
      );
      const hasValidation = relatedNodes.some(hasValidationEvidence);
      const hasObservability = relatedNodes.some(
        (node) => node.kind === 'evidence' || nodeHasLayer(node, 'evidence'),
      );

      const layersPresent = [
        hasUI,
        hasAPI,
        hasStorage,
        hasRuntime,
        hasValidation,
        hasObservability,
      ].filter(Boolean).length;
      const maturityScore = Math.round((layersPresent / 6) * 100);

      capabilities.push({
        id: `cap-${surface.id}-${slugifyStructural(labelNode?.label || artifactId)}`,
        name: `${surface.name} - ${labelNode?.label || titleCaseStructural(artifactId)}`,
        surfaceId: surface.id,
        artifactIds: relatedIds,
        flowIds: [],
        maturityScore,
        truthMode: classifyCapabilityTruthMode(maturityScore),
        criticality: inferCriticality(relatedNodes, surface.id, criticalSurfaceIds),
        blockers: computeCapabilityBlockers(hasUI, hasAPI, hasStorage),
      });
    }
  }

  return limitSorted(capabilities, MAX_PRODUCT_CAPABILITIES);
}

/** Discover user flows from graph connectivity and resolved scenario specs. */
function discoverFlows(
  capabilities: PulseProductCapability[],
  graph: PulseStructuralGraph,
  manifest: PulseResolvedManifest,
): PulseProductFlow[] {
  const flowsById = new Map<string, PulseProductFlow>();
  const capabilityByArtifact = new Map<string, PulseProductCapability[]>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  for (const capability of capabilities) {
    for (const artifactId of capability.artifactIds) {
      if (!capabilityByArtifact.has(artifactId)) {
        capabilityByArtifact.set(artifactId, []);
      }
      capabilityByArtifact.get(artifactId)!.push(capability);
    }
  }

  for (const flowGroup of manifest.flowGroups) {
    const relatedCaps = capabilities.filter((capability) =>
      familiesOverlap(
        deriveStructuralFamilies([
          capability.id,
          capability.name,
          capability.surfaceId,
          ...capability.artifactIds,
        ]),
        deriveStructuralFamilies([
          flowGroup.id,
          flowGroup.canonicalName,
          flowGroup.moduleKey,
          flowGroup.moduleName,
          ...flowGroup.aliases,
          ...flowGroup.moduleKeys,
          ...flowGroup.moduleNames,
          ...flowGroup.pageRoutes,
          ...flowGroup.actions,
          ...flowGroup.endpoints,
          ...flowGroup.backendRoutes,
        ]),
      ),
    );
    if (relatedCaps.length > 0) {
      flowsById.set(
        flowGroup.id,
        buildFlow(
          flowGroup.id,
          flowGroup.canonicalName || titleCaseStructural(flowGroup.id),
          relatedCaps,
        ),
      );
    }
  }

  for (const scenario of manifest.scenarioSpecs) {
    const scenarioFamilies = deriveStructuralFamilies([
      scenario.id,
      ...scenario.moduleKeys,
      ...scenario.routePatterns,
      ...scenario.flowSpecs,
    ]);
    const relatedCaps = capabilities.filter((capability) =>
      familiesOverlap(
        scenarioFamilies,
        deriveStructuralFamilies([capability.id, capability.name, capability.surfaceId]),
      ),
    );
    if (relatedCaps.length > 0) {
      flowsById.set(
        scenario.id,
        buildFlow(scenario.id, titleCaseStructural(scenario.id), relatedCaps),
      );
    }
  }

  for (const edge of graph.edges) {
    const relatedCaps = unique([
      ...(capabilityByArtifact.get(edge.from) || []),
      ...(capabilityByArtifact.get(edge.to) || []),
    ]);
    if (relatedCaps.length < 2) {
      continue;
    }
    const flowId = slugifyStructural(
      relatedCaps
        .map((capability) => capability.surfaceId)
        .sort()
        .join('-'),
    );
    if (!flowId || flowsById.has(flowId)) {
      continue;
    }
    flowsById.set(flowId, buildFlow(flowId, titleCaseStructural(flowId), relatedCaps));
  }

  for (const capability of capabilities) {
    const relatedNodes = capability.artifactIds
      .map((id) => nodeById.get(id))
      .filter((node) => node !== undefined) as PulseStructuralNode[];
    if (!isStructuralFlowCandidate(relatedNodes)) {
      continue;
    }
    const flowId = deriveCapabilityFlowId(capability, relatedNodes);
    if (!flowId || flowsById.has(flowId)) {
      continue;
    }
    flowsById.set(flowId, buildFlow(flowId, titleCaseStructural(flowId), [capability]));
  }

  return limitSorted(
    [...flowsById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    MAX_PRODUCT_FLOWS,
  );
}

function buildFlow(
  id: string,
  name: string,
  relatedCaps: PulseProductCapability[],
): PulseProductFlow {
  const avgCompleteness =
    relatedCaps.length > 0
      ? relatedCaps.reduce((acc, c) => acc + c.maturityScore, 0) / (relatedCaps.length * 100)
      : 0;

  return {
    id,
    name,
    entryCapability: relatedCaps[0]?.id || '',
    capabilities: relatedCaps.map((c) => c.id),
    completeness: avgCompleteness,
    truthMode: determineTruthModeFromCapabilities(relatedCaps),
    blockers: relatedCaps
      .flatMap((c) =>
        c.blockers.map((b) => ({
          type: 'missing_component' as const,
          component: c.id,
          reason: b,
          severity: 'blocker' as const,
        })),
      )
      .slice(0, 3),
  };
}

/** Find orphaned artifact IDs */
function findOrphanedArtifactIds(
  graph: PulseStructuralGraph,
  capabilities: PulseProductCapability[],
): string[] {
  const connectedIds = new Set<string>();
  for (const cap of capabilities) {
    cap.artifactIds.forEach((id) => connectedIds.add(id));
  }

  return graph.nodes
    .filter((n) => !connectedIds.has(n.id) && !isExcludedArtifact(n.file))
    .map((n) => n.id);
}

// ============ Helper Functions ============

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function limitSorted<T>(values: T[], maxItems: number): T[] {
  return values.slice(0, maxItems);
}

function nodeFamilies(node: PulseStructuralNode): string[] {
  const metadataValues = Object.values(node.metadata).flatMap((value) =>
    Array.isArray(value) ? value.map(String) : [String(value || '')],
  );
  return deriveStructuralFamilies([node.id, node.label, node.file, ...metadataValues]);
}

function classifyNodeLayers(node: PulseStructuralNode): ArtifactLayer[] {
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

function nodeHasLayer(node: PulseStructuralNode, layer: ArtifactLayer): boolean {
  return classifyNodeLayers(node).includes(layer);
}

function hasValidationEvidence(node: PulseStructuralNode): boolean {
  const lowerFile = node.file.toLowerCase();
  return (
    node.truthMode === 'observed' ||
    lowerFile.includes('validator') ||
    lowerFile.includes('.dto.') ||
    lowerFile.endsWith('.dto.ts') ||
    lowerFile.endsWith('.dto.tsx')
  );
}

function buildCriticalSurfaceIds(
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

function isStructuralFlowCandidate(nodes: PulseStructuralNode[]): boolean {
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
import './__companions__/product-model.companion';
