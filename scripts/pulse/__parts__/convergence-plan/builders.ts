import type {
  Break,
  PulseCapabilityState,
  PulseCertification,
  PulseConvergenceOwnerLane,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseEvidenceRecord,
  PulseGateFailureClass,
  PulseGateName,
  PulseFlowProjection,
  PulseParityGapsArtifact,
  PulseScopeFile,
} from '../../types';
import type {
  BuildPulseConvergencePlanInput,
  ScenarioAccumulator,
  ScenarioPriorityContext,
} from './kernel';
import {
  CAPABILITY_STATUSES,
  EXTERNAL_SIGNAL_SOURCES,
  FAILURE_CLASSES,
  FLOW_STATUSES,
  OBSERVED_ARTIFACTS,
  OBSERVED_GATES,
  PARITY_GAP_KINDS,
  PARITY_GAP_SEVERITIES,
  TRUTH_MODES,
  UNIT_CONFIDENCES,
  UNIT_EXECUTION_MODES,
  UNIT_KINDS,
  UNIT_OWNER_LANES,
  UNIT_PRIORITIES,
  UNIT_RISK_LEVELS,
  UNIT_PRODUCT_IMPACTS,
  UNIT_STATUSES,
} from './kernel';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from '../../no-hardcoded-reality-state';
import {
  discoverGateLaneFromObservedStructure,
  derivePriorityFromObservedContext,
  discoverSourceLabelFromObservedContext,
} from '../../dynamic-reality-kernel';
import {
  buildCapabilityVisionDelta,
  buildCodacyVisionDelta,
  buildExternalVisionDelta,
  buildFlowVisionDelta,
  buildGateVisionDelta,
  buildParityVisionDelta,
  buildScopeVisionDelta,
  buildScenarioVisionDelta,
  buildValidationArtifacts,
  compareByObservedPressure,
  confidenceFromNumeric,
  confidenceFromTruthMode,
  deriveScenarioGateNamesFromEvidence,
  determineExternalKind,
  determineExternalPriority,
  determineExternalProductImpact,
  determineExternalRiskLevel,
  determineFailureClass,
  determineGateProductImpact,
  determineParityProductImpact,
  determineScenarioLane,
  determineScenarioPriority,
  determineScenarioProductImpact,
  determineScopeProductImpact,
  determineUnitStatus,
  evidenceBatchSize,
  failedGateNamesForCapability,
  failedGateNamesForFlow,
  findRelatedBreaks,
  gateNamesForResult,
  hasObservedItems,
  humanize,
  isBlockingBreak,
  isDifferentState,
  isSameState,
  isSecurityBreak,
  normalizeFailureClass,
  normalizeOptionalState,
  observedThreshold,
  rankBreakTypes,
  rankFiles,
  relatedFailedGateNames,
  selectDominantOwnerLane,
  slugify,
  summarizeScenario,
  takeEvidenceBatch,
  uniqueStrings,
  compactText,
} from './utils';

