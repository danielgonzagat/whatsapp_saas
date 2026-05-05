// TODO(phase-8): Wire DefinitionOfDoneEngine into capability status computation.
// For each capability emitted by buildCapabilityState, call evaluateDone() from
// './definition-of-done' using the capability's structural role evidence and
// Codacy high count to drive the final CapabilityStatus ('real'/'partial'/'latent'/'phantom').
// See: scripts/pulse/definition-of-done.ts and scripts/pulse/__tests__/definition-of-done.spec.ts

import type { PulseCapability, PulseCapabilityState } from '../../types.capabilities';
import type { PulseCodacyEvidence, PulseStructuralGraph } from '../../types.structural';
import type { PulseExecutionEvidence } from '../../types.evidence';
import type { PulseResolvedManifest } from '../../types.resolved-manifest';
import type { PulseScopeState } from '../../types.truth.scope';
import { buildObservationFootprint } from '../../execution-observation';
import { hasApiCalls } from '../../capability-ui-seeds';
import { buildFallbackGroups, buildSeedGroups } from '../../capability-seed-groups';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import {
  getNodeFamilies,
  getNodeRoutePatterns,
  getPrimaryFamily,
  graphTraversalDepthLimit,
  reachableRoutePatternLimit,
  unique,
} from '../../capability-model-helpers';
import {
  collectScenarioResults,
  countCapabilityStatus,
  countHumanRequiredCapabilities,
  countMaturityStage,
  roleBlocksTraversal,
  sameToken,
} from './helpers';
import { processGroup, type ProcessGroupContext } from './builder-process-group';

// DoD helpers (`buildCapabilityDoDEvidence`, `toDoDStatus`) and the
// `CAPABILITY_REQUIRED_DOD_ROLES` constant were extracted into
// `./capability-model.dod` so this file stays under the 600-line
// touched-file architecture cap. Their behaviour is unchanged.

interface BuildCapabilityStateInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

