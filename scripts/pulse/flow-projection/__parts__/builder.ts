import type {
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseStructuralRole,
} from '../../types';
import type { PulseCapabilityDoD } from '../../types.capabilities';
import { deriveStructuralFamilies, familiesOverlap } from '../../structural-family';
import { buildObservationFootprint, footprintMatchesFamilies } from '../../execution-observation';
import { evaluateDone } from '../../definition-of-done';
import {
  unique,
  clamp,
  collectScenarioResults,
  buildStaticValidationSources,
  findStaticValidationMatches,
  chooseTruthMode,
  chooseFlowName,
  findFlowStatus,
  flowToDoDStatus,
  buildFlowDoDEvidence,
  FLOW_REQUIRED_DOD_ROLES,
} from './helpers';
import type { BuildFlowProjectionInput } from './helpers';

/** Build flow projection from discovered flow candidates and capability graph. */
export function buildFlowProjection(input: BuildFlowProjectionInput): PulseFlowProjection {
  const executionResults = input.executionEvidence?.flows?.results || [];
  const scenarioResults = collectScenarioResults(input.executionEvidence);
  const observationFootprint = buildObservationFootprint(
    input.resolvedManifest,
    input.executionEvidence,
  );
  const staticValidationSources = buildStaticValidationSources(input.scopeState);
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
    const staticValidationMatches = findStaticValidationMatches({
      candidate,
      routePatterns,
      flowFamilies,
      sources: staticValidationSources,
    });
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
        runtimeObserved ||
        staticValidationMatches.length > 0,
      status === 'latent',
    );
    const confidence = clamp(
      rolesPresent.length / 4 +
        (executedResult?.executed ? 0.25 : 0) +
        (scenarioCoverageMatches.length > 0 ? 0.15 : 0) +
        (staticValidationMatches.length > 0 ? 0.12 : 0) +
        (runtimeObserved ? 0.05 : 0) +
        (executedResult?.status === 'failed' ? -0.15 : 0) +
        (candidate.connected ? 0.1 : 0),
    );

    const flowDoDEvidence = buildFlowDoDEvidence({
      rolesPresent,
      hasRuntimeEvidence: runtimeObserved || Boolean(executedResult && executedResult.executed),
      hasScenarioCoverage: scenarioCoverageMatches.length > 0,
      hasStaticValidation: staticValidationMatches.length > 0,
      truthMode,
    });
    const flowDoDResult = evaluateDone({
      id: candidate.id,
      kind: 'flow',
      requiredRoles: FLOW_REQUIRED_DOD_ROLES,
      evidence: flowDoDEvidence,
      codacyHighCount: 0,
      hasPhantom: status === 'phantom',
      hasLatentCritical: status === 'latent',
      truthModeTarget: 'observed',
    });
    const flowDoD: PulseCapabilityDoD = {
      status: flowToDoDStatus({
        done: flowDoDResult.done,
        pulseStatus: status === 'real' && !flowDoDResult.done ? 'partial' : status,
      }),
      missingRoles: flowDoDResult.missingRoles.slice(),
      blockers: flowDoDResult.reasons.slice(),
      truthModeMet: flowDoDResult.truthModeMet,
      governedBlockers: flowDoDResult.governedBlockers.slice(),
    };
    const visibleStatus = status === 'real' && !flowDoDResult.done ? 'partial' : status;
    const governedValidationTargets = flowDoDResult.governedBlockers.map(
      (blocker) => `Governed ai_safe validation: ${blocker.expectedValidation}`,
    );
    const governedBlockingReasons = flowDoDResult.governedBlockers.map(
      (blocker) =>
        `Governed ai_safe blocker for ${blocker.role}: ${blocker.reason} Expected validation: ${blocker.expectedValidation}`,
    );

    return {
      id: candidate.id,
      name: chooseFlowName(candidate),
      truthMode,
      status: visibleStatus,
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
        (status === 'phantom' ? 1 : 0) +
        (visibleStatus !== status ? 1 : 0),
      evidenceSources: unique([
        candidate.declaredFlow ? 'declared-flow' : '',
        candidate.connected ? 'connected-chain' : '',
        candidate.persistent ? 'persistent-chain' : '',
        executedResult ? 'execution-flow-evidence' : '',
        scenarioCoverageMatches.length > 0 ? 'scenario-coverage' : '',
        staticValidationMatches.length > 0 ? 'static-test-coverage' : '',
        runtimeObserved ? 'runtime-observation' : '',
      ]).filter(Boolean),
      blockingReasons: unique([
        status === 'phantom'
          ? 'The flow is currently backed by simulation or facade behavior instead of a durable effect.'
          : '',
        missingLinks.length > 0 ? `Missing structural links: ${missingLinks.join(', ')}.` : '',
        executedResult?.status === 'failed' ? executedResult.summary : '',
        ...governedBlockingReasons,
      ]).filter(Boolean),
      validationTargets: unique([
        candidate.backendRoute ? `Validate backend chain for ${candidate.backendRoute}.` : '',
        executedResult ? 'Re-run declared flow evidence for this flow.' : '',
        staticValidationMatches.length > 0
          ? `Static test coverage detected in ${staticValidationMatches
              .slice(0, 3)
              .map((source) => source.filePath)
              .join(', ')}.`
          : '',
        ...governedValidationTargets,
      ]).filter(Boolean),
      dod: flowDoD,
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
