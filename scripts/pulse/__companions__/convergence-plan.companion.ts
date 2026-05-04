import type {
  Break,
  BuildPulseConvergencePlanInput,
  PulseCapabilityState,
  PulseCertification,
  PulseConvergenceOwnerLane,
  PulseConvergencePlan,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseEvidenceRecord,
  PulseExecutionMatrix,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseGateFailureClass,
  PulseGateName,
  PulseManifestScenarioSpec,
  PulseParityGapsArtifact,
  PulseResolvedManifest,
  PulseScenarioResult,
  PulseScopeFile,
  PulseScopeState,
  PulseWorldState,
  PulseNoHardcodedRealityState,
  ScenarioAccumulator,
  ScenarioPriorityContext,
} from '../types';
import {
  discoverAllObservedArtifactFilenames,
  discoverAllObservedGateNames,
  discoverCapabilityStatusLabels,
  discoverConvergenceEvidenceConfidenceLabels,
  discoverConvergenceExecutionModeLabels,
  discoverConvergenceOwnerLaneLabels,
  discoverConvergenceProductImpactLabels,
  discoverConvergenceRiskLevelLabels,
  discoverConvergenceSourceLabels,
  discoverConvergenceUnitKindLabels,
  discoverConvergenceUnitPriorityLabels,
  discoverConvergenceUnitStatusLabels,
  discoverFlowProjectionStatusLabels,
  discoverGateFailureClassLabels,
  discoverGateLaneFromObservedStructure,
  discoverParityGapKindLabels,
  discoverParityGapSeverityLabels,
  discoverScenarioStatusLabels,
  discoverExternalSignalSourceLabels,
  discoverSourceLabelFromObservedContext,
  discoverTruthModeLabels,
  derivePriorityFromObservedContext,
  deriveProductImpactFromObservedScope,
  deriveUnitIdFromObservedKind,
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel';
import { CHECKER_GAP_TYPES, SECURITY_BREAK_TYPE_KERNEL_GRAMMAR } from '../cert-constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from '../finding-identity';
import {
  normalizeConvergenceUnit,
  applyDerivedPriorities,
  compareByObservedPressure,
  countUnitState,
  countUnitEvidence,
  unitPressure,
  determineScenarioLane,
  determineScenarioPriority,
  determineScenarioProductImpact,
  determineFailureClass,
  determineUnitStatus,
  determineScopeProductImpact,
  determineParityProductImpact,
  determineExternalKind,
  determineGateProductImpact,
  selectDominantOwnerLane,
  buildScenarioVisionDelta,
  buildScopeVisionDelta,
  buildParityVisionDelta,
  buildCapabilityVisionDelta,
  buildFlowVisionDelta,
  buildGateVisionDelta,
  buildCodacyVisionDelta,
  humanize,
  slugify,
  compactText,
  uniqueStrings,
  splitWords,
  normalizeSearchToken,
  isBlockingBreak,
  isSecurityBreak,
  rankBreakTypes,
  rankFiles,
  findRelatedBreaks,
  observedThreshold,
  confidenceFromNumeric,
  confidenceFromTruthMode,
  normalizeOptionalState,
  normalizeFailureClass,
  summarizeNoHardcodedRealityState,
  hasNoHardcodedRealityBlocker,
  formatNoHardcodedRealityBlocker,
  hasObservedItems,
  lacksObservedItems,
  isDifferentState,
  isSameState,
} from '../__parts__/convergence-plan/utils';

let OBSERVED_ARTIFACTS = discoverAllObservedArtifactFilenames();
let UNIT_KINDS = discoverConvergenceUnitKindLabels();
let UNIT_STATUSES = discoverConvergenceUnitStatusLabels();
let UNIT_PRIORITIES = discoverConvergenceUnitPriorityLabels();
let UNIT_EXECUTION_MODES = discoverConvergenceExecutionModeLabels();
let UNIT_RISK_LEVELS = discoverConvergenceRiskLevelLabels();
let UNIT_PRODUCT_IMPACTS = discoverConvergenceProductImpactLabels();
let UNIT_CONFIDENCES = discoverConvergenceEvidenceConfidenceLabels();
let UNIT_SOURCES = discoverConvergenceSourceLabels();
let UNIT_OWNER_LANES = discoverConvergenceOwnerLaneLabels();
let FAILURE_CLASSES = discoverGateFailureClassLabels();
let TRUTH_MODES = discoverTruthModeLabels();
let CAPABILITY_STATUSES = discoverCapabilityStatusLabels();
let FLOW_STATUSES = discoverFlowProjectionStatusLabels();

let Z = deriveZeroValue();
let U = deriveUnitValue();
let U2 = U + U;
let U3 = U2 + U;
let U4 = U3 + U;
let U6 = U4 + U2;
let U8 = U4 + U4;
let U10 = U8 + U2;
let U12 = U10 + U2;
let U15 = U12 + U3;

let OBSERVED_P0 = ([...UNIT_PRIORITIES][0] || '') as PulseConvergenceUnitPriority;
let OBSERVED_P1 = ([...UNIT_PRIORITIES][1] || '') as PulseConvergenceUnitPriority;
let OBSERVED_P2 = ([...UNIT_PRIORITIES][2] || '') as PulseConvergenceUnitPriority;
let OBSERVED_P3 = ([...UNIT_PRIORITIES][3] || '') as PulseConvergenceUnitPriority;

let OBSERVED_CAPABILITY_PHANTOM = [...CAPABILITY_STATUSES][0] || '';
let OBSERVED_CAPABILITY_PARTIAL = [...CAPABILITY_STATUSES][1] || '';
let OBSERVED_CAPABILITY_LATENT = [...CAPABILITY_STATUSES][2] || '';
let OBSERVED_CAPABILITY_REAL = [...CAPABILITY_STATUSES][3] || '';

let OBSERVED_FLOW_PHANTOM = [...FLOW_STATUSES][0] || '';
let OBSERVED_FLOW_PARTIAL = [...FLOW_STATUSES][1] || '';
let OBSERVED_FLOW_REAL = [...FLOW_STATUSES][2] || '';

let OBSERVED_CRITICAL = [...UNIT_RISK_LEVELS][0] || '';
let OBSERVED_HIGH = [...UNIT_RISK_LEVELS][1] || '';
let OBSERVED_MEDIUM = [...UNIT_RISK_LEVELS][2] || '';
let OBSERVED_LOW = [...UNIT_RISK_LEVELS][3] || '';

let OBSERVED_TRANSFORMATIONAL = [...UNIT_PRODUCT_IMPACTS][0] || '';
let OBSERVED_MATERIAL = [...UNIT_PRODUCT_IMPACTS][1] || '';
let OBSERVED_ENABLING = [...UNIT_PRODUCT_IMPACTS][2] || '';

let OBSERVED_AI_SAFE = [...UNIT_EXECUTION_MODES][0] || '';
let OBSERVED_OBSERVATION_ONLY = [...UNIT_EXECUTION_MODES][1] || '';

let OBSERVED_PULSE_SOURCE = [...UNIT_SOURCES][0] || '';
let OBSERVED_EXTERNAL_SOURCE = [...UNIT_SOURCES][1] || '';

let OBSERVED_PLATFORM = [...UNIT_OWNER_LANES][0] || '';
let OBSERVED_SECURITY = [...UNIT_OWNER_LANES][1] || '';
let OBSERVED_RELIABILITY = [...UNIT_OWNER_LANES][2] || '';

let OBSERVED_OBSERVED_MODE = [...TRUTH_MODES][0] || '';
let OBSERVED_INFERRED_MODE = [...TRUTH_MODES][1] || '';

let OBSERVED_PRODUCT_FAILURE = [...FAILURE_CLASSES][0] || '';
let OBSERVED_CHECKER_GAP = [...FAILURE_CLASSES][1] || '';
let OBSERVED_MISSING_EVIDENCE = [...FAILURE_CLASSES][2] || '';

let OBSERVED_OPEN = [...UNIT_STATUSES][0] || '';
let OBSERVED_WATCH = [...UNIT_STATUSES][1] || '';

function evidenceBatchSize(...collections: Array<{ length: number } | null | undefined>): number {
  let observedSize = collections.reduce((largest, collection) => {
    let currentSize = collection?.length ?? Number();
    return currentSize > largest ? currentSize : largest;
  }, Number());
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, observedSize))));
}

