// PULSE — Live Codebase Nervous System
// Capability model: structural graph traversal and label helpers

import * as path from 'path';
import type { PulseStructuralNode, PulseStructuralRole } from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  deriveTextFamily,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from './structural-family';
import { unique } from './capability-model.helpers';

export function getNodeFamilies(node: PulseStructuralNode): string[] {
  const apiCalls = Array.isArray(node.metadata.apiCalls)
    ? (node.metadata.apiCalls as string[])
    : [];
  const serviceCalls = Array.isArray(node.metadata.serviceCalls)
    ? (node.metadata.serviceCalls as string[])
    : [];
  const prismaModels = Array.isArray(node.metadata.prismaModels)
    ? (node.metadata.prismaModels as string[])
    : [];
  const triggers = Array.isArray(node.metadata.triggers)
    ? (node.metadata.triggers as string[])
    : [];
  const filePath = String(
    node.metadata.filePath || node.metadata.backendPath || node.metadata.frontendPath || node.file,
  );
  const fileBasename = filePath ? path.basename(filePath) : '';
  return deriveStructuralFamilies([
    String(node.metadata.normalizedPath || ''),
    String(node.metadata.fullPath || ''),
    String(node.metadata.frontendPath || ''),
    String(node.metadata.endpoint || ''),
    String(node.metadata.backendPath || ''),
    fileBasename,
    String(node.metadata.modelName || ''),
    String(node.metadata.serviceName || ''),
    String(node.metadata.methodName || ''),
    ...apiCalls,
    ...serviceCalls,
    ...prismaModels,
    ...triggers,
    node.file,
    node.label,
  ]);
}

export function getPrimaryFamily(node: PulseStructuralNode): string | null {
  const apiCalls = Array.isArray(node.metadata.apiCalls)
    ? (node.metadata.apiCalls as string[])
    : [];
  const prismaModels = Array.isArray(node.metadata.prismaModels)
    ? (node.metadata.prismaModels as string[])
    : [];
  const triggers = Array.isArray(node.metadata.triggers)
    ? (node.metadata.triggers as string[])
    : [];
  const serviceName = String(node.metadata.serviceName || '');
  const filePath = String(
    node.metadata.filePath || node.metadata.backendPath || node.metadata.frontendPath || node.file,
  );
  const fileBasename = filePath ? path.basename(filePath) : '';
  return (
    apiCalls
      .map((apiCall) => deriveRouteFamily(apiCall))
      .find((value): value is string => Boolean(value)) ||
    deriveRouteFamily(String(node.metadata.normalizedPath || '')) ||
    deriveRouteFamily(String(node.metadata.fullPath || '')) ||
    deriveRouteFamily(String(node.metadata.frontendPath || '')) ||
    deriveRouteFamily(String(node.metadata.endpoint || '')) ||
    deriveRouteFamily(String(node.metadata.backendPath || '')) ||
    deriveTextFamily(serviceName) ||
    deriveTextFamily(String(node.metadata.modelName || '')) ||
    prismaModels
      .map((modelName) => deriveTextFamily(modelName))
      .find((value): value is string => Boolean(value)) ||
    triggers
      .map((trigger) => deriveTextFamily(trigger))
      .find((value): value is string => Boolean(value)) ||
    deriveTextFamily(fileBasename) ||
    deriveTextFamily(node.file) ||
    deriveTextFamily(node.label) ||
    null
  );
}

export function getNodeRoutePatterns(node: PulseStructuralNode): string[] {
  const directPatterns = [
    node.metadata.fullPath,
    node.metadata.frontendPath,
    node.metadata.normalizedPath,
    node.metadata.endpoint,
    node.metadata.backendPath,
  ]
    .filter(Boolean)
    .map((value) => String(value));
  const triggers = Array.isArray(node.metadata.triggers)
    ? (node.metadata.triggers as string[])
    : [];
  return unique([...directPatterns, ...triggers]);
}

