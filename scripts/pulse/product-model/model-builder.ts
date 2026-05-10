import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseTruthMode,
} from '../../types.structural';
import type { PulseScopeState } from '../../types.truth.scope';
import type { PulseResolvedManifest } from '../../types.resolved-manifest';
import type {
  PulseProductGraph,
  PulseProductCapability,
  PulseProductSurface,
} from '../../types.product-graph';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  observeStatusTextLengthFromCatalog,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from '../../structural-family';
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
  calculateSurfaceCompleteness,
  classifyTruthModeFromScore,
  classifyCapabilityTruthMode,
  mapToExtendedMode,
  inferCriticality,
  computeCapabilityBlockers,
} from './helpers-classify';
import { discoverFlows, findOrphanedArtifactIds } from './discovery-flows';

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
    if (artifactIds.length === deriveZeroValue() && !moduleEntry.declaredByManifest) {
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

      if (relatedIds.length < deriveUnitValue() + deriveUnitValue()) {
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
        (node) => node.role === _ORCHESTRATION_ROLE || nodeHasLayer(node, 'worker'),
      );
      const hasValidation = relatedNodes.some(hasValidationEvidence);
      const hasObservability = relatedNodes.some(
        (node) => node.kind === _EVIDENCE_KIND || nodeHasLayer(node, 'evidence'),
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