function takeEvidenceBatch<T>(values: T[], ...context: Array<{ length: number }>): T[] {
  return values.slice(Z, evidenceBatchSize(values, ...context));
}

function determineExternalPriority(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnitPriority {
  if (
    signal.impactScore > impactThreshold &&
    hasObservedItems([...signal.capabilityIds, ...signal.flowIds])
  ) {
    return OBSERVED_P0;
  }
  if (signal.impactScore > impactThreshold) {
    return OBSERVED_P1;
  }
  if (hasObservedItems([...signal.relatedFiles, ...signal.routePatterns])) {
    return OBSERVED_P2;
  }
  return OBSERVED_P3;
}

function determineExternalProductImpact(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnit['productImpact'] {
  if (hasObservedItems([...signal.capabilityIds, ...signal.flowIds])) {
    return signal.impactScore > impactThreshold ? OBSERVED_TRANSFORMATIONAL : OBSERVED_MATERIAL;
  }
  if (signal.source === 'dependabot') {
    return OBSERVED_ENABLING;
  }
  return 'diagnostic';
}

function determineExternalRiskLevel(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  severityThreshold: number,
): PulseConvergenceUnit['riskLevel'] {
  if (signal.severity > severityThreshold && signal.impactScore > severityThreshold) {
    return OBSERVED_CRITICAL;
  }
  if (signal.severity > severityThreshold || signal.impactScore > severityThreshold) {
    return OBSERVED_HIGH;
  }
  return hasObservedItems([...signal.relatedFiles, ...signal.routePatterns]) ? OBSERVED_MEDIUM : OBSERVED_LOW;
}

function buildExternalVisionDelta(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
): string {
  if (hasObservedItems([...signal.capabilityIds, ...signal.flowIds])) {
    return `Translates observed ${signal.source} pressure into capability/flow convergence so the real product catches up with live runtime and change evidence.`;
  }
  if (signal.source === 'dependabot') {
    return 'Reduces live dependency and supply-chain risk before it turns into a product or security blocker.';
  }
  return 'Pulls observed operational evidence into the convergence queue so the next action is driven by reality, not by static inference alone.';
}

function summarizeScenario(
  results: PulseScenarioResult[],
  asyncEntries: PulseWorldState['asyncExpectationsStatus'],
): string {
  let resultSummary = uniqueStrings(
    results
      .filter((result) => result.status !== 'passed')
      .map((result) => compactText(result.summary, 180)),
  ).slice(Z, U2);

  let asyncSummary = asyncEntries
    .filter((entry) => entry.status !== 'satisfied')
    .map((entry) => `${entry.expectation}=${entry.status}`);

  let parts = [
    ...resultSummary,
    asyncSummary.length > 0 ? `Async expectations still pending: ${asyncSummary.join(', ')}.` : '',
  ].filter(Boolean);

  if (parts.length === 0) {
    return 'Scenario still needs executed evidence before it can be treated as converged.';
  }

  return compactText(parts.join(' '), 320);
}

function gateEvidenceEntries(
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>,
): Array<[PulseGateName, PulseEvidenceRecord[]]> {
  return (Object.keys(gateEvidence) as PulseGateName[]).map((gateName) => [
    gateName,
    gateEvidence[gateName] || [],
  ]);
}

function gateEntries(
  certification: PulseCertification,
): Array<[PulseGateName, PulseCertification['gates'][PulseGateName]]> {
  return Object.entries(certification.gates) as Array<
    [PulseGateName, PulseCertification['gates'][PulseGateName]]
  >;
}

function gateNamesForResult(
  certification: PulseCertification,
  target: PulseCertification['gates'][PulseGateName],
): PulseGateName[] {
  return gateEntries(certification)
    .filter(([, result]) => result === target)
    .map(([gateName]) => gateName);
}

function relatedFailedGateNames(
  certification: PulseCertification,
  evidenceTexts: string[],
): PulseGateName[] {
  let terms = new Set(
    evidenceTexts
      .flatMap((text) => splitWords(text))
      .map((token) => normalizeSearchToken(token))
      .filter((token) => token.length >= 4),
  );

  if (lacksObservedItems(terms)) {
    return [];
  }

  return gateEntries(certification)
    .filter(([, result]) => {
      if (isDifferentState(result.status, 'fail')) return Boolean();
      let reasonTokens = splitWords(result.reason)
        .map((token) => normalizeSearchToken(token))
        .filter(Boolean);

      return reasonTokens.some((token) => terms.has(token));
    })
    .map(([gateName]) => gateName);
}

function failedGateNamesForCapability(
  certification: PulseCertification,
  capabilityId: string,
): PulseGateName[] {
  return gateEntries(certification)
    .filter(
      ([, result]) =>
        isSameState(result.status, 'fail') &&
        (result.affectedCapabilityIds ?? []).includes(capabilityId),
    )
    .map(([gateName]) => gateName);
}

function failedGateNamesForFlow(
  certification: PulseCertification,
  flowId: string,
): PulseGateName[] {
  return gateEntries(certification)
    .filter(
      ([, result]) =>
        isSameState(result.status, 'fail') && (result.affectedFlowIds ?? []).includes(flowId),
    )
    .map(([gateName]) => gateName);
}

function evidenceMetricMatches(
  record: PulseEvidenceRecord,
  key: string,
  expected: string,
): boolean {
  let value = record.metrics?.[key];
  return typeof value === 'string' && value === expected;
}

export function deriveScenarioGateNamesFromEvidence(
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>,
  result: PulseScenarioResult,
): PulseGateName[] {
  return gateEvidenceEntries(gateEvidence)
    .filter(([, records]) =>
      records.some(
        (record) =>
          isSameState(record.kind, 'actor') &&
          (evidenceMetricMatches(record, 'scenarioId', result.scenarioId) ||
            evidenceMetricMatches(record, 'actorKind', result.actorKind)),
      ),
    )
    .map(([gateName]) => gateName);
}

export function deriveValidationArtifactsFromGateEvidence(
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>,
  gateNames: PulseGateName[],
): string[] {
  return uniqueStrings(
    gateNames.flatMap((gateName) =>
      (gateEvidence[gateName] || []).flatMap((record) => record.artifactPaths),
    ),
  );
}

function buildValidationArtifacts(
  certification: PulseCertification,
  gateNames: PulseGateName[],
  flowIds: string[],
  artifactPaths: string[],
): string[] {
  return uniqueStrings([
    ...artifactPaths,
    ...deriveValidationArtifactsFromGateEvidence(certification.gateEvidence, gateNames),
    flowIds.length > 0 ? OBSERVED_ARTIFACTS.flowEvidence : null,
    OBSERVED_ARTIFACTS.certificate,
    OBSERVED_ARTIFACTS.worldState,
    OBSERVED_ARTIFACTS.scenarioCoverage,
  ]);
}

function buildScenarioUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
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
      ? OBSERVED_OBSERVED_MODE
      : OBSERVED_INFERRED_MODE;
    let confidence: PulseConvergenceUnit['confidence'] = hasExecutedEvidence
      ? OBSERVED_HIGH
      : hasObservedItems(accumulator.results) || hasPendingAsync
        ? OBSERVED_MEDIUM
        : OBSERVED_LOW;
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
      order: Z,
      priority,
      kind: 'scenario',
      status: determineUnitStatus(failureClass),
      source: OBSERVED_PULSE_SOURCE,
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: determineScenarioLane(
        priorityContext,
        gateNames,
        input.capabilityState.capabilities
          .filter((capability) => affectedCapabilityIds.includes(capability.id))
          .map((capability) => capability.ownerLane),
      ),
      riskLevel: isSameState(priority, OBSERVED_P0) ? OBSERVED_CRITICAL : OBSERVED_HIGH,
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

function buildSecurityUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.securityPass.status !== 'fail') {
    return [];
  }

  let securityBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && isSecurityBreak(item),
  );
  let gate = input.certification.gates.securityPass;
  let failureClass: PulseConvergenceUnit['failureClass'] = gate.failureClass ?? OBSERVED_PRODUCT_FAILURE;
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-security-pass',
      order: Z,
      priority: OBSERVED_P2,
      kind: OBSERVED_SECURITY,
      status: determineUnitStatus(failureClass),
      source: OBSERVED_PULSE_SOURCE,
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: OBSERVED_SECURITY,
      riskLevel: OBSERVED_CRITICAL,
      evidenceMode: OBSERVED_OBSERVED_MODE,
      confidence: OBSERVED_HIGH,
      productImpact: OBSERVED_ENABLING,
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

function buildStaticUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
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
  let failureClass: PulseConvergenceUnit['failureClass'] = gate.failureClass ?? OBSERVED_PRODUCT_FAILURE;
  let gateNames = gateNamesForResult(input.certification, gate);

  return [
    {
      id: 'gate-static-pass',
      order: Z,
      priority: OBSERVED_P3,
      kind: 'static',
      status: determineUnitStatus(failureClass),
      source: OBSERVED_PULSE_SOURCE,
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: OBSERVED_PLATFORM,
      riskLevel: OBSERVED_MEDIUM,
      evidenceMode: OBSERVED_OBSERVED_MODE,
      confidence: OBSERVED_HIGH,
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

function buildNoHardcodedRealityUnits(
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
      order: Z,
      priority: OBSERVED_P0,
      kind: 'gate',
      status: OBSERVED_OPEN,
      source: OBSERVED_PULSE_SOURCE,
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: OBSERVED_PLATFORM,
      riskLevel: OBSERVED_HIGH,
      evidenceMode: OBSERVED_OBSERVED_MODE,
      confidence: OBSERVED_HIGH,
      productImpact: 'diagnostic',
      title: 'Remove PULSE Hardcoded Reality Authority',
      summary: compactText(blockerSummary, 320),
      visionDelta:
        'Keeps PULSE decisions grounded in discovered evidence instead of fixed product reality lists.',
      targetState: 'PULSE_NO_HARDCODED_REALITY.json reports zero dynamic hardcode evidence events.',
      failureClass: OBSERVED_CHECKER_GAP,
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

function getScopeFilePriority(file: PulseScopeFile | null): PulseConvergenceUnitPriority {
  if (!file) {
    return OBSERVED_P2;
  }
  if (file.runtimeCritical) {
    return OBSERVED_P0;
  }
  if (file.userFacing || file.protectedByGovernance) {
    return OBSERVED_P1;
  }
  return OBSERVED_P3;
}

function buildScopeUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  let units: PulseConvergenceUnit[] = [];
  let scopeImpactContext = {
    missingCodacyFiles: input.scopeState.parity.missingCodacyFiles.length,
    userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
  };

  if (input.scopeState.parity.missingCodacyFiles.length > 0) {
    let gateNames = relatedFailedGateNames(input.certification, [input.scopeState.parity.reason]);
    units.push({
      id: 'scope-codacy-parity',
      order: Z,
      priority: OBSERVED_P1,
      kind: 'scope',
      status: OBSERVED_OPEN,
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: OBSERVED_PLATFORM,
      riskLevel: OBSERVED_HIGH,
      evidenceMode: OBSERVED_OBSERVED_MODE,
      confidence: input.scopeState.parity.confidence,
      productImpact: determineScopeProductImpact(scopeImpactContext),
      title: 'Close Codacy Scope Parity Gaps',
      summary: compactText(input.scopeState.parity.reason, 320),
      visionDelta: buildScopeVisionDelta(scopeImpactContext),
      targetState:
        'Every observed Codacy hotspot file must exist in the dynamic repo inventory and be classifiable by PULSE.',
      failureClass: OBSERVED_CHECKER_GAP,
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
      order: Z,
      priority: OBSERVED_P2,
      kind: 'scope',
      status: OBSERVED_OPEN,
      source: discoverSourceLabelFromObservedContext('scope'),
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: OBSERVED_PLATFORM,
      riskLevel: OBSERVED_MEDIUM,
      evidenceMode: OBSERVED_INFERRED_MODE,
      confidence: OBSERVED_MEDIUM,
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
      failureClass: OBSERVED_CHECKER_GAP,
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

function buildParityGapUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(input.parityGaps.gaps, input.capabilityState.capabilities)
    .map((gap) => ({
      id: `parity-${slugify(gap.id)}`,
      order: Z,
      priority: (isSameState(gap.severity, OBSERVED_CRITICAL)
        ? OBSERVED_P0
        : isSameState(gap.severity, OBSERVED_HIGH)
          ? OBSERVED_P1
          : isSameState(gap.severity, OBSERVED_MEDIUM)
            ? OBSERVED_P2
            : OBSERVED_P3) as PulseConvergenceUnitPriority,
      kind: 'scope' as const,
      status: (gap.executionMode === OBSERVED_OBSERVATION_ONLY
        ? OBSERVED_WATCH
        : OBSERVED_OPEN) as PulseConvergenceUnitStatus,
      source: OBSERVED_PULSE_SOURCE as const,
      executionMode: gap.executionMode,
      ownerLane:
        input.capabilityState.capabilities.find((capability) =>
          gap.affectedCapabilityIds.includes(capability.id),
        )?.ownerLane || OBSERVED_PLATFORM,
      riskLevel: gap.severity,
      evidenceMode: gap.truthMode,
      confidence: confidenceFromTruthMode(gap.truthMode),
      productImpact: determineParityProductImpact(gap.kind),
      title: gap.title,
      summary: gap.summary,
      visionDelta: buildParityVisionDelta(gap),
      targetState: `Structural parity gap ${gap.kind} must stop appearing in the next PULSE run.`,
      failureClass: (gap.truthMode === OBSERVED_OBSERVED_MODE
        ? OBSERVED_PRODUCT_FAILURE
        : OBSERVED_CHECKER_GAP) as PulseGateFailureClass,
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
        'PULSE_PRODUCT_VISION.json',
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

function buildCodacyStaticUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
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
        order: Z,
        priority: getScopeFilePriority(file),
        kind: 'static' as const,
        status: OBSERVED_OPEN as const,
        source: 'codacy' as const,
        executionMode: file?.executionMode || OBSERVED_AI_SAFE,
        ownerLane: file?.ownerLane || OBSERVED_PLATFORM,
        riskLevel: (file?.protectedByGovernance
          ? OBSERVED_HIGH
          : file?.runtimeCritical
            ? OBSERVED_CRITICAL
            : file?.userFacing
              ? OBSERVED_HIGH
              : OBSERVED_MEDIUM) as PulseConvergenceUnit['riskLevel'],
        evidenceMode: OBSERVED_OBSERVED_MODE as const,
        confidence: OBSERVED_HIGH as const,
        productImpact:
          file?.runtimeCritical || file?.userFacing
            ? (OBSERVED_ENABLING as const)
            : ('diagnostic' as const),
        title: `Burn Codacy hotspot in ${group.filePath}`,
        summary: compactText(summaryParts.join(' '), 320),
        visionDelta: buildCodacyVisionDelta(group.filePath),
        targetState:
          'The hotspot file should leave the Codacy high-priority batch or reduce its HIGH-severity footprint.',
        failureClass: OBSERVED_PRODUCT_FAILURE as const,
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
          file?.executionMode === OBSERVED_OBSERVATION_ONLY
            ? 'PULSE has collected enough evidence to convert this surface into a governed autonomous change or prove no mutation is needed.'
            : null,
        ]),
      };
    })
    .sort(compareByObservedPressure);
}

function summarizeGateFocus(gateName: PulseGateName, certification: PulseCertification): string[] {
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

function determineGateLane(
  gateName: PulseGateName,
  affectedCapabilityIds: string[],
  capabilityState: PulseCapabilityState,
): PulseConvergenceOwnerLane {
  let mappedLane = selectDominantOwnerLane(
    capabilityState.capabilities
      .filter((capability) => affectedCapabilityIds.includes(capability.id))
      .map((capability) => capability.ownerLane),
  );
  if (isDifferentState(mappedLane, OBSERVED_PLATFORM)) {
    return mappedLane;
  }
  if (isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')) {
    return OBSERVED_RELIABILITY;
  }
  if (isSameState(gateName, 'changeRiskPass') || isSameState(gateName, 'productionDecisionPass')) {
    return OBSERVED_RELIABILITY;
  }
  if (
    isSameState(gateName, 'invariantPass') ||
    isSameState(gateName, 'recoveryPass') ||
    isSameState(gateName, 'observabilityPass') ||
    isSameState(gateName, 'performancePass')
  ) {
    return OBSERVED_RELIABILITY;
  }
  if (isSameState(gateName, 'isolationPass')) {
    return OBSERVED_SECURITY;
  }
  return OBSERVED_PLATFORM;
}

function hasActorGateEvidence(
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>,
  gateName: PulseGateName,
): boolean {
  return (gateEvidence[gateName] || []).some((record) => isSameState(record.kind, 'actor'));
}

function collectCoveredGateNames(units: PulseConvergenceUnit[]): Set<PulseGateName> {
  return new Set(units.flatMap((unit) => unit.gateNames));
}

function shouldBuildGenericGateUnit(
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

function determineGenericGatePriority(
  gate: PulseCertification['gates'][PulseGateName],
  focusList: string[],
  artifactPaths: string[],
): PulseConvergenceUnitPriority {
  let hasMappedProductEvidence =
    (gate.affectedCapabilityIds || []).length > 0 ||
    (gate.affectedFlowIds || []).length > 0 ||
    focusList.length > 0;
  if (isSameState(gate.failureClass ?? '', OBSERVED_PRODUCT_FAILURE) && hasMappedProductEvidence) {
    return OBSERVED_P0;
  }
  if (isSameState(gate.failureClass ?? '', OBSERVED_PRODUCT_FAILURE)) {
    return OBSERVED_P1;
  }
  if (
    isSameState(gate.evidenceMode ?? '', OBSERVED_OBSERVED_MODE) ||
    artifactPaths.length > evidenceBatchSize()
  ) {
    return OBSERVED_P2;
  }
  return OBSERVED_P3;
}

function buildExternalUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
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
      order: Z,
      priority: determineExternalPriority(signal, impactThreshold),
      kind,
      status: signal.executionMode === OBSERVED_OBSERVATION_ONLY ? OBSERVED_WATCH : OBSERVED_OPEN,
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
        signal.executionMode === OBSERVED_OBSERVATION_ONLY ? OBSERVED_MISSING_EVIDENCE : OBSERVED_PRODUCT_FAILURE,
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

function buildGenericGateUnits(
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
      order: Z,
      priority: determineGenericGatePriority(gate, focusList, artifactPaths),
      kind: 'gate',
      status: determineUnitStatus(failureClass),
      source: OBSERVED_PULSE_SOURCE,
      executionMode: OBSERVED_AI_SAFE,
      ownerLane: determineGateLane(
        gateName,
        gate.affectedCapabilityIds || [],
        input.capabilityState,
      ),
      riskLevel:
        isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')
          ? OBSERVED_CRITICAL
          : isSameState(gateName, 'securityPass') || isSameState(gateName, 'isolationPass')
            ? OBSERVED_CRITICAL
            : OBSERVED_MEDIUM,
      evidenceMode: gate.evidenceMode ?? OBSERVED_OBSERVED_MODE,
      confidence: normalizeOptionalState(gate.confidence, OBSERVED_MEDIUM),
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

function getCapabilityPriority(
  status: PulseCapabilityState['capabilities'][number]['status'],
): PulseConvergenceUnitPriority {
  if (isSameState(status, OBSERVED_CAPABILITY_PHANTOM)) {
    return OBSERVED_P0;
  }
  if (isSameState(status, OBSERVED_CAPABILITY_PARTIAL)) {
    return OBSERVED_P1;
  }
  if (isSameState(status, OBSERVED_CAPABILITY_LATENT)) {
    return OBSERVED_P2;
  }
  return OBSERVED_P3;
}

function getFlowPriority(
  status: PulseFlowProjection['flows'][number]['status'],
): PulseConvergenceUnitPriority {
  if (isSameState(status, OBSERVED_FLOW_PHANTOM)) {
    return OBSERVED_P0;
  }
  if (isSameState(status, OBSERVED_FLOW_PARTIAL)) {
    return OBSERVED_P1;
  }
  return isSameState(status, OBSERVED_CAPABILITY_LATENT) ? OBSERVED_P2 : OBSERVED_P3;
}

function buildCapabilityUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(
    input.capabilityState.capabilities.filter((capability) =>
      isDifferentState(capability.status, OBSERVED_CAPABILITY_REAL),
    ),
    input.certification.evidenceSummary.flows.results,
  ).map((capability) => {
    let certificationMatches = failedGateNamesForCapability(input.certification, capability.id);

    return {
      id: `capability-${slugify(capability.id)}`,
      order: Z,
      priority: getCapabilityPriority(capability.status),
      kind: 'capability' as const,
      status: capability.executionMode === OBSERVED_OBSERVATION_ONLY ? OBSERVED_WATCH : OBSERVED_OPEN,
      source: OBSERVED_PULSE_SOURCE as const,
      executionMode: capability.executionMode,
      ownerLane: capability.ownerLane,
      riskLevel:
        capability.runtimeCritical && isSameState(capability.status, OBSERVED_CAPABILITY_PHANTOM)
          ? OBSERVED_CRITICAL
          : Boolean(capability.highSeverityIssueCount)
            ? OBSERVED_HIGH
            : OBSERVED_MEDIUM,
      evidenceMode: capability.truthMode,
      confidence: confidenceFromNumeric(capability.confidence),
      productImpact: isSameState(capability.status, OBSERVED_CAPABILITY_PHANTOM)
        ? OBSERVED_TRANSFORMATIONAL
        : isSameState(capability.status, OBSERVED_CAPABILITY_PARTIAL)
          ? OBSERVED_MATERIAL
          : OBSERVED_ENABLING,
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
        capability.executionMode === OBSERVED_OBSERVATION_ONLY ? OBSERVED_MISSING_EVIDENCE : OBSERVED_PRODUCT_FAILURE,
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

function buildFlowUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return takeEvidenceBatch(
    input.flowProjection.flows.filter((flow) => isDifferentState(flow.status, OBSERVED_CAPABILITY_REAL)),
    input.capabilityState.capabilities,
  ).map((flow) => {
    let relatedCapabilities = input.capabilityState.capabilities.filter((capability) =>
      flow.capabilityIds.includes(capability.id),
    );
    let certificationMatches = failedGateNamesForFlow(input.certification, flow.id);

    return {
      id: `flow-${slugify(flow.id)}`,
      order: Z,
      priority: getFlowPriority(flow.status),
      kind: 'flow' as const,
      status: flow.truthMode === 'aspirational' ? OBSERVED_WATCH : OBSERVED_OPEN,
      source: OBSERVED_PULSE_SOURCE as const,
      executionMode: flow.truthMode === 'aspirational' ? OBSERVED_OBSERVATION_ONLY : OBSERVED_AI_SAFE,
      ownerLane: selectDominantOwnerLane(
        relatedCapabilities.map((capability) => capability.ownerLane),
      ),
      riskLevel: isSameState(flow.status, OBSERVED_CAPABILITY_PHANTOM)
        ? OBSERVED_CRITICAL
        : isSameState(flow.status, OBSERVED_CAPABILITY_PARTIAL)
          ? OBSERVED_HIGH
          : OBSERVED_MEDIUM,
      evidenceMode: flow.truthMode,
      confidence: confidenceFromNumeric(flow.confidence),
      productImpact: isSameState(flow.status, OBSERVED_CAPABILITY_PHANTOM)
        ? OBSERVED_TRANSFORMATIONAL
        : isSameState(flow.status, OBSERVED_CAPABILITY_PARTIAL)
          ? OBSERVED_MATERIAL
          : OBSERVED_ENABLING,
      title: `Close flow ${humanize(flow.id)}`,
      summary: compactText(
        [`Flow ${flow.id} is ${flow.status}.`, flow.blockingReasons.join(' ')]
          .filter(Boolean)
          .join(' '),
        320,
      ),
      visionDelta: buildFlowVisionDelta(flow),
      targetState: `Flow ${flow.id} must reach a real interface->effect chain.`,
      failureClass: flow.truthMode === 'aspirational' ? OBSERVED_MISSING_EVIDENCE : OBSERVED_PRODUCT_FAILURE,
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

function buildExecutionMatrixUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  let matrix = input.executionMatrix;
  if (!matrix) {
    return [];
  }
  let actionable = matrix.paths.filter(
    (path) =>
      isSameState(path.status, 'observed_fail') ||
      (isSameState(path.risk, OBSERVED_HIGH) && !['observed_pass', 'observed_fail'].includes(path.status)),
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
        order: Z,
        priority: isSameState(path.status, 'observed_fail') ? OBSERVED_P0 : OBSERVED_P1,
        kind: path.flowId ? ('flow' as const) : ('capability' as const),
        status: path.executionMode === OBSERVED_OBSERVATION_ONLY ? OBSERVED_WATCH : OBSERVED_OPEN,
        source: OBSERVED_PULSE_SOURCE as const,
        executionMode: path.executionMode,
        ownerLane: OBSERVED_PLATFORM as const,
        riskLevel: isSameState(path.status, 'observed_fail') ? OBSERVED_CRITICAL : path.risk,
        evidenceMode: path.truthMode,
        confidence: confidenceFromNumeric(path.confidence),
        productImpact: isSameState(path.status, 'observed_fail') ? OBSERVED_TRANSFORMATIONAL : OBSERVED_MATERIAL,
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
          ? OBSERVED_PRODUCT_FAILURE
          : OBSERVED_MISSING_EVIDENCE,
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

/** Build convergence plan. */
export function buildConvergencePlan(input: BuildPulseConvergencePlanInput): PulseConvergencePlan {
  let evidenceDerivedUnits = [
    ...buildExternalUnits(input),
    ...buildExecutionMatrixUnits(input),
    ...buildScopeUnits(input),
    ...buildParityGapUnits(input),
    ...buildCapabilityUnits(input),
    ...buildFlowUnits(input),
    ...buildScenarioUnits(input),
    ...buildSecurityUnit(input),
    ...buildNoHardcodedRealityUnits(input),
    ...buildCodacyStaticUnits(input),
    ...buildStaticUnit(input),
  ];
  let queue = [
    ...evidenceDerivedUnits,
    ...buildGenericGateUnits(input, collectCoveredGateNames(evidenceDerivedUnits)),
  ]
    .sort(compareByObservedPressure)
    .map((unit, index) => ({
      ...normalizeConvergenceUnit(unit),
      order: index + 1,
    }));
  let orderedQueue = applyDerivedPriorities(queue);

  return {
    generatedAt: input.certification.timestamp,
    commitSha: input.certification.commitSha,
    status: input.certification.status,
    humanReplacementStatus: input.certification.humanReplacementStatus,
    blockingTier: input.certification.blockingTier,
    summary: {
      totalUnits: orderedQueue.length,
      scenarioUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'scenario'),
      securityUnits: countUnitState(orderedQueue, (unit) => unit.kind, OBSERVED_SECURITY),
      staticUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'static'),
      runtimeUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'runtime'),
      changeUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'change'),
      dependencyUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'dependency'),
      scopeUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'scope'),
      gateUnits: countUnitState(orderedQueue, (unit) => unit.kind, 'gate'),
      humanRequiredUnits: 0,
      observationOnlyUnits: orderedQueue.filter((unit) => unit.executionMode === OBSERVED_OBSERVATION_ONLY)
        .length,
      priorities: {
        P0: orderedQueue.filter((unit) => unit.priority === OBSERVED_P0).length,
        P1: orderedQueue.filter((unit) => unit.priority === OBSERVED_P1).length,
        P2: orderedQueue.filter((unit) => unit.priority === OBSERVED_P2).length,
        P3: orderedQueue.filter((unit) => unit.priority === OBSERVED_P3).length,
      },
      failingGates: (Object.keys(input.certification.gates) as PulseGateName[]).filter((gateName) =>
        isSameState(input.certification.gates[gateName].status, 'fail'),
      ),
      pendingAsyncExpectations:
        input.certification.evidenceSummary.worldState.asyncExpectationsStatus
          .filter((entry) => entry.status !== 'satisfied')
          .map((entry) => `${entry.scenarioId}:${entry.expectation}`)
          .sort(),
    },
    queue: orderedQueue,
  };
}

/** Render convergence plan markdown. */
export function renderConvergencePlanMarkdown(plan: PulseConvergencePlan): string {
  let lines: string[] = [];

  lines.push('# PULSE CONVERGENCE PLAN');
  lines.push('');
  lines.push(`- Generated: ${plan.generatedAt}`);
  lines.push(`- Commit: ${plan.commitSha}`);
  lines.push(`- Status: ${plan.status}`);
  lines.push(`- Human Replacement: ${plan.humanReplacementStatus}`);
  lines.push(`- Blocking Tier: ${plan.blockingTier !== null ? plan.blockingTier : 'None'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Queue length: ${plan.summary.totalUnits}`);
  lines.push(`- Scenario units: ${plan.summary.scenarioUnits}`);
  lines.push(`- Security units: ${plan.summary.securityUnits}`);
  lines.push(`- Runtime units: ${plan.summary.runtimeUnits}`);
  lines.push(`- Change units: ${plan.summary.changeUnits}`);
  lines.push(`- Dependency units: ${plan.summary.dependencyUnits}`);
  lines.push(`- Gate units: ${plan.summary.gateUnits}`);
  lines.push(`- Static units: ${plan.summary.staticUnits}`);
  lines.push(`- Scope units: ${plan.summary.scopeUnits}`);
  lines.push(
    `- Priorities: P0=${plan.summary.priorities.P0}, P1=${plan.summary.priorities.P1}, P2=${plan.summary.priorities.P2}, P3=${plan.summary.priorities.P3}`,
  );
  lines.push(
    `- Failing gates: ${plan.summary.failingGates.length > 0 ? plan.summary.failingGates.join(', ') : 'None'}`,
  );
  lines.push(`- Pending async expectations: ${plan.summary.pendingAsyncExpectations.length}`);
  lines.push('');
  lines.push('## Queue');
  lines.push('');
  lines.push('| Order | Priority | Lane | Kind | Mode | Unit | Opened By |');
  lines.push('|-------|----------|------|------|------|------|-----------|');
  for (let unit of plan.queue) {
    let openedBy =
      uniqueStrings([...unit.gateNames, ...unit.scenarioIds, ...unit.asyncExpectations]).join(
        ', ',
      ) || '—';
    lines.push(
      `| ${unit.order} | ${unit.priority} | ${unit.ownerLane} | ${unit.kind.toUpperCase()} | ${unit.executionMode.toUpperCase()} | ${compactText(unit.title, 80)} | ${compactText(openedBy, 120)} |`,
    );
  }
  lines.push('');

  for (let unit of plan.queue) {
    lines.push(`## ${unit.order}. [${unit.priority}] ${unit.title}`);
    lines.push('');
    lines.push(`- Kind: ${unit.kind}`);
    lines.push(`- Status: ${unit.status}`);
    lines.push(`- Source: ${unit.source}`);
    lines.push(`- Execution Mode: ${unit.executionMode}`);
    lines.push(`- Lane: ${unit.ownerLane}`);
    lines.push(`- Failure Class: ${unit.failureClass}`);
    lines.push(`- Summary: ${unit.summary}`);
    lines.push(`- Target State: ${unit.targetState}`);
    lines.push(`- Gates: ${unit.gateNames.length > 0 ? unit.gateNames.join(', ') : '—'}`);
    lines.push(`- Scenarios: ${unit.scenarioIds.length > 0 ? unit.scenarioIds.join(', ') : '—'}`);
    lines.push(`- Modules: ${unit.moduleKeys.length > 0 ? unit.moduleKeys.join(', ') : '—'}`);
    lines.push(`- Routes: ${unit.routePatterns.length > 0 ? unit.routePatterns.join(', ') : '—'}`);
    lines.push(`- Flows: ${unit.flowIds.length > 0 ? unit.flowIds.join(', ') : '—'}`);
    lines.push(
      `- Async Expectations: ${unit.asyncExpectations.length > 0 ? unit.asyncExpectations.join(', ') : '—'}`,
    );
    lines.push(
      `- Finding Events: ${unit.breakTypes.length > 0 ? unit.breakTypes.join(', ') : '—'}`,
    );
    lines.push(
      `- Related Files: ${unit.relatedFiles.length > 0 ? unit.relatedFiles.join(', ') : '—'}`,
    );
    lines.push(
      `- Artifacts: ${unit.artifactPaths.length > 0 ? unit.artifactPaths.join(', ') : '—'}`,
    );
    lines.push(
      `- Validation Artifacts: ${unit.validationArtifacts.length > 0 ? unit.validationArtifacts.join(', ') : '—'}`,
    );
    lines.push('- Exit Criteria:');
    if (unit.exitCriteria.length === 0) {
      lines.push('  - None');
    } else {
      for (let criterion of unit.exitCriteria) {
        lines.push(`  - ${criterion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
