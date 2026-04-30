import * as path from 'path';
import type {
  PulseCapability,
  PulseCapabilityMaturity,
  PulseConvergenceOwnerLane,
  PulseExecutionEvidence,
  PulseScopeExecutionMode,
  PulseStructuralNode,
  PulseStructuralRole,
  PulseTruthMode,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  deriveTextFamily,
  familiesOverlap,
  titleCaseStructural,
} from './structural-family';

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function presentRatio(values: boolean[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.filter(Boolean).length / values.length;
}

function tokenIs(left: string | undefined, right: string): boolean {
  return left === right;
}

function rolePresent(roles: PulseStructuralRole[], role: PulseStructuralRole): boolean {
  return roles.includes(role);
}

function productionRoleNames(): PulseStructuralRole[] {
  return ['interface', 'orchestration', 'persistence', 'side_effect'];
}

function deriveCapabilityMaturityStage(input: {
  status: PulseCapability['status'];
  dimensions: PulseCapabilityMaturity['dimensions'];
}): PulseCapabilityMaturity['stage'] {
  const readinessSignals = {
    production_ready:
      tokenIs(input.status, 'real') &&
      (input.dimensions.runtimeEvidencePresent || input.dimensions.scenarioCoveragePresent) &&
      input.dimensions.codacyHealthy,
    operational:
      (input.dimensions.persistencePresent || input.dimensions.sideEffectPresent) &&
      (input.dimensions.runtimeEvidencePresent || input.dimensions.validationPresent),
    connected:
      input.dimensions.interfacePresent ||
      input.dimensions.apiSurfacePresent ||
      input.dimensions.orchestrationPresent,
    foundational: true,
  } satisfies Record<PulseCapabilityMaturity['stage'], boolean>;
  const blockedSignals = {
    production_ready: tokenIs(input.status, 'phantom') && input.dimensions.simulationOnly,
    operational: tokenIs(input.status, 'phantom') && input.dimensions.simulationOnly,
    connected: tokenIs(input.status, 'phantom') && input.dimensions.simulationOnly,
    foundational: false,
  } satisfies Record<PulseCapabilityMaturity['stage'], boolean>;
  const observedStage = Object.entries(readinessSignals).find(
    ([stage, present]) => present && !blockedSignals[stage as PulseCapabilityMaturity['stage']],
  );
  const discoveredStages = Object.keys(readinessSignals);
  const fallbackStageIndex = discoveredStages.length - Number(Boolean(discoveredStages.length));
  return (observedStage?.[0] ??
    discoveredStages[fallbackStageIndex]) as PulseCapabilityMaturity['stage'];
}

export function graphTraversalDepthLimit(input: {
  nodeCount: number;
  edgeCount: number;
  seedPatternCount: number;
}): number {
  return Math.max(input.nodeCount, input.edgeCount, input.seedPatternCount);
}

export function reachableRoutePatternLimit(nodes: PulseStructuralNode[]): number {
  return Math.max(...nodes.map((node) => getNodeRoutePatterns(node).length), nodes.length);
}

export function chooseTruthMode(hasObservedEvidence: boolean, projected: boolean): PulseTruthMode {
  if (hasObservedEvidence) {
    return 'observed';
  }
  if (projected) {
    return 'aspirational';
  }
  return 'inferred';
}

export function pickOwnerLane(values: PulseConvergenceOwnerLane[]): PulseConvergenceOwnerLane {
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

export function pickExecutionMode(values: PulseScopeExecutionMode[]): PulseScopeExecutionMode {
  if (values.includes('observation_only') || values.includes('human_required')) {
    return 'observation_only';
  }
  return 'ai_safe';
}

export function inferStatus(
  rolesPresent: PulseStructuralRole[],
  simulationOnly: boolean,
  hasObservedFailure: boolean,
): PulseCapability['status'] {
  const hasInterface = rolePresent(rolesPresent, 'interface');
  const hasOrchestration = rolePresent(rolesPresent, 'orchestration');
  const hasPersistence = rolePresent(rolesPresent, 'persistence');
  const hasSideEffect = rolePresent(rolesPresent, 'side_effect');
  const hasSimulation = rolePresent(rolesPresent, 'simulation');

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

export function buildCapabilityMaturity(input: {
  rolesPresent: PulseStructuralRole[];
  routePatterns: string[];
  flowEvidenceMatches: NonNullable<PulseExecutionEvidence['flows']>['results'];
  scenarioCoverageMatches: Array<{ scenarioId: string }>;
  runtimeObserved?: boolean;
  highSeverityIssueCount: number;
  simulationOnly: boolean;
  status: PulseCapability['status'];
}): PulseCapabilityMaturity {
  const dimensions = {
    interfacePresent: rolePresent(input.rolesPresent, 'interface'),
    apiSurfacePresent: input.routePatterns.length > 0,
    orchestrationPresent: rolePresent(input.rolesPresent, 'orchestration'),
    persistencePresent: rolePresent(input.rolesPresent, 'persistence'),
    sideEffectPresent: rolePresent(input.rolesPresent, 'side_effect'),
    runtimeEvidencePresent:
      Boolean(input.runtimeObserved) || input.flowEvidenceMatches.some((result) => result.executed),
    validationPresent:
      input.flowEvidenceMatches.length > 0 || input.scenarioCoverageMatches.length > 0,
    scenarioCoveragePresent: input.scenarioCoverageMatches.length > 0,
    codacyHealthy: input.highSeverityIssueCount === 0,
    simulationOnly: input.simulationOnly,
  };

  const score = clamp(
    presentRatio([
      dimensions.interfacePresent,
      dimensions.apiSurfacePresent,
      dimensions.orchestrationPresent,
      dimensions.persistencePresent,
      dimensions.sideEffectPresent,
      dimensions.runtimeEvidencePresent,
      dimensions.validationPresent,
      dimensions.scenarioCoveragePresent,
      dimensions.codacyHealthy,
      !dimensions.simulationOnly,
    ]),
  );

  const stage = deriveCapabilityMaturityStage({ status: input.status, dimensions });

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

export function capabilityCompletenessScore(rolesPresent: PulseStructuralRole[]): number {
  const productionRoles = productionRoleNames();
  return presentRatio(productionRoles.map((role) => rolePresent(rolesPresent, role)));
}

export function confidenceFromCapabilityEvidence(input: {
  completenessScore: number;
  executedEvidenceCount: number;
  runtimeObserved: boolean;
  highSeverityIssueCount: number;
  componentNodeCount: number;
}): number {
  const positiveSignals = [
    input.completenessScore,
    input.executedEvidenceCount > 0,
    input.runtimeObserved,
    input.componentNodeCount >= input.executedEvidenceCount,
  ];
  const negativeSignals = [input.highSeverityIssueCount > 0];
  return clamp(
    presentRatio(positiveSignals.map((signal) => Boolean(signal))) -
      presentRatio(negativeSignals.map((signal) => Boolean(signal))) / positiveSignals.length,
  );
}

export function missingProductionRoles(rolesPresent: PulseStructuralRole[]): PulseStructuralRole[] {
  return productionRoleNames().filter((role) => !rolePresent(rolesPresent, role));
}

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
  fallbackSignature: string,
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

  return titleCaseStructural(fallbackSignature || componentNodes.map((node) => node.id).join(' '));
}

/** Build capability state from structural graph components. */