export function buildScenarioUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  let scenarioSpecById = new Map(
    input.resolvedManifest.scenarioSpecs.map((spec) => [spec.id, spec] as const),
  );
  let flowResultById = new Map(
    input.certification.evidenceSummary.flows.results.map(
      (result) => [result.flowId, result] as const,
    ),
  );
  let accumulators = new Map<string, ScenarioAccumulator>();
  let actorResults = [
    ...input.certification.evidenceSummary.customer.results,
    ...input.certification.evidenceSummary.operator.results,
    ...input.certification.evidenceSummary.admin.results,
    ...input.certification.evidenceSummary.soak.results,
  ];

  function ensureAccumulator(scenarioId: string): ScenarioAccumulator {
    if (!accumulators.has(scenarioId)) {
      accumulators.set(scenarioId, {
        scenarioId,
        spec: scenarioSpecById.get(scenarioId) || null,
        actorKinds: new Set<string>(),
        gateNames: new Set<PulseGateName>(),
        results: [],
        asyncEntries: [],
      });
    }
    return accumulators.get(scenarioId)!;
  }

  for (let result of actorResults) {
    let accumulator = ensureAccumulator(result.scenarioId);
    accumulator.results.push(result);
    accumulator.actorKinds.add(result.actorKind);
    let evidenceGateNames = deriveScenarioGateNamesFromEvidence(
      input.certification.gateEvidence,
      result,
    );
    for (let gateName of evidenceGateNames) {
      accumulator.gateNames.add(gateName);
    }
    let requiresBrowser =
      Boolean(result.metrics?.requiresBrowser) || Boolean(accumulator.spec?.requiresBrowser);
    if (requiresBrowser) {
      accumulator.gateNames.add('browserPass');
    }
  }

  for (let entry of input.certification.evidenceSummary.worldState.asyncExpectationsStatus) {
    if (entry.status === 'satisfied') {
      continue;
    }
    let accumulator = ensureAccumulator(entry.scenarioId);
    accumulator.asyncEntries.push(entry);
    if (accumulator.spec?.actorKind) {
      accumulator.actorKinds.add(accumulator.spec.actorKind);
    }
  }

  let units: PulseConvergenceUnit[] = [];
  for (let accumulator of accumulators.values()) {
    let spec = accumulator.spec;
    let isCritical =
      Boolean(spec?.critical) || accumulator.results.some((result) => result.critical);
    if (!isCritical) {
      continue;
    }

    let hasNonPassingResult = accumulator.results.some((result) => result.status !== 'passed');
    let hasPendingAsync = accumulator.asyncEntries.some((entry) => entry.status !== 'satisfied');
    if (!hasNonPassingResult && !hasPendingAsync) {
      continue;
    }

    let moduleKeys = uniqueStrings([
      ...(spec?.moduleKeys || []),
      ...accumulator.results.flatMap((result) => result.moduleKeys),
    ]);
    let routePatterns = uniqueStrings([
      ...(spec?.routePatterns || []),
      ...accumulator.results.flatMap((result) => result.routePatterns),
    ]);
    let flowIds = uniqueStrings(spec?.flowSpecs || []);
    let affectedCapabilityIds = uniqueStrings([
      ...input.capabilityState.capabilities
        .filter((capability) => {
          let capabilityName = normalizeSearchToken(`${capability.id} ${capability.name}`);
          let routeMatch = routePatterns.some((pattern) =>
            capability.routePatterns.some(
              (routePattern) =>
                normalizeSearchToken(routePattern).includes(normalizeSearchToken(pattern)) ||
                normalizeSearchToken(pattern).includes(normalizeSearchToken(routePattern)),
            ),
          );
          let moduleMatch = moduleKeys.some((moduleKey) =>
            capabilityName.includes(normalizeSearchToken(moduleKey)),
          );
          return routeMatch || moduleMatch;
        })
        .map((capability) => capability.id),
      ...input.flowProjection.flows
        .filter((flow) => flowIds.includes(flow.id))
        .flatMap((flow) => flow.capabilityIds),
    ]);
    let asyncExpectations = uniqueStrings([
      ...(spec?.asyncExpectations || []),
      ...accumulator.asyncEntries.map((entry) => entry.expectation),
    ]);
    let actorKinds = uniqueStrings([...accumulator.actorKinds, spec?.actorKind || null]);
    let artifactPaths = uniqueStrings([
      ...accumulator.results.flatMap((result) => result.artifactPaths),
      OBSERVED_ARTIFACTS.certificate,
    ]);
    let relatedBreaks = findRelatedBreaks(
      input.health.breaks.filter(isBlockingBreak),
      accumulator.scenarioId,
      moduleKeys,
      routePatterns,
      flowIds,
    );
    let failureClass = determineFailureClass(
      accumulator.results
        .filter((result) => isDifferentState(result.status, 'passed'))
        .map((result) => result.failureClass),
      hasPendingAsync,
    );
    let requiresBrowser =
      Boolean(spec?.requiresBrowser) ||
      accumulator.results.some((result) => Boolean(result.metrics?.requiresBrowser));
    let flowExitCriteria = flowIds
      .map((flowId) => flowResultById.get(flowId))
      .filter(Boolean)
      .map((result) => result!.flowId);
    let hasExecutedEvidence = accumulator.results.some((result) => result.executed);
    let evidenceMode: PulseConvergenceUnit['evidenceMode'] = hasExecutedEvidence
      ? 'observed'
      : 'inferred';
    let confidence: PulseConvergenceUnit['confidence'] = hasExecutedEvidence
      ? 'high'
      : hasObservedItems(accumulator.results) || hasPendingAsync
        ? 'medium'
        : 'low';
    let gateNames = uniqueStrings([...accumulator.gateNames]) as PulseGateName[];
    let priorityContext: ScenarioPriorityContext = {
      critical: isCritical,
      hasObservedFailure: accumulator.results.some(
        (result) => result.executed && isDifferentState(result.status, 'passed'),
      ),
      hasPendingAsync,
      requiresBrowser,
      requiresPersistence: Boolean(spec?.requiresPersistence),
      executedEvidenceCount: accumulator.results.filter((result) => result.executed).length,
      failingGateCount: gateNames.length,
    };
    let priority = determineScenarioPriority(priorityContext);

    units.push({
      id: `scenario-${slugify(accumulator.scenarioId)}`,
      order: 0,
      priority,
      kind: 'scenario',
      status: determineUnitStatus(failureClass),
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: determineScenarioLane(
        priorityContext,
        gateNames,
        input.capabilityState.capabilities
          .filter((capability) => affectedCapabilityIds.includes(capability.id))
          .map((capability) => capability.ownerLane),
      ),
      riskLevel: isSameState(priority, 'P0') ? 'critical' : 'high',
      evidenceMode,
      confidence,
      productImpact: determineScenarioProductImpact(priorityContext),
      title: `Recover ${humanize(accumulator.scenarioId)}`,
      summary: summarizeScenario(accumulator.results, accumulator.asyncEntries),
      visionDelta: buildScenarioVisionDelta(accumulator.scenarioId, priorityContext),
      targetState: `Scenario ${accumulator.scenarioId} must pass end-to-end and leave no pending async expectations in world state.`,
      failureClass,
      actorKinds,
      gateNames,
      scenarioIds: [accumulator.scenarioId],
      moduleKeys,
      routePatterns,
      flowIds,
      affectedCapabilityIds,
      affectedFlowIds: flowIds,
      asyncExpectations,
      breakTypes: rankBreakTypes(relatedBreaks, 6),
      artifactPaths,
      relatedFiles: rankFiles(relatedBreaks, 10),
      validationArtifacts: buildValidationArtifacts(
        input.certification,
        gateNames,
        flowIds,
        artifactPaths,
      ),
      expectedGateShift: hasObservedItems(accumulator.gateNames)
        ? `Pass ${[...accumulator.gateNames].join(', ')}`
        : undefined,
      exitCriteria: uniqueStrings([
        `Scenario ${accumulator.scenarioId} reports status=passed in synthetic evidence.`,
        asyncExpectations.length > 0
          ? `Async expectations settle to satisfied: ${asyncExpectations.join(', ')}.`
          : null,
        flowExitCriteria.length > 0
          ? `Related flow evidence passes: ${flowExitCriteria.join(', ')}.`
          : null,
        requiresBrowser && routePatterns.length > 0
          ? `Browser-required routes stay green: ${routePatterns.join(', ')}.`
          : null,
      ]),
    });
  }

  return units;
}