export function buildCapabilityState(input: BuildCapabilityStateInput): PulseCapabilityState {
  const nodeById = new Map(input.structuralGraph.nodes.map((node) => [node.id, node] as const));
  const neighbors = new Map<string, Set<string>>();
  const nodeFamilies = new Map<string, string[]>();
  const primaryFamilyByNode = new Map<string, string | null>();

  for (const node of input.structuralGraph.nodes) {
    neighbors.set(node.id, new Set<string>());
    nodeFamilies.set(node.id, getNodeFamilies(node));
    primaryFamilyByNode.set(node.id, getPrimaryFamily(node));
  }

  for (const edge of input.structuralGraph.edges) {
    if (!neighbors.has(edge.from)) {
      neighbors.set(edge.from, new Set<string>());
    }
    neighbors.get(edge.from)!.add(edge.to);
  }

  const routePatternsByReachableNode = new Map<string, Set<string>>();
  const reachableRoutePatternLimitValue = reachableRoutePatternLimit(input.structuralGraph.nodes);
  const registerReachableRoutePattern = (nodeId: string, routePattern: string) => {
    if (!routePatternsByReachableNode.has(nodeId)) {
      routePatternsByReachableNode.set(nodeId, new Set<string>());
    }
    const patterns = routePatternsByReachableNode.get(nodeId)!;
    if (patterns.size < reachableRoutePatternLimitValue) {
      patterns.add(routePattern);
    }
  };
  const interfaceSeedNodes = input.structuralGraph.nodes.filter((node) => {
    if (node.kind === 'proxy_route' || node.kind === 'backend_route') {
      return true;
    }
    return (
      Array.isArray(node.metadata.triggers) && node.metadata.triggers.length > deriveZeroValue()
    );
  });
  for (const seedNode of interfaceSeedNodes) {
    const seedPatterns = getNodeRoutePatterns(seedNode);
    if (seedPatterns.length === deriveZeroValue()) {
      continue;
    }
    const queue = [{ nodeId: seedNode.id, depth: 0 }];
    const visited = new Set<string>();
    const traversalDepthLimit = graphTraversalDepthLimit({
      nodeCount: input.structuralGraph.nodes.length,
      edgeCount: input.structuralGraph.edges.length,
      seedPatternCount: seedPatterns.length,
    });
    while (queue.length > deriveZeroValue()) {
      const current = queue.shift();
      if (!current || visited.has(current.nodeId) || current.depth > traversalDepthLimit) {
        continue;
      }
      visited.add(current.nodeId);
      for (const routePattern of seedPatterns) {
        registerReachableRoutePattern(current.nodeId, routePattern);
      }
      const currentNode = nodeById.get(current.nodeId);
      if (!currentNode || roleBlocksTraversal(currentNode.role)) {
        continue;
      }
      for (const neighborId of neighbors.get(current.nodeId) || []) {
        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }
  }

  const scopeByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  const flowResults = input.executionEvidence?.flows?.results || [];
  const scenarioResults = collectScenarioResults(input.executionEvidence);
  const observationFootprint = buildObservationFootprint(
    input.resolvedManifest,
    input.executionEvidence,
  );
  const capabilitiesById = new Map<string, PulseCapability>();
  const visitedByPrimaryCapability = new Set<string>();
  const apiBackedUiFiles = new Set(
    [
      ...input.structuralGraph.nodes.filter(
        (node) => node.kind === 'ui_element' && hasApiCalls(node),
      ),
      ...input.structuralGraph.nodes.filter((node) => node.kind === 'api_call'),
    ]
      .map((node) => node.file)
      .filter(Boolean),
  );
  const skippedServiceSeedFiles = new Set<string>();
  for (const edge of input.structuralGraph.edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (
      sameToken(edge.kind, 'orchestrates') &&
      sameToken(fromNode?.kind, 'backend_route') &&
      sameToken(toNode?.kind, 'service_trace') &&
      toNode.file
    ) {
      skippedServiceSeedFiles.add(toNode.file);
    }
  }

  const processGroupCtx: ProcessGroupContext = {
    nodeById,
    neighbors,
    nodeFamilies,
    primaryFamilyByNode,
    routePatternsByReachableNode,
    scopeByPath,
    flowResults,
    scenarioResults,
    observationFootprint,
    capabilitiesById,
    visitedByPrimaryCapability,
  };

  const seedGroups = buildSeedGroups(
    input.structuralGraph.nodes,
    apiBackedUiFiles,
    skippedServiceSeedFiles,
    getPrimaryFamily,
  );
  for (const group of seedGroups) {
    processGroup(
      processGroupCtx,
      group,
      group.seedNodeIds.size <= input.structuralGraph.nodes.length,
    );
  }

  const fallbackGroups = buildFallbackGroups(
    input.structuralGraph.nodes,
    visitedByPrimaryCapability,
    apiBackedUiFiles,
    skippedServiceSeedFiles,
    getPrimaryFamily,
  );
  for (const group of fallbackGroups) {
    processGroup(
      processGroupCtx,
      group,
      group.seedNodeIds.size > input.structuralGraph.nodes.length,
    );
  }

  const sortedCapabilities = [...capabilitiesById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: sortedCapabilities.length,
      realCapabilities: countCapabilityStatus(sortedCapabilities, 'real'),
      partialCapabilities: countCapabilityStatus(sortedCapabilities, 'partial'),
      latentCapabilities: countCapabilityStatus(sortedCapabilities, 'latent'),
      phantomCapabilities: countCapabilityStatus(sortedCapabilities, 'phantom'),
      humanRequiredCapabilities: countHumanRequiredCapabilities(sortedCapabilities),
      foundationalCapabilities: countMaturityStage(sortedCapabilities, 'foundational'),
      connectedCapabilities: countMaturityStage(sortedCapabilities, 'connected'),
      operationalCapabilities: countMaturityStage(sortedCapabilities, 'operational'),
      productionReadyCapabilities: countMaturityStage(sortedCapabilities, 'production_ready'),
      runtimeObservedCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.dimensions.runtimeEvidencePresent,
      ).length,
      scenarioCoveredCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.dimensions.scenarioCoveragePresent,
      ).length,
    },
    capabilities: sortedCapabilities,
  };
}
