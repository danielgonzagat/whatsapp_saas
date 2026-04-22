import type {
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseExecutionEvidence,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseResolvedManifest,
  PulseStructuralGraph,
  PulseStructuralRole,
  PulseTruthMode,
} from './types';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  isMeaningfulUiLabel,
  titleCaseStructural,
} from './structural-family';
import { buildObservationFootprint, footprintMatchesFamilies } from './execution-observation';

interface BuildFlowProjectionInput {
  structuralGraph: PulseStructuralGraph;
  capabilityState: PulseCapabilityState;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function compactWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function chooseTruthMode(observed: boolean, projected: boolean): PulseTruthMode {
  if (observed) {
    return 'observed';
  }
  if (projected) {
    return 'projected';
  }
  return 'inferred';
}

function chooseFlowName(
  candidate: BuildFlowProjectionInput['codebaseTruth']['discoveredFlows'][number],
): string {
  if (isMeaningfulUiLabel(candidate.elementLabel)) {
    return candidate.elementLabel;
  }

  const family =
    deriveRouteFamily(candidate.backendRoute || '') ||
    deriveRouteFamily(candidate.endpoint) ||
    deriveRouteFamily(candidate.pageRoute) ||
    deriveStructuralFamilies([
      candidate.declaredFlow || '',
      candidate.moduleName,
      candidate.moduleKey,
    ])[0] ||
    candidate.id;

  return titleCaseStructural(family);
}

function findFlowStatus(
  rolesPresent: PulseStructuralRole[],
  facadeEvidence: boolean,
  executedFailure: boolean,
): PulseFlowProjectionItem['status'] {
  const hasInterface = rolesPresent.includes('interface');
  const hasOrchestration = rolesPresent.includes('orchestration');
  const hasPersistence = rolesPresent.includes('persistence');
  const hasSideEffect = rolesPresent.includes('side_effect');
  const hasSimulation = rolesPresent.includes('simulation');

  if ((hasSimulation && !hasPersistence && !hasSideEffect) || facadeEvidence) {
    return 'phantom';
  }
  if (executedFailure) {
    return 'partial';
  }
  if (hasInterface && hasOrchestration && (hasPersistence || hasSideEffect)) {
    return 'real';
  }
  if (hasInterface || hasOrchestration) {
    return 'partial';
  }
  return 'latent';
}

/** Build flow projection from discovered flow candidates and capability graph. */
export function buildFlowProjection(input: BuildFlowProjectionInput): PulseFlowProjection {
  const executionResults = input.executionEvidence?.flows?.results || [];
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
  const capabilities = input.capabilityState.capabilities;
  const flows = input.codebaseTruth.discoveredFlows.map((candidate) => {
    const routePatterns = unique(
      [candidate.pageRoute, candidate.endpoint, candidate.backendRoute || ''].filter(Boolean),
    );
    const flowFamilies = deriveStructuralFamilies([
      ...routePatterns,
      candidate.declaredFlow || '',
      candidate.moduleKey,
      candidate.moduleName,
    ]);
    const relatedCapabilities = capabilities.filter((capability) =>
      familiesOverlap(
        flowFamilies,
        deriveStructuralFamilies([capability.id, capability.name, ...capability.routePatterns]),
      ),
    );
    const relatedNodes = unique(relatedCapabilities.flatMap((capability) => capability.nodeIds))
      .map((nodeId) => input.structuralGraph.nodes.find((node) => node.id === nodeId))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const rolesPresent = unique(
      relatedNodes.map((item) => item.role),
    ).sort() as PulseStructuralRole[];
    const capabilityIds = relatedCapabilities.map((capability) => capability.id).sort();
    const executedResult =
      executionResults.find((result) => result.flowId === candidate.declaredFlow) ||
      executionResults.find((result) => result.flowId === candidate.id) ||
      null;
    const scenarioCoverageMatches = scenarioResults.filter(
      (result) =>
        result.executed &&
        familiesOverlap(
          flowFamilies,
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
          flowFamilies,
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const facadeEvidence = relatedNodes.some((item) => item.role === 'simulation');
    const runtimeObserved = footprintMatchesFamilies(flowFamilies, observationFootprint);
    const status = findFlowStatus(
      rolesPresent,
      facadeEvidence,
      Boolean(executedResult && executedResult.status === 'failed') ||
        scenarioFailureMatches.length > 0,
    );
    const missingLinks = unique([
      !rolesPresent.includes('interface') ? 'missing_interface' : '',
      !rolesPresent.includes('orchestration') ? 'missing_orchestration' : '',
      !rolesPresent.includes('persistence') && !rolesPresent.includes('side_effect')
        ? 'missing_real_effect'
        : '',
    ]).filter(Boolean);
    const truthMode = chooseTruthMode(
      Boolean(executedResult && (executedResult.executed || executedResult.status === 'failed')) ||
        scenarioCoverageMatches.length > 0 ||
        runtimeObserved,
      status === 'latent',
    );
    const confidence = clamp(
      rolesPresent.length / 4 +
        (executedResult?.executed ? 0.25 : 0) +
        (scenarioCoverageMatches.length > 0 ? 0.15 : 0) +
        (runtimeObserved ? 0.05 : 0) +
        (executedResult?.status === 'failed' ? -0.15 : 0) +
        (candidate.connected ? 0.1 : 0),
    );

    return {
      id: candidate.id,
      name: chooseFlowName(candidate),
      truthMode,
      status,
      confidence,
      startNodeIds: relatedNodes.filter((item) => item.role === 'interface').map((item) => item.id),
      endNodeIds: relatedNodes
        .filter((item) => item.role === 'persistence' || item.role === 'side_effect')
        .map((item) => item.id),
      routePatterns,
      capabilityIds,
      rolesPresent,
      missingLinks,
      distanceToReal:
        missingLinks.length +
        (executedResult?.status === 'failed' ? 1 : 0) +
        (status === 'phantom' ? 1 : 0),
      evidenceSources: unique([
        candidate.declaredFlow ? 'declared-flow' : '',
        candidate.connected ? 'connected-chain' : '',
        candidate.persistent ? 'persistent-chain' : '',
        executedResult ? 'execution-flow-evidence' : '',
        scenarioCoverageMatches.length > 0 ? 'scenario-coverage' : '',
        runtimeObserved ? 'runtime-observation' : '',
      ]).filter(Boolean),
      blockingReasons: unique([
        status === 'phantom'
          ? 'The flow is currently backed by simulation or facade behavior instead of a durable effect.'
          : '',
        missingLinks.length > 0 ? `Missing structural links: ${missingLinks.join(', ')}.` : '',
        executedResult?.status === 'failed' ? executedResult.summary : '',
      ]).filter(Boolean),
      validationTargets: unique([
        candidate.backendRoute ? `Validate backend chain for ${candidate.backendRoute}.` : '',
        executedResult ? 'Re-run declared flow evidence for this flow.' : '',
      ]).filter(Boolean),
    } satisfies PulseFlowProjectionItem;
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFlows: flows.length,
      realFlows: flows.filter((flow) => flow.status === 'real').length,
      partialFlows: flows.filter((flow) => flow.status === 'partial').length,
      latentFlows: flows.filter((flow) => flow.status === 'latent').length,
      phantomFlows: flows.filter((flow) => flow.status === 'phantom').length,
    },
    flows: flows.sort((left, right) => left.id.localeCompare(right.id)),
  };
}
