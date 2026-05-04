import type {
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseStructuralEdge,
  PulseStructuralNode,
} from './types';
import { buildObservationFootprint, footprintMatchesFamilies } from './execution-observation';
import { deriveStructuralFamilies } from './structural-family';

function nodeFamilies(node: PulseStructuralNode): string[] {
  const apiCalls = Array.isArray(node.metadata.apiCalls)
    ? (node.metadata.apiCalls as string[])
    : [];
  const serviceCalls = Array.isArray(node.metadata.serviceCalls)
    ? (node.metadata.serviceCalls as string[])
    : [];
  const prismaModels = Array.isArray(node.metadata.prismaModels)
    ? (node.metadata.prismaModels as string[])
    : [];

  return deriveStructuralFamilies([
    node.file,
    node.label,
    String(node.metadata.normalizedPath || ''),
    String(node.metadata.endpoint || ''),
    String(node.metadata.frontendPath || ''),
    String(node.metadata.backendPath || ''),
    String(node.metadata.fullPath || ''),
    String(node.metadata.modelName || ''),
    String(node.metadata.serviceName || ''),
    String(node.metadata.methodName || ''),
    ...apiCalls,
    ...serviceCalls,
    ...prismaModels,
  ]);
}

function shouldSeedObservedNode(
  node: PulseStructuralNode,
  footprint: ReturnType<typeof buildObservationFootprint>,
): boolean {
  if (footprint.routeFamilies.length === 0 && footprint.moduleFamilies.length === 0) {
    return false;
  }

  if (!['interface', 'orchestration', 'simulation'].includes(node.role) && node.kind !== 'facade') {
    return false;
  }

  return footprintMatchesFamilies(nodeFamilies(node), footprint);
}

/** Mark observed structural graph. */
export function markObservedStructuralGraph(input: {
  nodes: PulseStructuralNode[];
  edges: PulseStructuralEdge[];
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}): { nodes: PulseStructuralNode[]; edges: PulseStructuralEdge[] } {
  const observationFootprint = buildObservationFootprint(
    input.resolvedManifest,
    input.executionEvidence,
  );
  const outgoingByNode = new Map<string, PulseStructuralEdge[]>();
  const incomingByNode = new Map<string, PulseStructuralEdge[]>();

  for (const edge of input.edges) {
    if (!outgoingByNode.has(edge.from)) {
      outgoingByNode.set(edge.from, []);
    }
    if (!incomingByNode.has(edge.to)) {
      incomingByNode.set(edge.to, []);
    }
    outgoingByNode.get(edge.from)!.push(edge);
    incomingByNode.get(edge.to)!.push(edge);
  }

  const backwardObservableKinds = new Set<PulseStructuralEdge['kind']>([
    'calls',
    'proxies_to',
    'routes_to',
  ]);
  const observedNodeIds = new Set(
    input.nodes
      .filter((node) => shouldSeedObservedNode(node, observationFootprint))
      .map((node) => node.id),
  );
  const observedEdgeIds = new Set<string>();
  const observationQueue = [...observedNodeIds];

  while (observationQueue.length > 0) {
    const currentNodeId = observationQueue.shift()!;

    for (const edge of outgoingByNode.get(currentNodeId) || []) {
      observedEdgeIds.add(edge.id);
      if (!observedNodeIds.has(edge.to)) {
        observedNodeIds.add(edge.to);
        observationQueue.push(edge.to);
      }
    }

    for (const edge of incomingByNode.get(currentNodeId) || []) {
      if (!backwardObservableKinds.has(edge.kind)) {
        continue;
      }
      observedEdgeIds.add(edge.id);
      if (!observedNodeIds.has(edge.from)) {
        observedNodeIds.add(edge.from);
        observationQueue.push(edge.from);
      }
    }
  }

  return {
    nodes: input.nodes
      .map((node) =>
        observedNodeIds.has(node.id) ? { ...node, truthMode: 'observed' as const } : node,
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: input.edges
      .map((edge) =>
        observedEdgeIds.has(edge.id) ? { ...edge, truthMode: 'observed' as const } : edge,
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
