import type {
  PulseCapabilityState,
  PulseCertification,
  PulseConvergenceOwnerLane,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseEvidenceRecord,
  PulseGateFailureClass,
  PulseGateName,
} from '../../types';
import type { BuildPulseConvergencePlanInput } from './types';
import {
  isSameState,
  isDifferentState,
  uniqueStrings,
  takeEvidenceBatch,
  humanize,
  compactText,
  slugify,
  determineUnitStatus,
  normalizeFailureClass,
  normalizeOptionalState,
  evidenceBatchSize,
  hasObservedItems,
} from './helpers';
import {
  selectDominantOwnerLane,
  determineGateProductImpact,
  buildGateVisionDelta,
} from './priorities';
import { OBSERVED_ARTIFACTS } from './state';

export function summarizeGateFocus(
  gateName: PulseGateName,
  certification: PulseCertification,
): string[] {
  if (isSameState(gateName, 'flowPass')) {
    return uniqueStrings(
      certification.evidenceSummary.flows.results
        .filter((result) => isDifferentState(result.status, 'passed'))
        .map((result) => `${result.flowId}:${result.status}`),
    );
  }

  if (isSameState(gateName, 'invariantPass')) {
    return uniqueStrings(
      certification.evidenceSummary.invariants.results
        .filter((result) => isDifferentState(result.status, 'passed'))
        .map((result) => `${result.invariantId}:${result.status}`),
    );
  }

  if (isSameState(gateName, 'runtimePass')) {
    return uniqueStrings(
      certification.evidenceSummary.runtime.probes
        .filter((result) => isDifferentState(result.status, 'passed'))
        .map((result) => `${result.probeId}:${result.status}`),
    );
  }

  if (isSameState(gateName, 'syntheticCoveragePass')) {
    return takeEvidenceBatch(certification.evidenceSummary.syntheticCoverage.uncoveredPages);
  }

  return [];
}

export function determineGateLane(
  gateName: PulseGateName,
  affectedCapabilityIds: string[],
  capabilityState: PulseCapabilityState,
): PulseConvergenceOwnerLane {
  let mappedLane = selectDominantOwnerLane(
    capabilityState.capabilities
      .filter((capability) => affectedCapabilityIds.includes(capability.id))
      .map((capability) => capability.ownerLane),
  );
  if (isDifferentState(mappedLane, 'platform')) {
    return mappedLane;
  }
  if (isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')) {
    return 'reliability';
  }
  if (isSameState(gateName, 'changeRiskPass') || isSameState(gateName, 'productionDecisionPass')) {
    return 'reliability';
  }
  if (
    isSameState(gateName, 'invariantPass') ||
    isSameState(gateName, 'recoveryPass') ||
    isSameState(gateName, 'observabilityPass') ||
    isSameState(gateName, 'performancePass')
  ) {
    return 'reliability';
  }
  if (isSameState(gateName, 'isolationPass')) {
    return 'security';
  }
  return 'platform';
}

export function hasActorGateEvidence(
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>,
  gateName: PulseGateName,
): boolean {
  return (gateEvidence[gateName] || []).some((record) => isSameState(record.kind, 'actor'));
}

export function collectCoveredGateNames(units: PulseConvergenceUnit[]): Set<PulseGateName> {
  return new Set(units.flatMap((unit) => unit.gateNames));
}

export function shouldBuildGenericGateUnit(
  input: BuildPulseConvergencePlanInput,
  gateName: PulseGateName,
  coveredGateNames: Set<PulseGateName>,
): boolean {
  let gate = input.certification.gates[gateName];
  if (isDifferentState(gate.status, 'fail')) {
    return Boolean();
  }
  if (coveredGateNames.has(gateName)) {
    return Boolean();
  }
  return !hasActorGateEvidence(input.certification.gateEvidence, gateName);
}

export function determineGenericGatePriority(
  gate: PulseCertification['gates'][PulseGateName],
  focusList: string[],
  artifactPaths: string[],
): PulseConvergenceUnitPriority {
  let hasMappedProductEvidence =
    (gate.affectedCapabilityIds || []).length > 0 ||
    (gate.affectedFlowIds || []).length > 0 ||
    focusList.length > 0;
  if (isSameState(gate.failureClass ?? '', 'product_failure') && hasMappedProductEvidence) {
    return 'P0';
  }
  if (isSameState(gate.failureClass ?? '', 'product_failure')) {
    return 'P1';
  }
  if (
    isSameState(gate.evidenceMode ?? '', 'observed') ||
    artifactPaths.length > evidenceBatchSize()
  ) {
    return 'P2';
  }
  return 'P3';
}

export function buildGenericGateUnits(
  input: BuildPulseConvergencePlanInput,
  coveredGateNames: Set<PulseGateName>,
): PulseConvergenceUnit[] {
  let units: PulseConvergenceUnit[] = [];

  for (let gateName of Object.keys(input.certification.gates) as PulseGateName[]) {
    let gate = input.certification.gates[gateName];
    if (!shouldBuildGenericGateUnit(input, gateName, coveredGateNames)) {
      continue;
    }

    let focusList = summarizeGateFocus(gateName, input.certification);
    let artifactPaths = uniqueStrings([
      ...(input.certification.gateEvidence[gateName] || []).flatMap(
        (record) => record.artifactPaths,
      ),
      OBSERVED_ARTIFACTS.certificate,
    ]);
    let failureClass = normalizeFailureClass(gate.failureClass);

    units.push({
      id: `gate-${slugify(gateName)}`,
      order: 0,
      priority: determineGenericGatePriority(gate, focusList, artifactPaths),
      kind: 'gate',
      status: determineUnitStatus(failureClass),
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: determineGateLane(
        gateName,
        gate.affectedCapabilityIds || [],
        input.capabilityState,
      ),
      riskLevel:
        isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')
          ? 'critical'
          : isSameState(gateName, 'securityPass') || isSameState(gateName, 'isolationPass')
            ? 'critical'
            : 'medium',
      evidenceMode: gate.evidenceMode ?? 'observed',
      confidence: normalizeOptionalState(gate.confidence, 'medium'),
      productImpact: determineGateProductImpact(gateName),
      title: `Clear ${humanize(gateName)}`,
      summary: compactText(
        [gate.reason, focusList.length > 0 ? `Current focus: ${focusList.join(', ')}.` : '']
          .filter(Boolean)
          .join(' '),
        320,
      ),
      visionDelta: buildGateVisionDelta(gateName),
      targetState: `Gate ${gateName} must return pass with fresh evidence on the current commit.`,
      failureClass,
      actorKinds: [],
      gateNames: [gateName],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: isSameState(gateName, 'flowPass')
        ? uniqueStrings(
            input.certification.evidenceSummary.flows.results
              .filter((result) => isDifferentState(result.status, 'passed'))
              .map((result) => result.flowId),
          )
        : [],
      affectedCapabilityIds: gate.affectedCapabilityIds || [],
      affectedFlowIds: gate.affectedFlowIds || [],
      asyncExpectations: [],
      breakTypes: [],
      artifactPaths,
      relatedFiles: [],
      validationArtifacts: artifactPaths,
      expectedGateShift: `Pass ${gateName}`,
      exitCriteria: uniqueStrings([
        `Gate ${gateName} returns pass in the next certification run.`,
        focusList.length > 0 ? `Tracked gate focus is resolved: ${focusList.join(', ')}.` : null,
      ]),
    });
  }

  return units;
}
