import type {
  PulseCapabilityState,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseFlowProjection,
} from '../../types';
import type { BuildPulseConvergencePlanInput } from './types';
import {
  takeEvidenceBatch,
  isSameState,
  isDifferentState,
  uniqueStrings,
  humanize,
  compactText,
  slugify,
  hasObservedItems,
  evidenceBatchSize,
} from './helpers';
import {
  confidenceFromNumeric,
  buildCapabilityVisionDelta,
  buildFlowVisionDelta,
  selectDominantOwnerLane,
} from './priorities';
import { failedGateNamesForCapability, failedGateNamesForFlow } from './scenario-evidence';
import { OBSERVED_ARTIFACTS } from './state';

export function getCapabilityPriority(
  status: PulseCapabilityState['capabilities'][number]['status'],
): PulseConvergenceUnitPriority {
  if (isSameState(status, 'phantom')) {
    return 'P0';
  }
  if (isSameState(status, 'partial')) {
    return 'P1';
  }
  if (isSameState(status, 'latent')) {
    return 'P2';
  }
  return 'P3';
}

export function getFlowPriority(
  status: PulseFlowProjection['flows'][number]['status'],
): PulseConvergenceUnitPriority {
  if (isSameState(status, 'phantom')) {
    return 'P0';
  }
  if (isSameState(status, 'partial')) {
    return 'P1';
  }
  if (isSameState(status, 'latent')) {
    return 'P2';
  }
  return 'P3';
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
      status: capability.executionMode === 'observation_only' ? 'watch' : 'open',
      source: 'pulse' as const,
      executionMode: capability.executionMode,
      ownerLane: capability.ownerLane,
      riskLevel:
        capability.runtimeCritical && isSameState(capability.status, 'phantom')
          ? 'critical'
          : Boolean(capability.highSeverityIssueCount)
            ? 'high'
            : 'medium',
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
      breakTypes: [],
      artifactPaths: [OBSERVED_ARTIFACTS.capabilityState, 'PULSE_PRODUCT_VISION.json'],
      relatedFiles: takeEvidenceBatch(capability.filePaths, capability.validationTargets),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.capabilityState,
        'PULSE_PRODUCT_VISION.json',
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: hasObservedItems(certificationMatches)
        ? `Pass ${certificationMatches.map(humanize).join('/')}`
        : capability.runtimeCritical
          ? 'Reduce phantom capability count'
          : undefined,
      exitCriteria: capability.validationTargets,
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
      status: flow.truthMode === 'aspirational' ? 'watch' : 'open',
      source: 'pulse' as const,
      executionMode: flow.truthMode === 'aspirational' ? 'observation_only' : 'ai_safe',
      ownerLane: selectDominantOwnerLane(
        relatedCapabilities.map((capability) => capability.ownerLane),
      ),
      riskLevel: isSameState(flow.status, 'phantom')
        ? 'critical'
        : isSameState(flow.status, 'partial')
          ? 'high'
          : 'medium',
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
      breakTypes: flow.missingLinks,
      artifactPaths: [OBSERVED_ARTIFACTS.flowProjection, 'PULSE_PRODUCT_VISION.json'],
      relatedFiles: relatedCapabilities
        .flatMap((capability) => capability.filePaths)
        .slice(0, evidenceBatchSize(relatedCapabilities, flow.validationTargets)),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.flowProjection,
        'PULSE_PRODUCT_VISION.json',
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: hasObservedItems(certificationMatches)
        ? `Pass ${certificationMatches.map(humanize).join('/')}`
        : 'Reduce phantom flow count',
      exitCriteria: flow.validationTargets,
    };
  });
}
