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

export const MAX_REACHABLE_ROUTE_PATTERNS_PER_NODE = 12;

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  if (values.includes('human_required')) {
    return 'human_required';
  }
  if (values.includes('observation_only')) {
    return 'observation_only';
  }
  return 'ai_safe';
}

export function inferStatus(
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

export function buildCapabilityMaturity(input: {
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

/** Build capability state from structural graph components. */
