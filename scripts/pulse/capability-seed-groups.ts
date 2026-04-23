import type { PulseStructuralNode } from './types';
import { shouldSkipUiSeed } from './capability-ui-seeds';

export interface CapabilitySeedGroup {
  family: string;
  seedNodeIds: Set<string>;
}

type CapabilityFamilyResolver = (node: PulseStructuralNode) => string | null;

function addSeed(grouped: Map<string, Set<string>>, family: string, nodeId: string) {
  if (!grouped.has(family)) {
    grouped.set(family, new Set<string>());
  }
  grouped.get(family)!.add(nodeId);
}

function toSortedSeedGroups(grouped: Map<string, Set<string>>): CapabilitySeedGroup[] {
  return [...grouped.entries()]
    .map(([family, seedNodeIds]) => ({ family, seedNodeIds }))
    .sort((left, right) => {
      const specificity = right.family.split('-').length - left.family.split('-').length;
      return specificity || left.family.localeCompare(right.family);
    });
}

export function buildSeedGroups(
  nodes: PulseStructuralNode[],
  apiBackedUiFiles: Set<string>,
  skippedServiceSeedFiles: Set<string>,
  getPrimaryFamily: CapabilityFamilyResolver,
): CapabilitySeedGroup[] {
  const grouped = new Map<string, Set<string>>();

  for (const node of nodes) {
    if (
      shouldSkipUiSeed(node, apiBackedUiFiles) ||
      (node.kind === 'service_trace' && skippedServiceSeedFiles.has(node.file)) ||
      (node.role !== 'interface' && node.role !== 'orchestration')
    ) {
      continue;
    }
    const family = getPrimaryFamily(node);
    if (family) {
      addSeed(grouped, family, node.id);
    }
  }

  if (grouped.size === 0) {
    for (const node of nodes) {
      if (shouldSkipUiSeed(node, apiBackedUiFiles)) {
        continue;
      }
      const family = getPrimaryFamily(node);
      if (family) {
        addSeed(grouped, family, node.id);
      }
    }
  }

  return toSortedSeedGroups(grouped);
}

export function buildFallbackGroups(
  nodes: PulseStructuralNode[],
  visitedByPrimaryCapability: Set<string>,
  apiBackedUiFiles: Set<string>,
  skippedServiceSeedFiles: Set<string>,
  getPrimaryFamily: CapabilityFamilyResolver,
): CapabilitySeedGroup[] {
  const grouped = new Map<string, Set<string>>();

  for (const node of nodes) {
    if (
      visitedByPrimaryCapability.has(node.id) ||
      shouldSkipUiSeed(node, apiBackedUiFiles) ||
      (node.kind === 'service_trace' && skippedServiceSeedFiles.has(node.file))
    ) {
      continue;
    }
    const family = getPrimaryFamily(node);
    if (family) {
      addSeed(grouped, family, node.id);
    }
  }

  return toSortedSeedGroups(grouped);
}
