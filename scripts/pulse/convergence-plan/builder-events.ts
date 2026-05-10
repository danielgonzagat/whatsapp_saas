import type { PulseGateName } from '../types.manifest';
import type { PulseConvergenceUnit } from '../types.convergence';
import type { BuildPulseConvergencePlanInput } from './kernel';
import {
  OBSERVED_ARTIFACTS,
} from './kernel';
import {
  observedPulseSource,
  observedScenarioKind,
  observedGateKind,
  observedOpenStatus,
  observedWatchStatus,
  observedP0Priority,
  observedCriticalRisk,
  observedHighRisk,
  observedPlatformLane,
  observedHighConfidence,
  observedMediumConfidence,
  observedLowConfidence,
  observedDiagnosticImpact,
  observedCheckerGapFailureClass,
} from './builder-labels';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from '../no-hardcoded-reality-state';
import {
  buildExternalVisionDelta,
  buildScenarioVisionDelta,
  buildValidationArtifacts,
  confidenceFromNumeric,
  compactText,
  deriveScenarioGateNamesFromEvidence,
  determineExternalKind,
  determineExternalPriority,
  determineExternalProductImpact,
  determineExternalRiskLevel,
  determineFailureClass,
  determineScenarioLane,
  determineScenarioPriority,
  determineScenarioProductImpact,
  determineUnitStatus,
  evidenceBatchSize,
  findRelatedBreaks,
  hasObservedItems,
  humanize,
  isBlockingBreak,
  isDifferentState,
  isSameState,
  normalizeSearchToken,
  observedThreshold,
  rankFiles,
  rankFindingEvents,
  relatedFailedGateNames,
  slugify,
  summarizeScenario,
  takeEvidenceBatch,
  uniqueStrings,
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
  let accumulators = new Map<string, import('./kernel').ScenarioAccumulator>();
  let actorResults = [
    ...input.certification.evidenceSummary.customer.results,
    ...input.certification.evidenceSummary.operator.results,
    ...input.certification.evidenceSummary.admin.results,
    ...input.certification.evidenceSummary.soak.results,
  ];
  function ensureAccumulator(scenarioId: string): import('./kernel').ScenarioAccumulator {
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
      ? observedHighConfidence
      : hasObservedItems(accumulator.results) || hasPendingAsync
        ? observedMediumConfidence
        : observedLowConfidence;
    let gateNames = uniqueStrings([...accumulator.gateNames]) as PulseGateName[];
    let priorityContext: import('./kernel').ScenarioPriorityContext = {
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
      kind: observedScenarioKind,
      status: determineUnitStatus(failureClass),
      source: observedPulseSource,
      executionMode: observedAiSafeExecutionMode,
      ownerLane: determineScenarioLane(
        priorityContext,
        gateNames,
        input.capabilityState.capabilities
          .filter((capability) => affectedCapabilityIds.includes(capability.id))
          .map((capability) => capability.ownerLane),
      ),
      riskLevel: isSameState(priority, 'P0') ? observedCriticalRisk : 'high',
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
      findingEvents: rankFindingEvents(relatedBreaks, evidenceBatchSize(relatedBreaks)),
      artifactPaths,
      relatedFiles: rankFiles(relatedBreaks, evidenceBatchSize(relatedBreaks)),
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
      priority: observedP0Priority,
      kind: observedGateKind,
      status: observedOpenStatus,
      source: observedPulseSource,
      executionMode: observedAiSafeExecutionMode,
      ownerLane: observedPlatformLane,
      riskLevel: observedHighRisk,
      evidenceMode: 'observed',
      confidence: observedHighConfidence,
      productImpact: observedDiagnosticImpact,
      title: 'Remove PULSE Hardcoded Reality Authority',
      summary: compactText(blockerSummary, 320),
      visionDelta:
        'Keeps PULSE decisions grounded in discovered evidence instead of fixed product reality lists.',
      targetState: 'PULSE_NO_HARDCODED_REALITY.json reports zero dynamic hardcode evidence events.',
      failureClass: observedCheckerGapFailureClass,
      actorKinds: [],
      gateNames,
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      findingEvents: ['dynamic_hardcode_evidence_event'],
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
      status:
        signal.executionMode === 'observation_only' ? observedWatchStatus : observedOpenStatus,
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
      findingEvents: [signal.type],
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
