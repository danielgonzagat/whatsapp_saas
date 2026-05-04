import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseResolvedManifest,
  PulseProductCapability,
  PulseProductFlow,
} from '../../types';
import {
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from '../../structural-family';
import {
  deriveCapabilityFlowId,
  determineTruthModeFromCapabilities,
  isExcludedArtifact,
  isStructuralFlowCandidate,
  limitSorted,
  unique,
} from './helpers';
import { MAX_PRODUCT_FLOWS } from './types';

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

export function findOrphanedArtifactIds(
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

export function discoverFlows(
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
