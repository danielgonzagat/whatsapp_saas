// TODO(phase-8): Wire DefinitionOfDoneEngine into capability status computation.
// For each capability emitted by buildCapabilityState, call evaluateDone() from
// './definition-of-done' using the capability's structural role evidence and
// Codacy high count to drive the final CapabilityStatus ('real'/'partial'/'latent'/'phantom').
// See: scripts/pulse/definition-of-done.ts and scripts/pulse/__tests__/definition-of-done.spec.ts

import type {
  PulseCapability,
  PulseCapabilityState,
  PulseCodacyEvidence,
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralRole,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
} from './structural-family';
import { buildObservationFootprint, footprintMatchesFamilies } from './execution-observation';
import { hasApiCalls, shouldSkipUiSeed } from './capability-ui-seeds';
import {
  buildFallbackGroups,
  buildSeedGroups,
  type CapabilitySeedGroup,
} from './capability-seed-groups';

interface BuildCapabilityStateInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

import {
  buildCapabilityMaturity,
  chooseDominantLabel,
  chooseTruthMode,
  getNodeFamilies,
  getNodeRoutePatterns,
  getPrimaryFamily,
  inferStatus,
  MAX_REACHABLE_ROUTE_PATTERNS_PER_NODE,
  pickExecutionMode,
  pickOwnerLane,
  shouldTraverseNeighbor,
  unique,
  clamp,
} from './capability-model-helpers';
import type { PulseCapabilityDoD } from './types.capabilities';
import { evaluateDone } from './definition-of-done';
import {
  CAPABILITY_REQUIRED_DOD_ROLES,
  buildCapabilityDoDEvidence,
  toDoDStatus,
} from './capability-model.dod';
import { mergeExistingCapability } from './capability-model.merge';

