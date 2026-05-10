import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseTruthMode,
} from '../../types.structural';
import type { PulseProductCapability } from '../../types.product-graph';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import {
  _OBSERVED_TRUTH,
  _INFERRED_TRUTH,
  _ASPIRATIONAL_TRUTH,
  _INTERFACE_ROLE,
  _BACKEND_ROUTE_KIND,
  _API_CALL_KIND,
  type CapabilityTruthMode,
} from './types';
import { nodeHasLayer } from './helpers-core';

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
    nodes.find((node) => node.role === _INTERFACE_ROLE) ||
    nodes.find((node) => node.kind === _BACKEND_ROUTE_KIND) ||
    nodes.find((node) => node.kind === _API_CALL_KIND) ||
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
  if (nodes.length === deriveZeroValue()) {
    return deriveZeroValue();
  }

  const hasUI = nodes.some((node) => nodeHasLayer(node, 'frontend'));
  const hasAPI = nodes.some((node) => nodeHasLayer(node, 'backend'));
  const hasStorage = nodes.some((node) => nodeHasLayer(node, 'persistence'));

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

export function classifyTruthModeFromScore(score: number): PulseTruthMode {
  if (
    score <
    deriveHttpStatusFromObservedCatalog('OK') /
      (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())
  ) {
    return _INFERRED_TRUTH;
  }
  if (
    score <
    deriveHttpStatusFromObservedCatalog('Bad Request') /
      (deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue())
  ) {
    return _ASPIRATIONAL_TRUTH;
  }
  return _OBSERVED_TRUTH;
}

export function classifyCapabilityTruthMode(maturityScore: number): PulseTruthMode {
  const capMidThreshold =
    deriveHttpStatusFromObservedCatalog('OK') /
    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue());
  const capHighThreshold =
    (deriveHttpStatusFromObservedCatalog('Unprocessable Entity') +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()) /
    (deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue());
  if (maturityScore < capMidThreshold) {
    return _INFERRED_TRUTH;
  }
  if (maturityScore < capHighThreshold) {
    return _ASPIRATIONAL_TRUTH;
  }
  return _OBSERVED_TRUTH;
}

/** Map PULSE truth mode to extended capability classification */
export function mapToExtendedMode(tm: PulseTruthMode): CapabilityTruthMode {
  if (tm === _OBSERVED_TRUTH) {
    return 'real';
  }
  if (tm === _ASPIRATIONAL_TRUTH) {
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
  if (nodes.some((node) => node.userFacing || node.truthMode === _OBSERVED_TRUTH)) {
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
  if (caps.length === deriveUnitValue() - deriveUnitValue()) {
    return _INFERRED_TRUTH;
  }
  if (caps.some((c) => c.truthMode === _INFERRED_TRUTH)) {
    return _INFERRED_TRUTH;
  }
  if (caps.some((c) => c.truthMode === _ASPIRATIONAL_TRUTH)) {
    return _ASPIRATIONAL_TRUTH;
  }
  return _OBSERVED_TRUTH;
}

export function isExcludedArtifact(file: string): boolean {
  return /\.(?:spec|test|d)\.[cm]?[jt]sx?$/.test(file) || file.endsWith('.config.ts');
}
