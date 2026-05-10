import type { PulseCapabilityState } from '../types.capabilities/03-capability';
import type { PulseFlowProjection } from '../types.capabilities/04-flow-projection';
import type { PulseConvergenceUnit, PulseConvergenceUnitPriority } from '../types.convergence';
import type { BuildPulseConvergencePlanInput } from './kernel';
import {
  CAPABILITY_STATUSES,
  FLOW_STATUSES,
  OBSERVED_ARTIFACTS,
} from './kernel';
import {
  derivePriorityFromObservedContext,
} from '../dynamic-reality-kernel/token-evidence';
import {
  observedPulseSource,
  observedOpenStatus,
  observedWatchStatus,
  observedP0Priority,
  observedP1Priority,
  observedCriticalRisk,
  observedHighConfidence,
  observedMediumRisk,
  observedPlatformLane,
} from './builder-labels';
import {
  buildCapabilityVisionDelta,
  buildFlowVisionDelta,
  confidenceFromNumeric,
  compactText,
  evidenceBatchSize,
  failedGateNamesForCapability,
  failedGateNamesForFlow,
  hasObservedItems,
  humanize,
  isDifferentState,
  isSameState,
  relatedFailedGateNames,
  selectDominantOwnerLane,
  slugify,
  takeEvidenceBatch,
} from './utils';

export function getCapabilityPriority(
  status: PulseCapabilityState['capabilities'][number]['status'],
): PulseConvergenceUnitPriority {
  let phantomStatus = [...CAPABILITY_STATUSES].find((s) => s.includes('phantom'))!;
  return derivePriorityFromObservedContext(status, isSameState(status, phantomStatus), false);
}

export function getFlowPriority(
  status: PulseFlowProjection['flows'][number]['status'],
): PulseConvergenceUnitPriority {
  let phantomStatus = [...FLOW_STATUSES].find((s) => s.includes('phantom'))!;
  return derivePriorityFromObservedContext(status, isSameState(status, phantomStatus), false);
}

export function buildCapabilityUnits(
  input: BuildPulseConvergencePlanInput,
): PulseConvergenceUnit[] {
  return takeEvidenceBatch(
    input.capabilityState.capabilities.filter((capability) =>
      isDifferentState(capability.status, 'real'),
    ),
    input.certification.evidenceSummary.flows.results,
  ).map((capability) => {
    let certificationMatches = failedGateNamesForCapability(input.certification, capability.id);

    return {
      id: `capability-${slugify(capability.id)}`,
      order: 0,
      priority: getCapabilityPriority(capability.status),
      kind: 'capability' as const,
      status:
        capability.executionMode === 'observation_only' ? observedWatchStatus : observedOpenStatus,
      source: observedPulseSource,
      executionMode: capability.executionMode,
      ownerLane: capability.ownerLane,
      riskLevel:
        capability.runtimeCritical && isSameState(capability.status, 'phantom')
          ? observedCriticalRisk
          : Boolean(capability.highSeverityIssueCount)
            ? observedHighConfidence
            : observedMediumRisk,
      evidenceMode: capability.truthMode,
      confidence: confidenceFromNumeric(capability.confidence),
      productImpact: isSameState(capability.status, 'phantom')
        ? 'transformational'
        : isSameState(capability.status, 'partial')
          ? 'material'
          : 'enabling',
      title: `Materialize capability ${capability.name}`,
      summary: compactText(
        [
          `Capability ${capability.name} is ${capability.status}.`,
          `Maturity is ${capability.maturity.stage} (${Math.round(capability.maturity.score * 100)}%).`,
          capability.blockingReasons.join(' '),
        ]
          .filter(Boolean)
          .join(' '),
        320,
      ),
      visionDelta: buildCapabilityVisionDelta(capability),
      targetState: `Capability ${capability.name} must become materially real or at least structurally partial with no illusion-only path.`,
      failureClass:
        capability.executionMode === 'observation_only' ? 'missing_evidence' : 'product_failure',
      actorKinds: [],
      gateNames: certificationMatches,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: capability.routePatterns,
      flowIds: [],
      affectedCapabilityIds: [capability.id],
      affectedFlowIds: [],
      asyncExpectations: [],
      findingEvents: [],
      artifactPaths: [OBSERVED_ARTIFACTS.capabilityState, OBSERVED_ARTIFACTS.productVision],
      relatedFiles: takeEvidenceBatch(capability.filePaths, capability.validationTargets),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.capabilityState,
        OBSERVED_ARTIFACTS.productVision,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: hasObservedItems(certificationMatches)
        ? `Pass ${certificationMatches.map(humanize).join('/')}`
        : capability.runtimeCritical
          ? 'Reduce phantom capability count'
          : undefined,
      exitCriteria: capability.validationTargets,
      breakTypes: [],
    };
  });
}