export function buildSecurityUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.securityPass.status !== 'fail') {
    return [];
  }

  let securityBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && isSecurityBreak(item),
  );
  let gate = input.certification.gates.securityPass;
  let failureClass: PulseConvergenceUnit['failureClass'] = gate.failureClass ?? 'product_failure';
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-security-pass',
      order: 0,
      priority: 'P2',
      kind: 'security',
      status: determineUnitStatus(failureClass),
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: 'security',
      riskLevel: 'critical',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'enabling',
      title: 'Clear Blocking Security And Compliance Findings',
      summary: compactText(
        [
          gate.reason,
          securityBreaks.length > 0
            ? `Top blocking events: ${rankBreakTypes(securityBreaks).join(', ')}.`
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
      breakTypes: rankBreakTypes(securityBreaks, 8),
      artifactPaths: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      relatedFiles: rankFiles(securityBreaks, 12),
      validationArtifacts: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      expectedGateShift: 'Pass securityPass',
      exitCriteria: uniqueStrings([
        'securityPass returns pass in the next certification run.',
        securityBreaks.length > 0
          ? `Blocking security events are cleared: ${rankBreakTypes(securityBreaks, 8).join(', ')}.`
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
  let failureClass: PulseConvergenceUnit['failureClass'] = gate.failureClass ?? 'product_failure';
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-static-pass',
      order: 0,
      priority: 'P3',
      kind: 'static',
      status: determineUnitStatus(failureClass),
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'medium',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'diagnostic',
      title: 'Reduce Remaining Static Critical And High Breakers',
      summary: compactText(
        [gate.reason, `Top structural events: ${rankBreakTypes(blockingBreaks).join(', ')}.`].join(
          ' ',
        ),
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
      breakTypes: rankBreakTypes(blockingBreaks, 10),
      artifactPaths: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      relatedFiles: rankFiles(blockingBreaks, 15),
      validationArtifacts: [OBSERVED_ARTIFACTS.certificate, OBSERVED_ARTIFACTS.report],
      expectedGateShift: 'Pass staticPass',
      exitCriteria: uniqueStrings([
        'staticPass returns pass in the next certification run.',
        `Blocking static break inventory reaches zero for the tracked set (${blockingBreaks.length} currently open).`,
      ]),
    },
  ];
}

export function buildNoHardcodedRealityUnits(
  input: BuildPulseConvergencePlanInput,
): PulseConvergenceUnit[] {
  let summary = summarizeNoHardcodedRealityState(input.noHardcodedRealityState);
  if (!hasNoHardcodedRealityBlocker(summary)) {
    return [];
  }
  let blockerSummary = formatNoHardcodedRealityBlocker(summary);
  let gateNames = relatedFailedGateNames(input.certification, [blockerSummary]);

  return [
    {
      id: 'pulse-no-hardcoded-reality-state',
      order: 0,
      priority: 'P0',
      kind: 'gate',
      status: 'open',
      source: 'pulse',
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'high',
      evidenceMode: 'observed',
      confidence: 'high',
      productImpact: 'diagnostic',
      title: 'Remove PULSE Hardcoded Reality Authority',
      summary: compactText(blockerSummary, 320),
      visionDelta:
        'Keeps PULSE decisions grounded in discovered evidence instead of fixed product reality lists.',
      targetState: 'PULSE_NO_HARDCODED_REALITY.json reports zero dynamic hardcode evidence events.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['dynamic_hardcode_evidence_event'],
      artifactPaths: [OBSERVED_ARTIFACTS.noHardcodedReality, OBSERVED_ARTIFACTS.certificate],
      relatedFiles: summary.topFiles,
      validationArtifacts: [
        OBSERVED_ARTIFACTS.noHardcodedReality,
        OBSERVED_ARTIFACTS.convergencePlan,
        OBSERVED_ARTIFACTS.cliDirective,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass noOverclaimPass and clear hardcoded reality state blockers',
      exitCriteria: [
        'PULSE_NO_HARDCODED_REALITY.json totalEvents equals 0.',
        'PULSE_CERTIFICATE.json noOverclaimPass returns pass for hardcoded reality state.',
      ],
    },
  ];
}

export function getScopeFilePriority(file: PulseScopeFile | null): PulseConvergenceUnitPriority {
  if (!file) {
    return 'P2';
  }
  if (file.runtimeCritical) {
    return 'P0';
  }
  if (file.userFacing || file.protectedByGovernance) {
    return 'P1';
  }
  return 'P3';
}

import { normalizeSearchToken } from './utils';

export function buildScopeUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  let units: PulseConvergenceUnit[] = [];
  let scopeImpactContext = {
    missingCodacyFiles: input.scopeState.parity.missingCodacyFiles.length,
    userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
  };

  if (input.scopeState.parity.missingCodacyFiles.length > 0) {
    let gateNames = relatedFailedGateNames(input.certification, [input.scopeState.parity.reason]);
    units.push({
      id: 'scope-codacy-parity',
      order: 0,
      priority: 'P1',
      kind: 'scope',
      status: 'open',
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'high',
      evidenceMode: 'observed',
      confidence: input.scopeState.parity.confidence,
      productImpact: determineScopeProductImpact(scopeImpactContext),
      title: 'Close Codacy Scope Parity Gaps',
      summary: compactText(input.scopeState.parity.reason, 320),
      visionDelta: buildScopeVisionDelta(scopeImpactContext),
      targetState:
        'Every observed Codacy hotspot file must exist in the dynamic repo inventory and be classifiable by PULSE.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['SCOPE_PARITY_GAP'],
      artifactPaths: [OBSERVED_ARTIFACTS.scopeState, OBSERVED_ARTIFACTS.codacyState],
      relatedFiles: input.scopeState.parity.missingCodacyFiles,
      validationArtifacts: [
        OBSERVED_ARTIFACTS.scopeState,
        OBSERVED_ARTIFACTS.codacyState,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass scopeClosed',
      exitCriteria: [
        'scopeClosed returns pass in the next certification run.',
        'All observed Codacy hotspot files are covered by the repo inventory.',
      ],
    });
  }

  if (input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length > 0) {
    let scopeOnlyModuleCandidates = input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates;
    let gateNames = relatedFailedGateNames(input.certification, scopeOnlyModuleCandidates);
    units.push({
      id: 'scope-unmapped-module-candidates',
      order: 0,
      priority: 'P2',
      kind: 'scope',
      status: 'open',
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: 'ai_safe',
      ownerLane: 'platform',
      riskLevel: 'medium',
      evidenceMode: 'inferred',
      confidence: 'medium',
      productImpact: determineScopeProductImpact({
        missingCodacyFiles: 0,
        userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
      }),
      title: 'Resolve Scope-Only Module Candidates',
      summary: compactText(
        `Scope-derived user-facing module candidates remain outside the resolved manifest: ${scopeOnlyModuleCandidates.join(', ')}.`,
        320,
      ),
      visionDelta: buildScopeVisionDelta({
        missingCodacyFiles: 0,
        userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
      }),
      targetState:
        'All user-facing scope-derived module candidates map into the resolved manifest or are deliberately reclassified.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: scopeOnlyModuleCandidates,
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['SCOPE_MODULE_DRIFT'],
      artifactPaths: [OBSERVED_ARTIFACTS.scopeState, OBSERVED_ARTIFACTS.resolvedManifest],
      relatedFiles: input.scopeState.files
        .filter(
          (file) =>
            Boolean(file.moduleCandidate) &&
            input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.includes(
              file.moduleCandidate!,
            ),
        )
        .map((file) => file.path),
      validationArtifacts: [
        OBSERVED_ARTIFACTS.scopeState,
        OBSERVED_ARTIFACTS.resolvedManifest,
        OBSERVED_ARTIFACTS.certificate,
      ],
      expectedGateShift: 'Pass truthExtractionPass',
      exitCriteria: [
        'truthExtractionPass returns pass in the next certification run.',
        'Scope-only module candidates are either resolved into the manifest overlay or intentionally excluded.',
      ],
    });
  }

  return units;
}

export function buildParityGapUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(input.parityGaps.gaps, input.capabilityState.capabilities)
    .map((gap) => ({
      id: `parity-${slugify(gap.id)}`,
      order: 0,
      priority: (isSameState(gap.severity, 'critical')
        ? [...UNIT_PRIORITIES].find((p) => p.includes('P0'))!
        : isSameState(gap.severity, [...PARITY_GAP_SEVERITIES].find((s) => s.includes('high'))!)
          ? [...UNIT_PRIORITIES].find((p) => p.includes('P1'))!
          : isSameState(gap.severity, [...PARITY_GAP_SEVERITIES].find((s) => s.includes('medium'))!)
            ? [...UNIT_PRIORITIES].find((p) => p.includes('P2'))!
            : [...UNIT_PRIORITIES].find((p) => p.includes('P3'))!) as PulseConvergenceUnitPriority,
      kind: 'scope' as const,
      status: (gap.executionMode === 'observation_only'
        ? 'watch'
        : 'open') as PulseConvergenceUnitStatus,
      source: 'pulse' as const,
      executionMode: gap.executionMode,
      ownerLane:
        input.capabilityState.capabilities.find((capability) =>
          gap.affectedCapabilityIds.includes(capability.id),
        )?.ownerLane || 'platform',
      riskLevel: gap.severity,
      evidenceMode: gap.truthMode,
      confidence: confidenceFromTruthMode(gap.truthMode),
      productImpact: determineParityProductImpact(gap.kind),
      title: gap.title,
      summary: gap.summary,
      visionDelta: buildParityVisionDelta(gap),
      targetState: `Structural parity gap ${gap.kind} must stop appearing in the next PULSE run.`,
      failureClass: (gap.truthMode === 'observed'
        ? 'product_failure'
        : 'checker_gap') as PulseGateFailureClass,
      actorKinds: [],
      gateNames: [],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: gap.routePatterns,
      flowIds: gap.affectedFlowIds,
      affectedCapabilityIds: gap.affectedCapabilityIds,
      affectedFlowIds: gap.affectedFlowIds,
      asyncExpectations: [],
      breakTypes: [gap.kind],
      artifactPaths: [OBSERVED_ARTIFACTS.parityGaps, OBSERVED_ARTIFACTS.cliDirective],
      relatedFiles: gap.relatedFiles,
      validationArtifacts: uniqueStrings([
        OBSERVED_ARTIFACTS.parityGaps,
        OBSERVED_ARTIFACTS.cliDirective,
        OBSERVED_ARTIFACTS.productVision,
      ]),
      expectedGateShift:
        isSameState(gap.kind, 'front_without_back') ||
        isSameState(gap.kind, 'ui_without_persistence') ||
        isSameState(gap.kind, 'feature_declared_without_runtime')
          ? 'Reduce product parity drift'
          : undefined,
      exitCriteria: uniqueStrings([
        ...gap.validationTargets,
        `Gap ${gap.kind} is absent from the next PULSE_PARITY_GAPS.json snapshot.`,
      ]),
    }))
    .sort(compareByObservedPressure);
}

export function buildCodacyStaticUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.scopeState.codacy.highPriorityBatch.length === 0) {
    return [];
  }

  let inventoryByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  let grouped = new Map<
    string,
    {
      filePath: string;
      issues: typeof input.scopeState.codacy.highPriorityBatch;
      issueCount: number;
    }
  >();

  for (let issue of input.scopeState.codacy.highPriorityBatch) {
    if (!grouped.has(issue.filePath)) {
      grouped.set(issue.filePath, {
        filePath: issue.filePath,
        issues: [],
        issueCount:
          input.scopeState.codacy.topFiles.find((entry) => entry.filePath === issue.filePath)
            ?.issueCount ?? Number(),
      });
    }
    grouped.get(issue.filePath)!.issues.push(issue);
  }

  return [...grouped.values()]
    .map((group) => {
      let file = inventoryByPath.get(group.filePath) || null;
      let categories = uniqueStrings(group.issues.map((issue) => issue.category));
      let patterns = uniqueStrings(group.issues.map((issue) => issue.patternId));
      let summaryParts = [
        `${group.issues.length} HIGH issue(s) currently prioritized by Codacy for ${group.filePath}.`,
        categories.length > 0 ? `Categories: ${categories.join(', ')}.` : '',
        patterns.length > 0
          ? `Patterns: ${takeEvidenceBatch(patterns, categories).join(', ')}.`
          : '',
      ].filter(Boolean);
      let certificationMatches = relatedFailedGateNames(input.certification, [
        ...summaryParts,
        categories.join(' '),
        patterns.join(' '),
        group.filePath,
      ]);

      return {
        id: `codacy-${slugify(group.filePath)}`,
        order: 0,
        priority: getScopeFilePriority(file),
        kind: 'static' as const,
        status: 'open' as const,
        source: 'codacy' as const,
        executionMode: file?.executionMode || 'ai_safe',
        ownerLane: file?.ownerLane || 'platform',
        riskLevel: (file?.protectedByGovernance
          ? 'high'
          : file?.runtimeCritical
            ? 'critical'
            : file?.userFacing
              ? 'high'
              : 'medium') as PulseConvergenceUnit['riskLevel'],
        evidenceMode: 'observed' as const,
        confidence: 'high' as const,
        productImpact:
          file?.runtimeCritical || file?.userFacing
            ? ('enabling' as const)
            : ('diagnostic' as const),
        title: `Burn Codacy hotspot in ${group.filePath}`,
        summary: compactText(summaryParts.join(' '), 320),
        visionDelta: buildCodacyVisionDelta(group.filePath),
        targetState:
          'The hotspot file should leave the Codacy high-priority batch or reduce its HIGH-severity footprint.',
        failureClass: 'product_failure' as const,
        actorKinds: [],
        gateNames: certificationMatches,
        scenarioIds: [],
        moduleKeys: file?.moduleCandidate ? [file.moduleCandidate] : [],
        routePatterns: [],
        flowIds: [],
        affectedCapabilityIds: [],
        affectedFlowIds: [],
        asyncExpectations: [],
        breakTypes: patterns,
        artifactPaths: [OBSERVED_ARTIFACTS.codacyState, OBSERVED_ARTIFACTS.scopeState],
        relatedFiles: [group.filePath],
        validationArtifacts: [
          OBSERVED_ARTIFACTS.codacyState,
          OBSERVED_ARTIFACTS.scopeState,
          OBSERVED_ARTIFACTS.certificate,
        ],
        expectedGateShift: hasObservedItems(certificationMatches)
          ? `Reduce ${certificationMatches.map(humanize).join('/')} pressure`
          : 'Reduce static evidence pressure',
        exitCriteria: uniqueStrings([
          `Codacy no longer reports ${group.filePath} in the current high-priority batch.`,
          file?.executionMode === 'observation_only'
            ? 'PULSE has collected enough evidence to convert this surface into a governed autonomous change or prove no mutation is needed.'
            : null,
        ]),
      };
    })
    .sort(compareByObservedPressure);
}