export function shouldTraverseNeighbor(
  currentNode: PulseStructuralNode,
  neighborNode: PulseStructuralNode,
  family: string,
  neighborFamilies: string[],
  neighborPrimaryFamily: string | null,
): boolean {
  const familyAligned = neighborFamilies.length === 0 || familiesOverlap(neighborFamilies, family);

  if (
    neighborNode.role === 'persistence' ||
    neighborNode.role === 'side_effect' ||
    neighborNode.role === 'simulation'
  ) {
    return (
      (familyAligned || currentNode.role === 'orchestration') &&
      (currentNode.role === 'interface' || currentNode.role === 'orchestration')
    );
  }

  if (neighborNode.role === 'orchestration' && currentNode.role === 'orchestration') {
    return true;
  }

  const primaryAligned =
    !neighborPrimaryFamily || familiesOverlap(neighborPrimaryFamily, family) || familyAligned;

  if (!primaryAligned) {
    return false;
  }

  if (neighborNode.role === 'orchestration') {
    return familyAligned;
  }

  if (neighborNode.role === 'interface') {
    return familyAligned && currentNode.role !== 'persistence';
  }

  return familyAligned;
}

export function chooseDominantLabel(
  componentNodes: PulseStructuralNode[],
  routePatterns: string[],
  fallbackId: number,
  family: string,
): string {
  const routeFamily = deriveRouteFamily(routePatterns[0] || '');
  const textFamily = deriveTextFamily(componentNodes.map((node) => node.label).join(' '));
  const preferred = routeFamily || family || textFamily || '';

  if (preferred) {
    return titleCaseStructural(preferred);
  }

  const textLabel = deriveTextFamily(
    componentNodes
      .map((node) =>
        [
          String(node.metadata.modelName || ''),
          String(node.metadata.serviceName || ''),
          String(node.metadata.methodName || ''),
          node.file,
          node.label,
        ].join(' '),
      )
      .join(' '),
  );
  if (textLabel) {
    return titleCaseStructural(textLabel);
  }

  return `Capability ${fallbackId}`;
}

export { slugifyStructural, deriveStructuralFamilies, familiesOverlap, deriveRouteFamily };
export type { PulseStructuralRole };

import type { PulseStructuralEdge } from './types';

/** Build neighbors map and reachable route patterns from structural graph edges. */
export function buildRoutePatternReachability(
  nodes: PulseStructuralNode[],
  edges: PulseStructuralEdge[],
  nodeById: Map<string, PulseStructuralNode>,
  maxPatternsPerNode: number,
): { neighbors: Map<string, Set<string>>; routePatternsByReachableNode: Map<string, Set<string>> } {
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) {
    neighbors.set(node.id, new Set<string>());
  }
  for (const edge of edges) {
    if (!neighbors.has(edge.from)) {
      neighbors.set(edge.from, new Set<string>());
    }
    neighbors.get(edge.from)!.add(edge.to);
  }

  const routePatternsByReachableNode = new Map<string, Set<string>>();
  const registerPattern = (nodeId: string, routePattern: string) => {
    if (!routePatternsByReachableNode.has(nodeId)) {
      routePatternsByReachableNode.set(nodeId, new Set<string>());
    }
    const patterns = routePatternsByReachableNode.get(nodeId)!;
    if (patterns.size < maxPatternsPerNode) {
      patterns.add(routePattern);
    }
  };

  const interfaceSeedNodes = nodes.filter((node) => {
    if (node.kind === 'proxy_route' || node.kind === 'backend_route') {
      return true;
    }
    return Array.isArray(node.metadata.triggers) && node.metadata.triggers.length > 0;
  });

  for (const seedNode of interfaceSeedNodes) {
    const seedPatterns = getNodeRoutePatterns(seedNode);
    if (seedPatterns.length === 0) {
      continue;
    }
    const queue = [{ nodeId: seedNode.id, depth: 0 }];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.nodeId) || current.depth > 8) {
        continue;
      }
      visited.add(current.nodeId);
      for (const routePattern of seedPatterns) {
        registerPattern(current.nodeId, routePattern);
      }
      const currentNode = nodeById.get(current.nodeId);
      if (
        !currentNode ||
        currentNode.role === 'persistence' ||
        currentNode.role === 'side_effect' ||
        currentNode.role === 'simulation'
      ) {
        continue;
      }
      for (const neighborId of neighbors.get(current.nodeId) || []) {
        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }
  }

  return { neighbors, routePatternsByReachableNode };
}