export function buildFlowUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(
    input.flowProjection.flows.filter((flow) => isDifferentState(flow.status, 'real')),
    input.capabilityState.capabilities,
  ).map((flow) => {
    let relatedCapabilities = input.capabilityState.capabilities.filter((capability) =>
      flow.capabilityIds.includes(capability.id),
    );
    let certificationMatches = failedGateNamesForFlow(input.certification, flow.id);

    return {
      id: `flow-${slugify(flow.id)}`,
      order: 0,
      priority: getFlowPriority(flow.status),
      kind: 'flow' as const,
      status: flow.truthMode === 'aspirational' ? observedWatchStatus : observedOpenStatus,
      source: observedPulseSource,
      executionMode: flow.truthMode === 'aspirational' ? 'observation_only' : 'ai_safe',
      ownerLane: selectDominantOwnerLane(
        relatedCapabilities.map((capability) => capability.ownerLane),
      ),
      riskLevel: isSameState(flow.status, 'phantom')
        ? observedCriticalRisk
        : isSameState(flow.status, 'partial')
          ? observedHighConfidence
          : observedMediumRisk,
      evidenceMode: flow.truthMode,
      confidence: confidenceFromNumeric(flow.confidence),
      productImpact: isSameState(flow.status, 'phantom')
        ? 'transformational'
        : isSameState(flow.status, 'partial')
          ? 'material'
          : 'enabling',
      title: `Close flow ${humanize(flow.id)}`,
      summary: compactText(
        [`Flow ${flow.id} is ${flow.status}.`, flow.blockingReasons.join(' ')]
          .filter(Boolean)
          .join(' '),
        320,
      ),
      visionDelta: buildFlowVisionDelta(flow),
      targetState: `Flow ${flow.id} must reach a real interface->effect chain.`,
      failureClass: flow.truthMode === 'aspirational' ? 'missing_evidence' : 'product_failure',
      actorKinds: [],
      gateNames: certificationMatches,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: flow.routePatterns,
      flowIds: [flow.id],
      affectedCapabilityIds: flow.capabilityIds,
      affectedFlowIds: [flow.id],
      asyncExpectations: [],
      findingEvents: flow.missingLinks,
      artifactPaths: [OBSERVED_ARTIFACTS.flowProjection, OBSERVED_ARTIFACTS.productVision],
      relatedFiles: relatedCapabilities
        .flatMap((capability) => capability.filePaths)
        .slice(0, evidenceBatchSize(relatedCapabilities, flow.validationTargets)),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.flowProjection,
        OBSERVED_ARTIFACTS.productVision,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: hasObservedItems(certificationMatches)
        ? `Pass ${certificationMatches.map(humanize).join('/')}`
        : 'Reduce phantom flow count',
      exitCriteria: flow.validationTargets,
      breakTypes: [],
    };
  });
}

export function buildExecutionMatrixUnits(
  input: BuildPulseConvergencePlanInput,
): PulseConvergenceUnit[] {
  let matrix = input.executionMatrix;
  if (!matrix) {
    return [];
  }
  let actionable = matrix.paths.filter(
    (path) =>
      isSameState(path.status, 'observed_fail') ||
      (isSameState(path.risk, 'high') && !['observed_pass', 'observed_fail'].includes(path.status)),
  );

  return takeEvidenceBatch(actionable, input.certification.evidenceSummary.flows.results).map(
    (path) => {
      let certificationMatches = relatedFailedGateNames(input.certification, [
        path.status,
        path.pathId,
        path.breakpoint?.reason ?? '',
        path.validationCommand,
        path.flowId ?? '',
        path.capabilityId ?? '',
      ]);

      return {
        id: `matrix-${slugify(path.pathId)}`,
        order: 0,
        priority: isSameState(path.status, 'observed_fail')
          ? observedP0Priority
          : observedP1Priority,
        kind: path.flowId ? ('flow' as const) : ('capability' as const),
        status:
          path.executionMode === 'observation_only' ? observedWatchStatus : observedOpenStatus,
        source: observedPulseSource,
        executionMode: path.executionMode,
        ownerLane: observedPlatformLane,
        riskLevel: isSameState(path.status, 'observed_fail') ? observedCriticalRisk : path.risk,
        evidenceMode: path.truthMode,
        confidence: confidenceFromNumeric(path.confidence),
        productImpact: isSameState(path.status, 'observed_fail') ? 'transformational' : 'material',
        title: isSameState(path.status, 'observed_fail')
          ? `Repair execution path ${path.pathId}`
          : `Observe execution path ${path.pathId}`,
        summary: compactText(
          [
            `Execution matrix status is ${path.status}.`,
            path.breakpoint ? `Breakpoint: ${path.breakpoint.reason}.` : null,
            `Validation: ${path.validationCommand}.`,
          ]
            .filter(Boolean)
            .join(' '),
          320,
        ),
        visionDelta: isSameState(path.status, 'observed_fail')
          ? 'Turns an observed broken path into a precise repair target.'
          : 'Turns a critical inferred path into observed pass/fail truth.',
        targetState:
          'Path is classified as observed_pass or observed_fail with a precise breakpoint.',
        failureClass: isSameState(path.status, 'observed_fail')
          ? 'product_failure'
          : 'missing_evidence',
        actorKinds: [],
        gateNames: certificationMatches,
        scenarioIds: [],
        moduleKeys: [],
        routePatterns: path.routePatterns,
        flowIds: path.flowId ? [path.flowId] : [],
        affectedCapabilityIds: path.capabilityId ? [path.capabilityId] : [],
        affectedFlowIds: path.flowId ? [path.flowId] : [],
        asyncExpectations: [],
        findingEvents: [],
        artifactPaths: [OBSERVED_ARTIFACTS.executionMatrix],
        relatedFiles: takeEvidenceBatch(path.filePaths, path.routePatterns),
        validationArtifacts: [
          OBSERVED_ARTIFACTS.executionMatrix,
          OBSERVED_ARTIFACTS.cliDirective,
          OBSERVED_ARTIFACTS.certificate,
        ],
        expectedGateShift: hasObservedItems(certificationMatches)
          ? `Pass ${certificationMatches.map(humanize).join('/')}`
          : 'Execution matrix path gains observed proof',
        exitCriteria: [
          `Path ${path.pathId} is no longer ${path.status}.`,
          'PULSE_EXECUTION_MATRIX.json is regenerated with a concrete observed classification.',
        ],
        breakTypes: [],
      };
    },
  );
}