export function summarizeGateFocus(gateName: PulseGateName, certification: PulseCertification): string[] {
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
  let kernelDerivedLane = discoverGateLaneFromObservedStructure(gateName);
  if (isDifferentState(kernelDerivedLane, 'platform')) {
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
  let productFailureClass = [...FAILURE_CLASSES].find((fc) => fc.includes('product_failure'))!;
  let observedMode = [...TRUTH_MODES].find((t) => t.includes('observed'))!;
  let p0 = [...UNIT_PRIORITIES].find((p) => p.includes('P0'))!;
  let p1 = [...UNIT_PRIORITIES].find((p) => p.includes('P1'))!;
  let p2 = [...UNIT_PRIORITIES].find((p) => p.includes('P2'))!;
  let p3 = [...UNIT_PRIORITIES].find((p) => p.includes('P3'))!;
  let hasMappedProductEvidence =
    (gate.affectedCapabilityIds || []).length > 0 ||
    (gate.affectedFlowIds || []).length > 0 ||
    focusList.length > 0;
  if (isSameState(gate.failureClass ?? '', productFailureClass) && hasMappedProductEvidence)
    return p0;
  if (isSameState(gate.failureClass ?? '', productFailureClass)) return p1;
  if (
    isSameState(gate.evidenceMode ?? '', observedMode) ||
    artifactPaths.length > evidenceBatchSize()
  )
    return p2;
  return p3;
}

export function buildExternalUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (!input.externalSignalState) {
    return [];
  }

  let candidateSignals = input.externalSignalState.signals.filter(
    (signal) => signal.source !== 'codacy',
  );
  let impactThreshold = observedThreshold(candidateSignals.map((signal) => signal.impactScore));
  let severityThreshold = observedThreshold(candidateSignals.map((signal) => signal.severity));

  return takeEvidenceBatch(
    candidateSignals.filter((signal) => signal.impactScore >= impactThreshold),
    input.capabilityState.capabilities,
    input.flowProjection.flows,
  ).map((signal) => {
    let kind = determineExternalKind(signal);
    let certificationMatches = relatedFailedGateNames(input.certification, [
      signal.source,
      signal.type,
      signal.summary,
      ...signal.capabilityIds,
      ...signal.flowIds,
    ]);
    return {
      id: `external-${slugify(`${signal.source}-${signal.id}`)}`,
      order: 0,
      priority: determineExternalPriority(signal, impactThreshold),
      kind,
      status: signal.executionMode === 'observation_only' ? 'watch' : 'open',
      source: 'external',
      executionMode: signal.executionMode,
      ownerLane: signal.ownerLane,
      riskLevel: determineExternalRiskLevel(signal, severityThreshold),
      evidenceMode: signal.truthMode,
      confidence: confidenceFromNumeric(signal.confidence),
      productImpact: determineExternalProductImpact(signal, impactThreshold),
      title: `Resolve ${humanize(signal.source)} ${humanize(signal.type)}`,
      summary: compactText(signal.summary, 320),
      visionDelta: buildExternalVisionDelta(signal),
      targetState: `External signal ${signal.source}/${signal.type} must clear or materially downgrade in the next Pulse snapshot.`,
      failureClass:
        signal.executionMode === 'observation_only' ? 'missing_evidence' : 'product_failure',
      actorKinds: [],
      gateNames: certificationMatches,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: signal.routePatterns,
      flowIds: signal.flowIds,
      affectedCapabilityIds: signal.capabilityIds,
      affectedFlowIds: signal.flowIds,
      asyncExpectations: [],
      breakTypes: [signal.type],
      artifactPaths: [OBSERVED_ARTIFACTS.externalSignalState],
      relatedFiles: signal.relatedFiles,
      validationArtifacts: signal.validationTargets,
      expectedGateShift: hasObservedItems(certificationMatches)
        ? `Pass ${certificationMatches.map(humanize).join('/')}`
        : 'External signal is downgraded with fresh evidence',
      exitCriteria: uniqueStrings([
        `Signal ${signal.source}/${signal.type} is absent or downgraded below the high-impact threshold in the next snapshot.`,
        hasObservedItems(signal.capabilityIds)
          ? `Mapped capabilities are materially addressed: ${signal.capabilityIds.join(', ')}.`
          : null,
        hasObservedItems(signal.flowIds)
          ? `Mapped flows are materially addressed: ${signal.flowIds.join(', ')}.`
          : null,
      ]),
    };
  });
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

export function buildCapabilityUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
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
    };
  });
}

export function buildExecutionMatrixUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
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
        priority: isSameState(path.status, 'observed_fail') ? 'P0' : 'P1',
        kind: path.flowId ? ('flow' as const) : ('capability' as const),
        status: path.executionMode === 'observation_only' ? 'watch' : 'open',
        source: 'pulse' as const,
        executionMode: path.executionMode,
        ownerLane: 'platform' as const,
        riskLevel: isSameState(path.status, 'observed_fail') ? 'critical' : path.risk,
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
        breakTypes: [],
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
      };
    },
  );
}
