import type { PulseGateName } from '../types.manifest';
import type { PulseCapabilityState } from '../types.capabilities/03-capability';
import type { PulseCertification } from '../types.evidence';
import type { PulseConvergenceOwnerLane } from '../types.gate-failure';
import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseEvidenceRecord,
} from '../types.convergence';
import type { BuildPulseConvergencePlanInput } from './kernel';
import {
  OBSERVED_ARTIFACTS,
  OBSERVED_GATES,
} from './kernel';
import {
  discoverGateLaneFromObservedStructure,
} from '../dynamic-reality-kernel/token-evidence';
import {
  observedPulseSource,
  observedAiSafeExecutionMode,
  observedSecurityKind,
  observedStaticKind,
  observedGateKind,
  observedP0Priority,
  observedP1Priority,
  observedP2Priority,
  observedP3Priority,
  observedCriticalRisk,
  observedMediumRisk,
  observedPlatformLane,
  observedSecurityLane,
  observedHighConfidence,
  observedDiagnosticImpact,
  observedEnablingImpact,
  observedProductFailureClass,
} from './builder-labels';
import {
  buildGateVisionDelta,
  compactText,
  determineGateProductImpact,
  determineUnitStatus,
  evidenceBatchSize,
  gateNamesForResult,
  humanize,
  isBlockingBreak,
  isDifferentState,
  isSameState,
  isSecurityBreak,
  normalizeFailureClass,
  normalizeOptionalState,
  rankFiles,
  rankFindingEvents,
  selectDominantOwnerLane,
  slugify,
  uniqueStrings,
} from './utils';

export function buildSecurityUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.securityPass.status !== 'fail') {
    return [];
  }

  let securityBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && isSecurityBreak(item),
  );
  let gate = input.certification.gates.securityPass;
  let failureClass: PulseConvergenceUnit['failureClass'] =
    gate.failureClass ?? observedProductFailureClass;
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-security-pass',
      order: 0,
      priority: observedP2Priority,
      kind: observedSecurityKind,
      status: determineUnitStatus(failureClass),
      source: observedPulseSource,
      executionMode: observedAiSafeExecutionMode,
      ownerLane: observedSecurityLane,
      riskLevel: observedCriticalRisk,
      evidenceMode: 'observed',
      confidence: observedHighConfidence,
      productImpact: observedEnablingImpact,
      title: 'Clear Blocking Security And Compliance Findings',
      summary: compactText(
        [
          gate.reason,
          securityBreaks.length > 0
            ? `Top blocking events: ${rankFindingEvents(securityBreaks).join(', ')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        320,
      ),
      visionDelta:
        'Removes blocking security and compliance risk so the projected product can converge without opening unsafe production paths.',
      targetState:
        'Security gate must pass with no blocking compliance, auth, cookie, secret, or sensitive-data findings.',
      failureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      findingEvents: rankFindingEvents(securityBreaks, evidenceBatchSize(securityBreaks)),
      breakTypes: [],
      artifactPaths: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      relatedFiles: rankFiles(securityBreaks, evidenceBatchSize(securityBreaks)),
      validationArtifacts: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      expectedGateShift: 'Pass securityPass',
      exitCriteria: uniqueStrings([
        'securityPass returns pass in the next certification run.',
        securityBreaks.length > 0
          ? `Blocking security events are cleared: ${rankFindingEvents(securityBreaks, evidenceBatchSize(securityBreaks)).join(', ')}.`
          : null,
      ]),
    },
  ];
}

export function buildStaticUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.staticPass.status !== 'fail') {
    return [];
  }

  let blockingBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && !isSecurityBreak(item),
  );
  if (blockingBreaks.length === 0) {
    return [];
  }

  let gate = input.certification.gates.staticPass;
  let failureClass: PulseConvergenceUnit['failureClass'] =
    gate.failureClass ?? observedProductFailureClass;
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-static-pass',
      order: 0,
      priority: observedP3Priority,
      kind: observedStaticKind,
      status: determineUnitStatus(failureClass),
      source: observedPulseSource,
      executionMode: observedAiSafeExecutionMode,
      ownerLane: observedPlatformLane,
      riskLevel: observedMediumRisk,
      evidenceMode: 'observed',
      confidence: observedHighConfidence,
      productImpact: observedDiagnosticImpact,
      title: 'Reduce Remaining Static Critical And High Breakers',
      summary: compactText(
        [
          gate.reason,
          `Top structural events: ${rankFindingEvents(blockingBreaks).join(', ')}.`,
        ].join(' '),
        320,
      ),
      visionDelta:
        'Reduces remaining static blockers so higher-value product and runtime work can converge without recurring structural noise.',
      targetState:
        'Static certification should have no remaining critical/high blockers outside the scenario and security queues.',
      failureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      findingEvents: rankFindingEvents(blockingBreaks, evidenceBatchSize(blockingBreaks)),
      breakTypes: [],
      artifactPaths: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      relatedFiles: rankFiles(blockingBreaks, evidenceBatchSize(blockingBreaks)),
      validationArtifacts: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      expectedGateShift: 'Pass staticPass',
      exitCriteria: uniqueStrings([
        'staticPass returns pass in the next certification run.',
        `Blocking static break inventory reaches zero for the tracked set (${blockingBreaks.length} currently open).`,
      ]),
    },
  ];
}

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
    return evidenceBatchSize()
      ? uniqueStrings(certification.evidenceSummary.syntheticCoverage.uncoveredPages)
      : [];
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
  if (isDifferentState(mappedLane, observedPlatformLane)) {
    return mappedLane;
  }
  let kernelDerivedLane = discoverGateLaneFromObservedStructure(gateName);
  if (isDifferentState(kernelDerivedLane, observedPlatformLane)) {
    return kernelDerivedLane;
  }
  let extendedReliabilityGates = new Set<string>(
    OBSERVED_GATES.filter(
      (g) =>
        g.includes('runtime') ||
        g.includes('flow') ||
        g.includes('change') ||
        g.includes('production') ||
        g.includes('invariant'),
    ),
  );
  if (extendedReliabilityGates.has(gateName)) {
    return 'reliability';
  }
  return observedPlatformLane;
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
  if (isSameState(gate.failureClass ?? '', observedProductFailureClass) && hasMappedProductEvidence)
    return observedP0Priority;
  if (isSameState(gate.failureClass ?? '', observedProductFailureClass)) return observedP1Priority;
  if (
    isSameState(gate.evidenceMode ?? '', 'observed') ||
    artifactPaths.length > evidenceBatchSize()
  )
    return observedP2Priority;
  return observedP3Priority;
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
      kind: observedGateKind,
      status: determineUnitStatus(failureClass),
      source: observedPulseSource,
      executionMode: observedAiSafeExecutionMode,
      ownerLane: determineGateLane(
        gateName,
        gate.affectedCapabilityIds || [],
        input.capabilityState,
      ),
      riskLevel:
        isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')
          ? observedCriticalRisk
          : isSameState(gateName, 'securityPass') || isSameState(gateName, 'isolationPass')
            ? observedCriticalRisk
            : observedMediumRisk,
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
      findingEvents: [],
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