// DoD helpers (`buildCapabilityDoDEvidence`, `toDoDStatus`) and the
// `CAPABILITY_REQUIRED_DOD_ROLES` constant were extracted into
// `./capability-model.dod` so this file stays under the 600-line
// touched-file architecture cap. Their behaviour is unchanged.

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
  const registerReachableRoutePattern = (nodeId: string, routePattern: string) => {
    if (!routePatternsByReachableNode.has(nodeId)) {
      routePatternsByReachableNode.set(nodeId, new Set<string>());
    }
    const patterns = routePatternsByReachableNode.get(nodeId)!;
    if (patterns.size < MAX_REACHABLE_ROUTE_PATTERNS_PER_NODE) {
      patterns.add(routePattern);
    }
  };
  const interfaceSeedNodes = input.structuralGraph.nodes.filter((node) => {
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
        registerReachableRoutePattern(current.nodeId, routePattern);
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

  const scopeByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  const flowResults = input.executionEvidence?.flows?.results || [];
  const scenarioResults = [
    ...(input.executionEvidence?.customer?.results || []),
    ...(input.executionEvidence?.operator?.results || []),
    ...(input.executionEvidence?.admin?.results || []),
    ...(input.executionEvidence?.soak?.results || []),
  ];
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
      edge.kind === 'orchestrates' &&
      fromNode?.kind === 'backend_route' &&
      toNode?.kind === 'service_trace' &&
      toNode.file
    ) {
      skippedServiceSeedFiles.add(toNode.file);
    }
  }

  const processGroup = (group: CapabilitySeedGroup, coverEntireComponent: boolean) => {
    const seedNodeIds = coverEntireComponent
      ? [...group.seedNodeIds].filter((nodeId) => !visitedByPrimaryCapability.has(nodeId))
      : [...group.seedNodeIds];
    const queue = seedNodeIds.map((nodeId) => ({ nodeId, depth: 0 }));
    const componentIds = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      if (componentIds.has(current.nodeId) || current.depth > 4) {
        continue;
      }

      const currentNode = nodeById.get(current.nodeId);
      if (!currentNode) {
        continue;
      }

      componentIds.add(current.nodeId);
      if (current.depth === 0 || coverEntireComponent) {
        visitedByPrimaryCapability.add(current.nodeId);
      }

      if (
        currentNode.role === 'persistence' ||
        currentNode.role === 'side_effect' ||
        currentNode.role === 'simulation'
      ) {
        continue;
      }

      for (const neighborId of neighbors.get(current.nodeId) || []) {
        if (componentIds.has(neighborId)) {
          continue;
        }
        const neighborNode = nodeById.get(neighborId);
        if (!neighborNode) {
          continue;
        }
        const neighborFamilies = nodeFamilies.get(neighborId) || [];
        if (
          shouldTraverseNeighbor(
            currentNode,
            neighborNode,
            group.family,
            neighborFamilies,
            primaryFamilyByNode.get(neighborId) || null,
          )
        ) {
          queue.push({ nodeId: neighborId, depth: current.depth + 1 });
        }
      }
    }

    if (componentIds.size === 0) {
      return;
    }

    const componentNodes = [...componentIds]
      .map((nodeId) => nodeById.get(nodeId))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const filePaths = unique(componentNodes.map((item) => item.file).filter(Boolean)).sort();
    const routePatterns = unique(
      componentNodes.flatMap((item) => [
        ...getNodeRoutePatterns(item),
        ...(item.role !== 'persistence' && item.role !== 'side_effect'
          ? [...(routePatternsByReachableNode.get(item.id) || new Set<string>())]
          : []),
      ]),
    ).sort();
    const routeExposesInterface = componentNodes.some(
      (item) =>
        item.kind === 'api_call' ||
        item.kind === 'proxy_route' ||
        item.kind === 'backend_route' ||
        (Array.isArray(item.metadata.triggers) && item.metadata.triggers.length > 0) ||
        Boolean(routePatternsByReachableNode.get(item.id)?.size),
    );
    const rolesPresent = unique([
      ...componentNodes.map((item) => item.role),
      routeExposesInterface ? 'interface' : '',
    ])
      .filter(Boolean)
      .sort() as PulseStructuralRole[];
    const scopeFiles = filePaths
      .map((filePath) => scopeByPath.get(filePath))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const ownerLane = pickOwnerLane(scopeFiles.map((file) => file.ownerLane));
    const executionMode = pickExecutionMode(scopeFiles.map((file) => file.executionMode));
    const protectedByGovernance =
      componentNodes.some((item) => item.protectedByGovernance) ||
      scopeFiles.some((item) => item.protectedByGovernance);
    const runtimeCritical =
      componentNodes.some((item) => item.runtimeCritical) ||
      scopeFiles.some((item) => item.runtimeCritical);
    const userFacing =
      componentNodes.some((item) => item.userFacing) || scopeFiles.some((item) => item.userFacing);
    const codacyIssueCount = scopeFiles.reduce(
      (sum, file) => sum + (file.observedCodacyIssueCount || 0),
      0,
    );
    const highSeverityIssueCount = scopeFiles.reduce(
      (sum, file) => sum + (file.highSeverityIssueCount || 0),
      0,
    );
    const routeFamilies = unique(
      routePatterns.map((routePattern) => deriveRouteFamily(routePattern)).filter(Boolean),
    ) as string[];
    const capabilityId = `capability:${slugifyStructural(group.family) || `cluster-${capabilitiesById.size + 1}`}`;
    const flowEvidenceMatches = flowResults.filter(
      (result) =>
        routeFamilies.some((family) => result.flowId.includes(family)) ||
        result.flowId.includes(slugifyStructural(group.family)),
    );
    const observedFlowEvidenceMatches = flowEvidenceMatches.filter(
      (result) => result.executed || result.status === 'failed',
    );
    const dominantLabel = chooseDominantLabel(
      componentNodes,
      routePatterns,
      capabilitiesById.size + 1,
      group.family,
    );
    const capabilityFamilies = deriveStructuralFamilies([
      group.family,
      capabilityId,
      dominantLabel,
      ...routePatterns,
      ...filePaths,
    ]);
    const simulationOnly = rolesPresent.includes('simulation') && rolesPresent.length === 1;
    const scenarioCoverageMatches = scenarioResults.filter(
      (result) =>
        result.executed &&
        familiesOverlap(
          [group.family, capabilityId, dominantLabel, ...routePatterns],
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const scenarioFailureMatches = scenarioResults.filter(
      (result) =>
        result.status === 'failed' &&
        familiesOverlap(
          [group.family, capabilityId, dominantLabel, ...routePatterns],
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const runtimeObserved = footprintMatchesFamilies(capabilityFamilies, observationFootprint);
    const executedEvidenceCount =
      observedFlowEvidenceMatches.length +
      scenarioCoverageMatches.length +
      (runtimeObserved ? 1 : 0);
    const hasObservedFailure =
      observedFlowEvidenceMatches.some((result) => result.status === 'failed') ||
      scenarioFailureMatches.length > 0 ||
      (highSeverityIssueCount > 0 && runtimeCritical);
    const status = inferStatus(rolesPresent, simulationOnly, hasObservedFailure);
    const missingRoles = (
      ['interface', 'orchestration', 'persistence', 'side_effect'] as PulseStructuralRole[]
    ).filter((role) => !rolesPresent.includes(role));
    const truthMode = chooseTruthMode(executedEvidenceCount > 0, status === 'latent');
    const completenessScore =
      rolesPresent.filter((role) =>
        ['interface', 'orchestration', 'persistence', 'side_effect'].includes(role),
      ).length / 4;
    const confidence = clamp(
      completenessScore +
        (executedEvidenceCount > 0 ? 0.25 : 0) +
        (runtimeObserved ? 0.05 : 0) +
        (highSeverityIssueCount > 0 ? -0.15 : 0) +
        (componentNodes.length >= 4 ? 0.1 : 0),
    );
    const evidenceSources = unique([
      ...componentNodes.map((item) => item.adapter),
      observedFlowEvidenceMatches.length > 0 ? 'execution-flow-evidence' : '',
      scenarioCoverageMatches.length > 0 ? 'scenario-coverage' : '',
      runtimeObserved ? 'runtime-observation' : '',
    ]).filter(Boolean);
    const maturity = buildCapabilityMaturity({
      rolesPresent,
      routePatterns,
      flowEvidenceMatches: observedFlowEvidenceMatches,
      scenarioCoverageMatches: scenarioCoverageMatches.map((result) => ({
        scenarioId: result.scenarioId,
      })),
      highSeverityIssueCount,
      simulationOnly,
      status,
    });
    const blockingReasons = unique([
      status === 'phantom'
        ? 'The capability exposes simulation signals without persistence or verified side effects.'
        : '',
      missingRoles.length > 0 ? `Missing structural roles: ${missingRoles.join(', ')}.` : '',
      maturity.missing.length > 0
        ? `Maturity is still missing: ${maturity.missing.slice(0, 4).join(', ')}.`
        : '',
      highSeverityIssueCount > 0
        ? `Codacy still reports ${highSeverityIssueCount} HIGH issue(s) inside this capability.`
        : '',
      protectedByGovernance
        ? 'Part of this capability lives on a governance-protected surface.'
        : '',
    ]).filter(Boolean);

    const existing = capabilitiesById.get(capabilityId);
    if (existing) {
      capabilitiesById.set(
        capabilityId,
        mergeExistingCapability({
          capabilityId,
          existing,
          rolesPresent,
          routePatterns,
          filePaths,
          componentIds,
          evidenceSources,
          ownerLane,
          executionMode,
          protectedByGovernance,
          runtimeCritical,
          userFacing,
          highSeverityIssueCount,
          codacyIssueCount,
          confidence,
          truthMode,
          maturity,
        }),
      );
      return;
    }

    const dodEvidence = buildCapabilityDoDEvidence({
      rolesPresent,
      hasRuntimeEvidence: runtimeObserved || observedFlowEvidenceMatches.length > 0,
      hasScenarioCoverage: scenarioCoverageMatches.length > 0,
      hasObservability: maturity.dimensions.runtimeEvidencePresent,
      hasValidation: rolesPresent.includes('orchestration'),
      highSeverityIssueCount,
      truthMode,
    });
    const dodResult = evaluateDone({
      id: capabilityId,
      kind: 'capability',
      requiredRoles: CAPABILITY_REQUIRED_DOD_ROLES,
      evidence: dodEvidence,
      codacyHighCount: highSeverityIssueCount,
      hasPhantom: status === 'phantom',
      hasLatentCritical: status === 'latent' && runtimeCritical,
      truthModeTarget: 'observed',
    });
    const capabilityDoD: PulseCapabilityDoD = {
      status: toDoDStatus({ done: dodResult.done, pulseStatus: status }),
      missingRoles: dodResult.missingRoles.slice(),
      blockers: dodResult.reasons.slice(),
      truthModeMet: dodResult.truthModeMet,
    };

    capabilitiesById.set(capabilityId, {
      id: capabilityId,
      name: dominantLabel,
      truthMode,
      status,
      statusDetail: {
        structuralStatus:
          status === 'real'
            ? 'complete'
            : status === 'partial'
              ? 'partial'
              : status === 'latent'
                ? 'latent'
                : 'phantom',
        operationalStatus:
          runtimeObserved || observedFlowEvidenceMatches.length > 0
            ? 'observed'
            : status === 'phantom'
              ? 'unobserved'
              : 'unobserved',
        scenarioStatus: scenarioCoverageMatches.length > 0 ? 'covered_passed' : 'not_covered',
        dodStatus: capabilityDoD.status,
        productionStatus:
          capabilityDoD.status === 'done' && blockingReasons.length === 0
            ? 'ready'
            : capabilityDoD.status === 'partial' && blockingReasons.length <= 2
              ? 'candidate'
              : 'not_ready',
      },
      confidence,
      userFacing,
      runtimeCritical,
      protectedByGovernance,
      ownerLane,
      executionMode,
      rolesPresent,
      missingRoles,
      filePaths,
      nodeIds: [...componentIds].sort(),
      routePatterns,
      evidenceSources,
      codacyIssueCount,
      highSeverityIssueCount,
      blockingReasons,
      maturity,
      validationTargets: unique([
        routePatterns[0] ? `Validate structural chain for ${routePatterns[0]}.` : '',
        runtimeCritical ? 'Re-run runtime evidence for this capability.' : '',
        highSeverityIssueCount > 0 ? 'Re-sync Codacy and confirm HIGH issues dropped.' : '',
      ]).filter(Boolean),
      dod: capabilityDoD,
    });
  };

  for (const group of buildSeedGroups(
    input.structuralGraph.nodes,
    apiBackedUiFiles,
    skippedServiceSeedFiles,
    getPrimaryFamily,
  )) {
    processGroup(group, true);
  }

  for (const group of buildFallbackGroups(
    input.structuralGraph.nodes,
    visitedByPrimaryCapability,
    apiBackedUiFiles,
    skippedServiceSeedFiles,
    getPrimaryFamily,
  )) {
    processGroup(group, false);
  }

  const sortedCapabilities = [...capabilitiesById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: sortedCapabilities.length,
      realCapabilities: sortedCapabilities.filter((item) => item.status === 'real').length,
      partialCapabilities: sortedCapabilities.filter((item) => item.status === 'partial').length,
      latentCapabilities: sortedCapabilities.filter((item) => item.status === 'latent').length,
      phantomCapabilities: sortedCapabilities.filter((item) => item.status === 'phantom').length,
      structurallyComplete: sortedCapabilities.filter(
        (item) => item.statusDetail.structuralStatus === 'complete',
      ).length,
      humanRequiredCapabilities: sortedCapabilities.filter(
        (item) => item.executionMode === 'human_required',
      ).length,
      foundationalCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.stage === 'foundational',
      ).length,
      connectedCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.stage === 'connected',
      ).length,
      operationalCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.stage === 'operational',
      ).length,
      productionReadyCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.stage === 'production_ready',
      ).length,
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
