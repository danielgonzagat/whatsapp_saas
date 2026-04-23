import * as path from 'path';
import type {
  PulseCapability,
  PulseCapabilityMaturity,
  PulseCapabilityState,
  PulseCodacyEvidence,
  PulseConvergenceOwnerLane,
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseScopeExecutionMode,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseStructuralRole,
  PulseTruthMode,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  deriveTextFamily,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
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

const MAX_REACHABLE_ROUTE_PATTERNS_PER_NODE = 12;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function chooseTruthMode(hasObservedEvidence: boolean, projected: boolean): PulseTruthMode {
  if (hasObservedEvidence) {
    return 'observed';
  }
  if (projected) {
    return 'aspirational';
  }
  return 'inferred';
}

function pickOwnerLane(values: PulseConvergenceOwnerLane[]): PulseConvergenceOwnerLane {
  if (values.includes('security')) {
    return 'security';
  }
  if (values.includes('reliability')) {
    return 'reliability';
  }
  if (values.includes('operator-admin')) {
    return 'operator-admin';
  }
  if (values.includes('customer')) {
    return 'customer';
  }
  return 'platform';
}

function pickExecutionMode(values: PulseScopeExecutionMode[]): PulseScopeExecutionMode {
  if (values.includes('human_required')) {
    return 'human_required';
  }
  if (values.includes('observation_only')) {
    return 'observation_only';
  }
  return 'ai_safe';
}

function inferStatus(
  rolesPresent: PulseStructuralRole[],
  simulationOnly: boolean,
  hasObservedFailure: boolean,
): PulseCapability['status'] {
  const hasInterface = rolesPresent.includes('interface');
  const hasOrchestration = rolesPresent.includes('orchestration');
  const hasPersistence = rolesPresent.includes('persistence');
  const hasSideEffect = rolesPresent.includes('side_effect');
  const hasSimulation = rolesPresent.includes('simulation');

  if (
    simulationOnly ||
    (hasSimulation && !hasPersistence && !hasSideEffect && !hasObservedFailure)
  ) {
    return 'phantom';
  }
  if (!hasInterface && (hasPersistence || hasSideEffect || hasOrchestration)) {
    return 'latent';
  }
  if (hasObservedFailure) {
    return 'partial';
  }
  if (hasInterface && (hasPersistence || hasSideEffect)) {
    return 'real';
  }
  if (hasInterface || hasOrchestration) {
    return 'partial';
  }
  return 'latent';
}

function buildCapabilityMaturity(input: {
  rolesPresent: PulseStructuralRole[];
  routePatterns: string[];
  flowEvidenceMatches: NonNullable<PulseExecutionEvidence['flows']>['results'];
  scenarioCoverageMatches: Array<{ scenarioId: string }>;
  highSeverityIssueCount: number;
  simulationOnly: boolean;
  status: PulseCapability['status'];
}): PulseCapabilityMaturity {
  const dimensions = {
    interfacePresent: input.rolesPresent.includes('interface'),
    apiSurfacePresent: input.routePatterns.length > 0,
    orchestrationPresent: input.rolesPresent.includes('orchestration'),
    persistencePresent: input.rolesPresent.includes('persistence'),
    sideEffectPresent: input.rolesPresent.includes('side_effect'),
    runtimeEvidencePresent: input.flowEvidenceMatches.some((result) => result.executed),
    validationPresent:
      input.flowEvidenceMatches.length > 0 || input.scenarioCoverageMatches.length > 0,
    scenarioCoveragePresent: input.scenarioCoverageMatches.length > 0,
    codacyHealthy: input.highSeverityIssueCount === 0,
    simulationOnly: input.simulationOnly,
  };

  const score = clamp(
    (dimensions.interfacePresent ? 0.14 : 0) +
      (dimensions.apiSurfacePresent ? 0.08 : 0) +
      (dimensions.orchestrationPresent ? 0.14 : 0) +
      (dimensions.persistencePresent ? 0.18 : 0) +
      (dimensions.sideEffectPresent ? 0.1 : 0) +
      (dimensions.runtimeEvidencePresent ? 0.1 : 0) +
      (dimensions.validationPresent ? 0.08 : 0) +
      (dimensions.scenarioCoveragePresent ? 0.08 : 0) +
      (dimensions.codacyHealthy ? 0.1 : 0) +
      (dimensions.simulationOnly ? -0.15 : 0),
  );

  let stage: PulseCapabilityMaturity['stage'] = 'foundational';
  if (
    input.status === 'real' &&
    (dimensions.runtimeEvidencePresent || dimensions.scenarioCoveragePresent) &&
    dimensions.codacyHealthy
  ) {
    stage = 'production_ready';
  } else if (
    (dimensions.persistencePresent || dimensions.sideEffectPresent) &&
    (dimensions.runtimeEvidencePresent || dimensions.validationPresent)
  ) {
    stage = 'operational';
  } else if (
    dimensions.interfacePresent ||
    dimensions.apiSurfacePresent ||
    dimensions.orchestrationPresent
  ) {
    stage = 'connected';
  }

  if (input.status === 'phantom' && dimensions.simulationOnly) {
    stage = 'foundational';
  }

  const missing = unique([
    !dimensions.interfacePresent ? 'interface' : '',
    !dimensions.apiSurfacePresent ? 'api_surface' : '',
    !dimensions.orchestrationPresent ? 'orchestration' : '',
    !dimensions.persistencePresent ? 'persistence' : '',
    !dimensions.sideEffectPresent ? 'side_effect' : '',
    !dimensions.runtimeEvidencePresent ? 'runtime_evidence' : '',
    !dimensions.validationPresent ? 'validation' : '',
    !dimensions.scenarioCoveragePresent ? 'scenario_coverage' : '',
    !dimensions.codacyHealthy ? 'codacy_hygiene' : '',
    dimensions.simulationOnly ? 'simulation_only' : '',
  ]).filter(Boolean);

  return {
    stage,
    score,
    dimensions,
    missing,
  };
}

function getNodeFamilies(node: PulseStructuralNode): string[] {
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

function getPrimaryFamily(node: PulseStructuralNode): string | null {
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

function getNodeRoutePatterns(node: PulseStructuralNode): string[] {
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

function shouldTraverseNeighbor(
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

function chooseDominantLabel(
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

/** Build capability state from structural graph components. */
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
        ...[...(routePatternsByReachableNode.get(item.id) || new Set<string>())],
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
      const mergedRoles = unique([
        ...existing.rolesPresent,
        ...rolesPresent,
      ]).sort() as PulseStructuralRole[];
      const mergedMissingRoles = (
        ['interface', 'orchestration', 'persistence', 'side_effect'] as PulseStructuralRole[]
      ).filter((role) => !mergedRoles.includes(role));
      const mergedRoutePatterns = unique([...existing.routePatterns, ...routePatterns]).sort();
      const mergedHighSeverityIssueCount = existing.highSeverityIssueCount + highSeverityIssueCount;
      const mergedProtectedByGovernance = existing.protectedByGovernance || protectedByGovernance;
      const mergedRuntimeCritical = existing.runtimeCritical || runtimeCritical;
      const mergedSimulationOnly = mergedRoles.includes('simulation') && mergedRoles.length === 1;
      const mergedHasObservedFailure = mergedHighSeverityIssueCount > 0 && mergedRuntimeCritical;
      const mergedStatus = inferStatus(mergedRoles, mergedSimulationOnly, mergedHasObservedFailure);
      const mergedMaturity = buildCapabilityMaturity({
        rolesPresent: mergedRoles,
        routePatterns: mergedRoutePatterns,
        flowEvidenceMatches:
          existing.maturity.dimensions.runtimeEvidencePresent ||
          maturity.dimensions.runtimeEvidencePresent
            ? [
                {
                  flowId: 'merged-runtime-evidence',
                  status: 'accepted',
                  executed: true,
                  accepted: true,
                  summary: 'Merged capability already carried runtime evidence.',
                  artifactPaths: [],
                },
              ]
            : [],
        scenarioCoverageMatches:
          existing.maturity.dimensions.scenarioCoveragePresent ||
          maturity.dimensions.scenarioCoveragePresent
            ? [{ scenarioId: 'merged-scenario-coverage' }]
            : [],
        highSeverityIssueCount: mergedHighSeverityIssueCount,
        simulationOnly: mergedSimulationOnly,
        status: mergedStatus,
      });
      const mergedBlockingReasons = unique([
        mergedStatus === 'phantom'
          ? 'The capability exposes simulation signals without persistence or verified side effects.'
          : '',
        mergedMissingRoles.length > 0
          ? `Missing structural roles: ${mergedMissingRoles.join(', ')}.`
          : '',
        mergedMaturity.missing.length > 0
          ? `Maturity is still missing: ${mergedMaturity.missing.slice(0, 4).join(', ')}.`
          : '',
        mergedHighSeverityIssueCount > 0
          ? `Codacy still reports ${mergedHighSeverityIssueCount} HIGH issue(s) inside this capability.`
          : '',
        mergedProtectedByGovernance
          ? 'Part of this capability lives on a governance-protected surface.'
          : '',
      ]).filter(Boolean);
      capabilitiesById.set(capabilityId, {
        ...existing,
        truthMode:
          existing.truthMode === 'observed' || truthMode === 'observed'
            ? 'observed'
            : existing.truthMode === 'inferred' || truthMode === 'inferred'
              ? 'inferred'
              : 'aspirational',
        status: mergedStatus,
        confidence: clamp(Math.max(existing.confidence, confidence)),
        userFacing: existing.userFacing || userFacing,
        runtimeCritical: mergedRuntimeCritical,
        protectedByGovernance: mergedProtectedByGovernance,
        ownerLane: pickOwnerLane([existing.ownerLane, ownerLane]),
        executionMode: pickExecutionMode([existing.executionMode, executionMode]),
        rolesPresent: mergedRoles,
        missingRoles: mergedMissingRoles,
        filePaths: unique([...existing.filePaths, ...filePaths]).sort(),
        nodeIds: unique([...existing.nodeIds, ...componentIds]).sort(),
        routePatterns: mergedRoutePatterns,
        evidenceSources: unique([...existing.evidenceSources, ...evidenceSources]).sort(),
        codacyIssueCount: existing.codacyIssueCount + codacyIssueCount,
        highSeverityIssueCount: mergedHighSeverityIssueCount,
        blockingReasons: mergedBlockingReasons,
        maturity: mergedMaturity,
        validationTargets: unique([
          ...existing.validationTargets,
          routePatterns[0] ? `Validate structural chain for ${routePatterns[0]}.` : '',
          mergedRuntimeCritical ? 'Re-run runtime evidence for this capability.' : '',
          highSeverityIssueCount > 0 ? 'Re-sync Codacy and confirm HIGH issues dropped.' : '',
        ]).filter(Boolean),
      });
      return;
    }

    capabilitiesById.set(capabilityId, {
      id: capabilityId,
      name: dominantLabel,
      truthMode,
      status,
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
