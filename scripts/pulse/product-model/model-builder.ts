import type {
  PulseStructuralGraph,
  PulseStructuralNode,
} from '../types.structural';
import type { PulseScopeState } from '../types.truth.scope';
import type { PulseResolvedManifest } from '../types.resolved-manifest';
import type {
  PulseProductGraph,
  PulseProductCapability,
  PulseProductSurface,
} from '../types.product-graph';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  observeStatusTextLengthFromCatalog,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  deriveStructuralFamilies,
  getFamilyTokens,
  slugifyStructural,
  titleCaseStructural,
} from '../structural-family';
import {
  type BuildProductModelInput,
  MAX_PRODUCT_SURFACES,
  MAX_SURFACE_ARTIFACT_IDS,
  MAX_PRODUCT_CAPABILITIES,
  MAX_CAPABILITY_ARTIFACT_IDS,
  _ASPIRATIONAL_TRUTH,
  _ORCHESTRATION_ROLE,
  _EVIDENCE_KIND,
} from './types';
import {
  unique,
  limitSorted,
  buildAdjacency,
  nodeFamilies,
  nodeHasLayer,
  hasValidationEvidence,
  buildCriticalSurfaceIds,
  deriveSurfaceId,
  buildScopeFileCountBySurface,
  describeSurface,
} from './helpers-core';
import {
  findSurfaceComponentIds,
  chooseCapabilityLabelNode,
  classifyTruthModeFromScore,
  classifyCapabilityTruthMode,
  mapToExtendedMode,
  inferCriticality,
  computeCapabilityBlockers,
} from './helpers-classify';
import { discoverFlows, findOrphanedArtifactIds } from './discovery-flows';

type ProductModelCache = {
  nodeById: Map<string, PulseStructuralNode>;
  nodeFamiliesById: Map<string, string[]>;
  nodeLayersById: Map<string, Set<string>>;
  validationById: Map<string, boolean>;
  familyTokensByValue: Map<string, string[]>;
};

function buildProductModelCache(graph: PulseStructuralGraph): ProductModelCache {
  return {
    nodeById: new Map(graph.nodes.map((node) => [node.id, node] as const)),
    nodeFamiliesById: new Map(graph.nodes.map((node) => [node.id, nodeFamilies(node)] as const)),
    nodeLayersById: new Map(),
    validationById: new Map(),
    familyTokensByValue: new Map(),
  };
}

function cachedFamilyTokens(cache: ProductModelCache, family: string): string[] {
  const existing = cache.familyTokensByValue.get(family);
  if (existing) {
    return existing;
  }
  const tokens = getFamilyTokens(family);
  cache.familyTokensByValue.set(family, tokens);
  return tokens;
}

function toFamilyList(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((entry): entry is string => Boolean(entry));
}

function tokenGroupsOverlap(leftTokens: string[], rightTokens: string[]): boolean {
  const leftSlug = leftTokens.join('-');
  const rightSlug = rightTokens.join('-');
  if (leftSlug === rightSlug) {
    return true;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token));

  if (leftTokens.length === 1 || rightTokens.length === 1) {
    return shared.length > 0;
  }
  if (shared.length >= 2) {
    return true;
  }

  const smaller = leftTokens.length <= rightTokens.length ? leftSet : rightSet;
  const larger = leftTokens.length <= rightTokens.length ? rightSet : leftSet;
  return [...smaller].every((token) => larger.has(token));
}

function cachedFamiliesOverlap(
  cache: ProductModelCache,
  left: string | string[] | null | undefined,
  right: string | string[] | null | undefined,
): boolean {
  const rightFamilies = toFamilyList(right);
  return toFamilyList(left).some((leftFamily) => {
    const leftTokens = cachedFamilyTokens(cache, leftFamily);
    if (leftTokens.length === 0) {
      return false;
    }

    return rightFamilies.some((rightFamily) => {
      const rightTokens = cachedFamilyTokens(cache, rightFamily);
      return rightTokens.length > 0 && tokenGroupsOverlap(leftTokens, rightTokens);
    });
  });
}

function cachedNodeLayers(cache: ProductModelCache, node: PulseStructuralNode): Set<string> {
  const existing = cache.nodeLayersById.get(node.id);
  if (existing) {
    return existing;
  }
  const layers = new Set<string>();
  for (const layer of ['frontend', 'backend', 'persistence', 'worker', 'external', 'evidence']) {
    if (nodeHasLayer(node, layer as Parameters<typeof nodeHasLayer>[1])) {
      layers.add(layer);
    }
  }
  cache.nodeLayersById.set(node.id, layers);
  return layers;
}

function cachedNodeHasLayer(
  cache: ProductModelCache,
  node: PulseStructuralNode,
  layer: Parameters<typeof nodeHasLayer>[1],
): boolean {
  return cachedNodeLayers(cache, node).has(layer);
}

function cachedHasValidationEvidence(cache: ProductModelCache, node: PulseStructuralNode): boolean {
  const existing = cache.validationById.get(node.id);
  if (existing !== undefined) {
    return existing;
  }
  const value = hasValidationEvidence(node);
  cache.validationById.set(node.id, value);
  return value;
}

