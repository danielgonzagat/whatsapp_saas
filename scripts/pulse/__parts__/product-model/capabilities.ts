import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseScopeState,
  PulseResolvedManifest,
  PulseProductCapability,
  PulseProductSurface,
} from '../../types';
import { slugifyStructural, titleCaseStructural } from '../../structural-family';
import {
  buildAdjacency,
  buildCriticalSurfaceIds,
  chooseCapabilityLabelNode,
  classifyCapabilityTruthMode,
  computeCapabilityBlockers,
  findSurfaceComponentIds,
  hasValidationEvidence,
  inferCriticality,
  limitSorted,
  nodeHasLayer,
} from './helpers';
import { MAX_CAPABILITY_ARTIFACT_IDS, MAX_PRODUCT_CAPABILITIES } from './types';

export function discoverCapabilities(
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