function calculateSurfaceCompletenessCached(
  cache: ProductModelCache,
  artifactIds: string[],
): number {
  const nodes = artifactIds
    .map((id) => cache.nodeById.get(id))
    .filter((node) => node !== undefined) as PulseStructuralNode[];
  if (nodes.length === deriveZeroValue()) {
    return deriveZeroValue();
  }

  const hasUI = nodes.some((node) => cachedNodeHasLayer(cache, node, 'frontend'));
  const hasAPI = nodes.some((node) => cachedNodeHasLayer(cache, node, 'backend'));
  const hasStorage = nodes.some((node) => cachedNodeHasLayer(cache, node, 'persistence'));

  const surfaceLayerScore =
    (deriveHttpStatusFromObservedCatalog('Payment Required') -
      deriveUnitValue() -
      deriveUnitValue() -
      deriveUnitValue() -
      deriveUnitValue() -
      deriveUnitValue() -
      deriveUnitValue()) /
    (deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue());
  const surfaceStorageScore =
    (deriveHttpStatusFromObservedCatalog('Not Found') +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()) /
    (deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue());

  let score = deriveZeroValue();
  if (hasUI) {
    score += surfaceLayerScore;
  }
  if (hasAPI) {
    score += surfaceLayerScore;
  }
  if (hasStorage) {
    score += surfaceStorageScore;
  }
  return score;
}

/**
 * Build product graph from structural graph
 * Transforms code into product surfaces, capabilities, and flows
 */
export function buildProductModel(input: BuildProductModelInput): PulseProductGraph {
  const { structuralGraph, scopeState, resolvedManifest } = input;
  const cache = buildProductModelCache(structuralGraph);

  const surfaces = discoverSurfaces(structuralGraph, scopeState, resolvedManifest, cache);
  const capabilities = discoverCapabilities(
    structuralGraph,
    surfaces,
    scopeState,
    resolvedManifest,
    cache,
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
  cache: ProductModelCache,
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
        .filter((node) =>
          cachedFamiliesOverlap(cache, cache.nodeFamiliesById.get(node.id) || [], families),
        )
        .map((node) => node.id),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    if (artifactIds.length === deriveZeroValue() && !moduleEntry.declaredByManifest) {
      continue;
    }
    const surfaceId = slugifyStructural(
      moduleEntry.key || moduleEntry.canonicalName || moduleEntry.name,
    );
    if (!surfaceId) {
      continue;
    }
    const completeness = calculateSurfaceCompletenessCached(cache, artifactIds);
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
      truthMode:
        artifactIds.length > 0 ? classifyTruthModeFromScore(completeness) : _ASPIRATIONAL_TRUTH,
    });
  }

  for (const aggregate of scopeState.moduleAggregates) {
    const surfaceId = slugifyStructural(aggregate.moduleKey);
    if (!surfaceId || surfacesById.has(surfaceId)) {
      continue;
    }
    const artifactIds = limitSorted(
      graph.nodes
        .filter((node) =>
          cachedFamiliesOverlap(cache, cache.nodeFamiliesById.get(node.id) || [], surfaceId),
        )
        .map((node) => node.id),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    const completeness = calculateSurfaceCompletenessCached(cache, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: titleCaseStructural(surfaceId),
      description: describeSurface(artifactIds.length, 0, aggregate.fileCount),
      artifactIds,
      capabilities: [],
      completeness,
      truthMode:
        artifactIds.length > 0 ? classifyTruthModeFromScore(completeness) : _ASPIRATIONAL_TRUTH,
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
    const completeness = calculateSurfaceCompletenessCached(cache, artifactIds);
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
  cache: ProductModelCache,
): PulseProductCapability[] {
  const capabilities: PulseProductCapability[] = [];
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

      if (relatedIds.length < deriveUnitValue() + deriveUnitValue()) {
        continue;
      }

      const relatedNodes = relatedIds
        .map((id) => cache.nodeById.get(id))
        .filter((n) => n !== undefined) as PulseStructuralNode[];
      const labelNode = chooseCapabilityLabelNode(relatedNodes);

      const hasUI = relatedNodes.some((node) => cachedNodeHasLayer(cache, node, 'frontend'));
      const hasAPI = relatedNodes.some((node) => cachedNodeHasLayer(cache, node, 'backend'));
      const hasStorage = relatedNodes.some((node) =>
        cachedNodeHasLayer(cache, node, 'persistence'),
      );
      const hasRuntime = relatedNodes.some(
        (node) => node.role === _ORCHESTRATION_ROLE || cachedNodeHasLayer(cache, node, 'worker'),
      );
      const hasValidation = relatedNodes.some((node) => cachedHasValidationEvidence(cache, node));
      const hasObservability = relatedNodes.some(
        (node) => node.kind === _EVIDENCE_KIND || cachedNodeHasLayer(cache, node, 'evidence'),
      );

      const layersCheck = [hasUI, hasAPI, hasStorage, hasRuntime, hasValidation, hasObservability];
      const layersPresent = layersCheck.filter(Boolean).length;
      const layerCount =
        observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) -
        (deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue());
      const percentScale =
        deriveHttpStatusFromObservedCatalog('OK') / (deriveUnitValue() + deriveUnitValue());
      const maturityScore = Math.round((layersPresent / layerCount) * percentScale);

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
