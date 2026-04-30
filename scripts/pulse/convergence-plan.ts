import type {
  Break,
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
  PulseParityGapsArtifact,
  PulseGateFailureClass,
  PulseGateName,
  PulseManifestScenarioSpec,
  PulseResolvedManifest,
  PulseScenarioResult,
  PulseScopeFile,
  PulseScopeState,
  PulseFlowProjection,
  PulseWorldState,
} from './types';
import {
  CHECKER_GAP_TYPES,
  EXCLUDED_GATE_UNITS,
  GATE_PRIORITY,
  KIND_RANK,
  PRODUCT_IMPACT_RANK,
  PRIORITY_RANK,
  SECURITY_PATTERNS,
} from './convergence-plan.constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from './finding-identity';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
  type PulseNoHardcodedRealityState,
} from './no-hardcoded-reality-state';

interface BuildPulseConvergencePlanInput {
  health: { breaks: Break[] };
  resolvedManifest: PulseResolvedManifest;
  scopeState: PulseScopeState;
  certification: PulseCertification;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  parityGaps: PulseParityGapsArtifact;
  externalSignalState?: PulseExternalSignalState;
  executionMatrix?: PulseExecutionMatrix;
  noHardcodedRealityState?: PulseNoHardcodedRealityState;
}

interface ScenarioAccumulator {
  scenarioId: string;
  spec: PulseManifestScenarioSpec | null;
  actorKinds: Set<string>;
  gateNames: Set<PulseGateName>;
  results: PulseScenarioResult[];
  asyncEntries: PulseWorldState['asyncExpectationsStatus'];
}

interface ScenarioPriorityContext {
  critical: boolean;
  hasObservedFailure: boolean;
  hasPendingAsync: boolean;
  requiresBrowser: boolean;
  requiresPersistence: boolean;
  executedEvidenceCount: number;
  failingGateCount: number;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

function compactText(value: string, max: number = 260): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/g)
    .filter(Boolean);
}

function slugify(value: string): string {
  return splitWords(value)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanize(value: string): string {
  return splitWords(value)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function isBlockingBreak(item: Break): boolean {
  return (
    (item.severity === 'critical' || item.severity === 'high') &&
    !CHECKER_GAP_TYPES.has(item.type) &&
    isBlockingDynamicFinding(item)
  );
}

function isSecurityBreak(item: Break): boolean {
  return SECURITY_PATTERNS.some((pattern) => pattern.test(item.type));
}

function rankBreakTypes(breaks: Break[], limit: number = 8): string[] {
  return summarizeDynamicFindingEvents(breaks, limit);
}

function rankFiles(breaks: Break[], limit: number = 10): string[] {
  const counts = new Map<string, number>();
  for (const item of breaks) {
    counts.set(item.file, (counts.get(item.file) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([file, count]) => (count > 1 ? `${file} (${count})` : file));
}

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildSearchTerms(
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): string[] {
  const routeTerms = routePatterns.flatMap((route) => route.split('/').filter(Boolean));
  const flowTerms = flowIds.flatMap((flowId) => flowId.split(/[-_]+/g));
  const scenarioTerms = scenarioId.split(/[-_]+/g);

  return uniqueStrings([...moduleKeys, ...routeTerms, ...flowTerms, ...scenarioTerms]).filter(
    (term) => normalizeSearchToken(term).length >= 3,
  );
}

function findRelatedBreaks(
  breaks: Break[],
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): Break[] {
  const terms = buildSearchTerms(scenarioId, moduleKeys, routePatterns, flowIds);
  if (terms.length === 0) {
    return [];
  }

  return breaks.filter((item) => {
    const haystack = normalizeSearchToken(
      [item.file, item.description, item.detail, item.source || '', item.surface || ''].join(' '),
    );

    return terms.some((term) => haystack.includes(normalizeSearchToken(term)));
  });
}

function determineFailureClass(
  classes: Array<PulseGateFailureClass | undefined>,
  hasPendingAsync: boolean,
): PulseConvergenceUnit['failureClass'] {
  const uniqueClasses = uniqueStrings(classes);
  if (uniqueClasses.length === 1) {
    return uniqueClasses[0] as PulseGateFailureClass;
  }
  if (uniqueClasses.length > 1) {
    return 'mixed';
  }
  if (hasPendingAsync) {
    return 'product_failure';
  }
  return 'unknown';
}

function determineUnitStatus(
  failureClass: PulseConvergenceUnit['failureClass'],
): PulseConvergenceUnitStatus {
  return failureClass === 'missing_evidence' || failureClass === 'checker_gap' ? 'watch' : 'open';
}

function normalizeConvergenceExecutionMode(
  mode: PulseConvergenceUnit['executionMode'],
): PulseConvergenceUnit['executionMode'] {
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'observation_only';
  }
  return 'ai_safe';
}

function normalizeConvergenceUnit(unit: PulseConvergenceUnit): PulseConvergenceUnit {
  const executionMode = normalizeConvergenceExecutionMode(unit.executionMode);
  if (executionMode === unit.executionMode) {
    return unit;
  }

  return {
    ...unit,
    status: 'watch',
    executionMode,
    failureClass: unit.failureClass === 'product_failure' ? 'missing_evidence' : unit.failureClass,
    exitCriteria: uniqueStrings([
      ...unit.exitCriteria,
      'PULSE captures validation evidence before converting this surface into governed autonomous execution.',
      'Rollback expectation is captured before mutation moves beyond observation.',
    ]),
  };
}

function determineScenarioPriority(context: ScenarioPriorityContext): PulseConvergenceUnitPriority {
  if (
    context.critical &&
    (context.hasObservedFailure ||
      context.hasPendingAsync ||
      context.requiresBrowser ||
      context.requiresPersistence)
  ) {
    return 'P0';
  }
  if (context.critical || context.failingGateCount >= 2) {
    return 'P1';
  }
  if (context.executedEvidenceCount === 0) {
    return 'P2';
  }
  return 'P3';
}

function determineScenarioLane(
  context: ScenarioPriorityContext,
  gateNames: PulseGateName[],
  affectedCapabilityLanes: PulseConvergenceOwnerLane[],
): PulseConvergenceOwnerLane {
  const mappedLane = selectDominantOwnerLane(affectedCapabilityLanes);
  if (mappedLane !== 'platform') {
    return mappedLane;
  }
  if (gateNames.includes('securityPass') || gateNames.includes('isolationPass')) {
    return 'security';
  }
  if (
    gateNames.includes('recoveryPass') ||
    gateNames.includes('performancePass') ||
    gateNames.includes('observabilityPass') ||
    context.hasPendingAsync
  ) {
    return 'reliability';
  }
  if (context.requiresBrowser || gateNames.includes('flowPass')) {
    return 'reliability';
  }
  return 'platform';
}

function selectDominantOwnerLane(
  lanes: Array<PulseConvergenceOwnerLane | null | undefined>,
): PulseConvergenceOwnerLane {
  const available = lanes.filter((lane): lane is PulseConvergenceOwnerLane => Boolean(lane));
  if (available.includes('security')) {
    return 'security';
  }
  if (available.includes('reliability')) {
    return 'reliability';
  }
  if (available.includes('customer')) {
    return 'customer';
  }
  if (available.includes('operator-admin')) {
    return 'operator-admin';
  }
  return 'platform';
}

function confidenceFromNumeric(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) {
    return 'high';
  }
  if (score >= 0.5) {
    return 'medium';
  }
  return 'low';
}

function confidenceFromTruthMode(
  truthMode: 'observed' | 'inferred' | 'aspirational',
): 'high' | 'medium' | 'low' {
  if (truthMode === 'observed') {
    return 'high';
  }
  if (truthMode === 'inferred') {
    return 'medium';
  }
  return 'low';
}

function determineScenarioProductImpact(
  context: ScenarioPriorityContext,
): PulseConvergenceUnit['productImpact'] {
  if (context.critical && (context.hasObservedFailure || context.hasPendingAsync)) {
    return 'transformational';
  }
  if (context.critical || context.requiresPersistence || context.requiresBrowser) {
    return 'material';
  }
  return 'enabling';
}

function determineScopeProductImpact(context: {
  missingCodacyFiles: number;
  userFacingCandidates: number;
}): PulseConvergenceUnit['productImpact'] {
  if (context.missingCodacyFiles > 0) {
    return 'material';
  }
  if (context.userFacingCandidates > 0) {
    return 'enabling';
  }
  return 'enabling';
}

function determineParityProductImpact(
  gapKind: PulseParityGapsArtifact['gaps'][number]['kind'],
): PulseConvergenceUnit['productImpact'] {
  if (
    gapKind === 'front_without_back' ||
    gapKind === 'ui_without_persistence' ||
    gapKind === 'feature_declared_without_runtime'
  ) {
    return 'transformational';
  }
  if (gapKind === 'back_without_front' || gapKind === 'flow_without_validation') {
    return 'material';
  }
  return 'enabling';
}

function determineGateProductImpact(
  gateName: PulseGateName,
): PulseConvergenceUnit['productImpact'] {
  if (
    gateName === 'runtimePass' ||
    gateName === 'flowPass' ||
    gateName === 'changeRiskPass' ||
    gateName === 'productionDecisionPass'
  ) {
    return 'material';
  }
  if (
    gateName === 'invariantPass' ||
    gateName === 'recoveryPass' ||
    gateName === 'observabilityPass' ||
    gateName === 'performancePass' ||
    gateName === 'isolationPass'
  ) {
    return 'enabling';
  }
  return 'diagnostic';
}

function buildScenarioVisionDelta(scenarioId: string, context: ScenarioPriorityContext): string {
  if (context.hasObservedFailure) {
    return `Turns the observed failure in ${humanize(scenarioId)} into an executed repair target with fresh proof.`;
  }
  if (context.hasPendingAsync) {
    return `Closes pending asynchronous evidence for ${humanize(scenarioId)} so convergence is based on settled world-state proof.`;
  }
  return `Improves executed evidence for ${humanize(scenarioId)} and reduces uncertainty in the runtime product state.`;
}

function buildScopeVisionDelta(context: {
  missingCodacyFiles: number;
  userFacingCandidates: number;
}): string {
  if (context.missingCodacyFiles > 0) {
    return 'Closes scope drift between what Codacy is flagging and what PULSE can actually inventory and classify.';
  }
  return 'Reduces structural ambiguity so later capability, flow, and product vision inference stop depending on unclassified surfaces.';
}

function buildParityVisionDelta(gap: PulseParityGapsArtifact['gaps'][number]): string {
  if (gap.kind === 'front_without_back' || gap.kind === 'ui_without_persistence') {
    return `Converts a user-facing illusion into a real product chain for ${gap.routePatterns[0] || gap.title}.`;
  }
  if (gap.kind === 'feature_declared_without_runtime') {
    return `Aligns declared product promise with live runtime reality for ${gap.title}.`;
  }
  if (gap.kind === 'flow_without_validation') {
    return `Adds missing proof that ${gap.title} can complete without silent failure.`;
  }
  return `Reduces structural drift that keeps the projected product shape ahead of the real implementation.`;
}

function buildCapabilityVisionDelta(
  capability: PulseCapabilityState['capabilities'][number],
): string {
  return `Moves capability ${capability.name} from ${capability.status} toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.`;
}

function buildFlowVisionDelta(flow: PulseFlowProjection['flows'][number]): string {
  return `Moves flow ${humanize(flow.id)} from ${flow.status} toward a complete interface-to-effect path instead of a partial or projected experience.`;
}

function buildGateVisionDelta(gateName: PulseGateName): string {
  if (gateName === 'runtimePass' || gateName === 'flowPass') {
    return `Turns ${humanize(gateName)} from a certification blocker into live executed evidence for the affected runtime behavior.`;
  }
  if (gateName === 'isolationPass' || gateName === 'securityPass') {
    return `Protects the target product shape by removing blocking safety gaps before production convergence.`;
  }
  return `Improves trust in the reconstructed product state by clearing ${humanize(gateName)} as a blocking evidence layer.`;
}

function buildCodacyVisionDelta(filePath: string): string {
  return `Shrinks static debt in ${filePath} so capability and flow work can converge without recurring structural regressions.`;
}

function determineExternalKind(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
): PulseConvergenceUnit['kind'] {
  if (signal.source === 'dependabot' || /dependency|vuln|supply/i.test(signal.type)) {
    return 'dependency';
  }
  if (
    signal.source === 'sentry' ||
    signal.source === 'datadog' ||
    signal.source === 'prometheus' ||
    /runtime|latency|error|incident|timeout/i.test(signal.type)
  ) {
    return 'runtime';
  }
  return 'change';
}

function determineExternalPriority(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
): PulseConvergenceUnitPriority {
  if (signal.impactScore >= 0.85) {
    return 'P0';
  }
  if (signal.impactScore >= 0.7) {
    return 'P1';
  }
  if (signal.impactScore >= 0.5) {
    return 'P2';
  }
  return 'P3';
}

function determineExternalProductImpact(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
): PulseConvergenceUnit['productImpact'] {
  if (signal.capabilityIds.length > 0 || signal.flowIds.length > 0) {
    return signal.impactScore >= 0.8 ? 'transformational' : 'material';
  }
  if (signal.source === 'dependabot') {
    return 'enabling';
  }
  return 'diagnostic';
}

function buildExternalVisionDelta(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
): string {
  if (signal.capabilityIds.length > 0 || signal.flowIds.length > 0) {
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
  const resultSummary = uniqueStrings(
    results
      .filter((result) => result.status !== 'passed')
      .map((result) => compactText(result.summary, 180)),
  ).slice(0, 2);

  const asyncSummary = asyncEntries
    .filter((entry) => entry.status !== 'satisfied')
    .map((entry) => `${entry.expectation}=${entry.status}`);

  const parts = [
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

function evidenceMetricMatches(
  record: PulseEvidenceRecord,
  key: string,
  expected: string,
): boolean {
  const value = record.metrics?.[key];
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
          record.kind === 'actor' &&
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
    flowIds.length > 0 ? 'PULSE_FLOW_EVIDENCE.json' : null,
    'PULSE_CERTIFICATE.json',
    'PULSE_WORLD_STATE.json',
    'PULSE_SCENARIO_COVERAGE.json',
  ]);
}

function buildScenarioUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  const scenarioSpecById = new Map(
    input.resolvedManifest.scenarioSpecs.map((spec) => [spec.id, spec] as const),
  );
  const flowResultById = new Map(
    input.certification.evidenceSummary.flows.results.map(
      (result) => [result.flowId, result] as const,
    ),
  );
  const fallbackActorGateGrammar: Record<string, PulseGateName> = {
    customer: 'customerPass',
    operator: 'operatorPass',
    admin: 'adminPass',
    soak: 'soakPass',
  };
  const accumulators = new Map<string, ScenarioAccumulator>();
  const actorResults = [
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

  for (const result of actorResults) {
    const accumulator = ensureAccumulator(result.scenarioId);
    accumulator.results.push(result);
    accumulator.actorKinds.add(result.actorKind);
    const evidenceGateNames = deriveScenarioGateNamesFromEvidence(
      input.certification.gateEvidence,
      result,
    );
    for (const gateName of evidenceGateNames) {
      accumulator.gateNames.add(gateName);
    }
    if (evidenceGateNames.length === 0) {
      accumulator.gateNames.add(fallbackActorGateGrammar[result.actorKind]);
    }
    const requiresBrowser =
      Boolean(result.metrics?.requiresBrowser) || Boolean(accumulator.spec?.requiresBrowser);
    if (requiresBrowser) {
      accumulator.gateNames.add('browserPass');
    }
  }

  for (const entry of input.certification.evidenceSummary.worldState.asyncExpectationsStatus) {
    if (entry.status === 'satisfied') {
      continue;
    }
    const accumulator = ensureAccumulator(entry.scenarioId);
    accumulator.asyncEntries.push(entry);
    if (accumulator.spec?.actorKind) {
      accumulator.actorKinds.add(accumulator.spec.actorKind);
    }
  }

  const units: PulseConvergenceUnit[] = [];
  for (const accumulator of accumulators.values()) {
    const spec = accumulator.spec;
    const isCritical =
      Boolean(spec?.critical) || accumulator.results.some((result) => result.critical);
    if (!isCritical) {
      continue;
    }

    const hasNonPassingResult = accumulator.results.some((result) => result.status !== 'passed');
    const hasPendingAsync = accumulator.asyncEntries.some((entry) => entry.status !== 'satisfied');
    if (!hasNonPassingResult && !hasPendingAsync) {
      continue;
    }

    const moduleKeys = uniqueStrings([
      ...(spec?.moduleKeys || []),
      ...accumulator.results.flatMap((result) => result.moduleKeys),
    ]);
    const routePatterns = uniqueStrings([
      ...(spec?.routePatterns || []),
      ...accumulator.results.flatMap((result) => result.routePatterns),
    ]);
    const flowIds = uniqueStrings(spec?.flowSpecs || []);
    const affectedCapabilityIds = uniqueStrings([
      ...input.capabilityState.capabilities
        .filter((capability) => {
          const capabilityName = normalizeSearchToken(`${capability.id} ${capability.name}`);
          const routeMatch = routePatterns.some((pattern) =>
            capability.routePatterns.some(
              (routePattern) =>
                normalizeSearchToken(routePattern).includes(normalizeSearchToken(pattern)) ||
                normalizeSearchToken(pattern).includes(normalizeSearchToken(routePattern)),
            ),
          );
          const moduleMatch = moduleKeys.some((moduleKey) =>
            capabilityName.includes(normalizeSearchToken(moduleKey)),
          );
          return routeMatch || moduleMatch;
        })
        .map((capability) => capability.id),
      ...input.flowProjection.flows
        .filter((flow) => flowIds.includes(flow.id))
        .flatMap((flow) => flow.capabilityIds),
    ]);
    const asyncExpectations = uniqueStrings([
      ...(spec?.asyncExpectations || []),
      ...accumulator.asyncEntries.map((entry) => entry.expectation),
    ]);
    const actorKinds = uniqueStrings([...accumulator.actorKinds, spec?.actorKind || null]);
    const artifactPaths = uniqueStrings([
      ...accumulator.results.flatMap((result) => result.artifactPaths),
      'PULSE_CERTIFICATE.json',
    ]);
    const relatedBreaks = findRelatedBreaks(
      input.health.breaks.filter(isBlockingBreak),
      accumulator.scenarioId,
      moduleKeys,
      routePatterns,
      flowIds,
    );
    const failureClass = determineFailureClass(
      accumulator.results
        .filter((result) => result.status !== 'passed')
        .map((result) => result.failureClass),
      hasPendingAsync,
    );
    const requiresBrowser =
      Boolean(spec?.requiresBrowser) ||
      accumulator.results.some((result) => Boolean(result.metrics?.requiresBrowser));
    const flowExitCriteria = flowIds
      .map((flowId) => flowResultById.get(flowId))
      .filter(Boolean)
      .map((result) => result!.flowId);
    const hasExecutedEvidence = accumulator.results.some((result) => result.executed);
    const evidenceMode = hasExecutedEvidence ? 'observed' : 'inferred';
    const confidence = hasExecutedEvidence
      ? 'high'
      : accumulator.results.length > 0 || hasPendingAsync
        ? 'medium'
        : 'low';
    const gateNames = uniqueStrings([...accumulator.gateNames]) as PulseGateName[];
    const priorityContext: ScenarioPriorityContext = {
      critical: isCritical,
      hasObservedFailure: accumulator.results.some(
        (result) => result.executed && result.status !== 'passed',
      ),
      hasPendingAsync,
      requiresBrowser,
      requiresPersistence: Boolean(spec?.requiresPersistence),
      executedEvidenceCount: accumulator.results.filter((result) => result.executed).length,
      failingGateCount: gateNames.length,
    };
    const priority = determineScenarioPriority(priorityContext);

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
      riskLevel: priority === 'P0' ? 'critical' : 'high',
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
      expectedGateShift:
        accumulator.gateNames.size > 0
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

  const securityBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && isSecurityBreak(item),
  );
  const gate = input.certification.gates.securityPass;
  const failureClass = gate.failureClass || 'product_failure';

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
      gateNames: ['securityPass'],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: rankBreakTypes(securityBreaks, 8),
      artifactPaths: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
      relatedFiles: rankFiles(securityBreaks, 12),
      validationArtifacts: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
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

  const blockingBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && !isSecurityBreak(item),
  );
  if (blockingBreaks.length === 0) {
    return [];
  }

  const gate = input.certification.gates.staticPass;
  const failureClass = gate.failureClass || 'product_failure';

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
      gateNames: ['staticPass'],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: rankBreakTypes(blockingBreaks, 10),
      artifactPaths: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
      relatedFiles: rankFiles(blockingBreaks, 15),
      validationArtifacts: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
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
  const summary = summarizeNoHardcodedRealityState(input.noHardcodedRealityState);
  if (!hasNoHardcodedRealityBlocker(summary)) {
    return [];
  }

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
      summary: compactText(formatNoHardcodedRealityBlocker(summary), 320),
      visionDelta:
        'Keeps PULSE decisions grounded in discovered evidence instead of fixed product reality lists.',
      targetState: 'PULSE_NO_HARDCODED_REALITY.json reports zero dynamic hardcode evidence events.',
      failureClass: 'checker_gap',
      actorKinds: [],
      gateNames: ['noOverclaimPass'],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['dynamic_hardcode_evidence_event'],
      artifactPaths: ['PULSE_NO_HARDCODED_REALITY.json', 'PULSE_CERTIFICATE.json'],
      relatedFiles: summary.topFiles,
      validationArtifacts: [
        'PULSE_NO_HARDCODED_REALITY.json',
        'PULSE_CONVERGENCE_PLAN.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_CERTIFICATE.json',
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

function buildScopeUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  const units: PulseConvergenceUnit[] = [];
  const scopeImpactContext = {
    missingCodacyFiles: input.scopeState.parity.missingCodacyFiles.length,
    userFacingCandidates: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length,
  };

  if (input.scopeState.parity.missingCodacyFiles.length > 0) {
    units.push({
      id: 'scope-codacy-parity',
      order: 0,
      priority: 'P1',
      kind: 'scope',
      status: 'open',
      source: 'scope',
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
      gateNames: ['scopeClosed'],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['SCOPE_PARITY_GAP'],
      artifactPaths: ['PULSE_SCOPE_STATE.json', 'PULSE_CODACY_STATE.json'],
      relatedFiles: input.scopeState.parity.missingCodacyFiles,
      validationArtifacts: [
        'PULSE_SCOPE_STATE.json',
        'PULSE_CODACY_STATE.json',
        'PULSE_CERTIFICATE.json',
      ],
      expectedGateShift: 'Pass scopeClosed',
      exitCriteria: [
        'scopeClosed returns pass in the next certification run.',
        'All observed Codacy hotspot files are covered by the repo inventory.',
      ],
    });
  }

  if (input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.length > 0) {
    units.push({
      id: 'scope-unmapped-module-candidates',
      order: 0,
      priority: 'P2',
      kind: 'scope',
      status: 'open',
      source: 'scope',
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
        `Scope-derived user-facing module candidates remain outside the resolved manifest: ${input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.join(', ')}.`,
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
      gateNames: ['truthExtractionPass'],
      scenarioIds: [],
      moduleKeys: input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates,
      routePatterns: [],
      flowIds: [],
      affectedCapabilityIds: [],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: ['SCOPE_MODULE_DRIFT'],
      artifactPaths: ['PULSE_SCOPE_STATE.json', 'PULSE_RESOLVED_MANIFEST.json'],
      relatedFiles: input.scopeState.files
        .filter(
          (file) =>
            Boolean(file.moduleCandidate) &&
            input.resolvedManifest.diagnostics.scopeOnlyModuleCandidates.includes(
              file.moduleCandidate!,
            ),
        )
        .map((file) => file.path)
        .slice(0, 20),
      validationArtifacts: [
        'PULSE_SCOPE_STATE.json',
        'PULSE_RESOLVED_MANIFEST.json',
        'PULSE_CERTIFICATE.json',
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
  return input.parityGaps.gaps
    .slice(0, 16)
    .map((gap) => ({
      id: `parity-${slugify(gap.id)}`,
      order: 0,
      priority: (gap.severity === 'critical'
        ? 'P0'
        : gap.severity === 'high'
          ? 'P1'
          : gap.severity === 'medium'
            ? 'P2'
            : 'P3') as PulseConvergenceUnitPriority,
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
      artifactPaths: ['PULSE_PARITY_GAPS.json', 'PULSE_CLI_DIRECTIVE.json'],
      relatedFiles: gap.relatedFiles,
      validationArtifacts: uniqueStrings([
        'PULSE_PARITY_GAPS.json',
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_PRODUCT_VISION.json',
      ]),
      expectedGateShift:
        gap.kind === 'front_without_back' ||
        gap.kind === 'ui_without_persistence' ||
        gap.kind === 'feature_declared_without_runtime'
          ? 'Reduce product parity drift'
          : undefined,
      exitCriteria: uniqueStrings([
        ...gap.validationTargets,
        `Gap ${gap.kind} is absent from the next PULSE_PARITY_GAPS.json snapshot.`,
      ]),
    }))
    .sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.title.localeCompare(right.title);
    });
}

function buildCodacyStaticUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.scopeState.codacy.highPriorityBatch.length === 0) {
    return [];
  }

  const inventoryByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  const grouped = new Map<
    string,
    {
      filePath: string;
      issues: typeof input.scopeState.codacy.highPriorityBatch;
      issueCount: number;
    }
  >();

  for (const issue of input.scopeState.codacy.highPriorityBatch) {
    if (!grouped.has(issue.filePath)) {
      grouped.set(issue.filePath, {
        filePath: issue.filePath,
        issues: [],
        issueCount:
          input.scopeState.codacy.topFiles.find((entry) => entry.filePath === issue.filePath)
            ?.issueCount || 0,
      });
    }
    grouped.get(issue.filePath)!.issues.push(issue);
  }

  return [...grouped.values()]
    .map((group) => {
      const file = inventoryByPath.get(group.filePath) || null;
      const categories = uniqueStrings(group.issues.map((issue) => issue.category));
      const patterns = uniqueStrings(group.issues.map((issue) => issue.patternId));
      const summaryParts = [
        `${group.issues.length} HIGH issue(s) currently prioritized by Codacy for ${group.filePath}.`,
        categories.length > 0 ? `Categories: ${categories.join(', ')}.` : '',
        patterns.length > 0 ? `Patterns: ${patterns.slice(0, 4).join(', ')}.` : '',
      ].filter(Boolean);

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
        gateNames: (categories.some((category) => category.toLowerCase().includes('security'))
          ? ['securityPass', 'staticPass']
          : ['staticPass']) as PulseGateName[],
        scenarioIds: [],
        moduleKeys: file?.moduleCandidate ? [file.moduleCandidate] : [],
        routePatterns: [],
        flowIds: [],
        affectedCapabilityIds: [],
        affectedFlowIds: [],
        asyncExpectations: [],
        breakTypes: patterns,
        artifactPaths: ['PULSE_CODACY_STATE.json', 'PULSE_SCOPE_STATE.json'],
        relatedFiles: [group.filePath],
        validationArtifacts: [
          'PULSE_CODACY_STATE.json',
          'PULSE_SCOPE_STATE.json',
          'PULSE_CERTIFICATE.json',
        ],
        expectedGateShift: categories.some((category) =>
          category.toLowerCase().includes('security'),
        )
          ? 'Reduce securityPass/staticPass pressure'
          : 'Reduce staticPass pressure',
        exitCriteria: uniqueStrings([
          `Codacy no longer reports ${group.filePath} in the current high-priority batch.`,
          file?.executionMode === 'observation_only'
            ? 'PULSE has collected enough evidence to convert this surface into a governed autonomous change or prove no mutation is needed.'
            : null,
        ]),
      };
    })
    .sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.title.localeCompare(right.title);
    })
    .slice(0, 12);
}

function summarizeGateFocus(gateName: PulseGateName, certification: PulseCertification): string[] {
  if (gateName === 'flowPass') {
    return uniqueStrings(
      certification.evidenceSummary.flows.results
        .filter((result) => result.status !== 'passed')
        .map((result) => `${result.flowId}:${result.status}`),
    );
  }

  if (gateName === 'invariantPass') {
    return uniqueStrings(
      certification.evidenceSummary.invariants.results
        .filter((result) => result.status !== 'passed')
        .map((result) => `${result.invariantId}:${result.status}`),
    );
  }

  if (gateName === 'runtimePass') {
    return uniqueStrings(
      certification.evidenceSummary.runtime.probes
        .filter((result) => result.status !== 'passed')
        .map((result) => `${result.probeId}:${result.status}`),
    );
  }

  if (gateName === 'syntheticCoveragePass') {
    return certification.evidenceSummary.syntheticCoverage.uncoveredPages.slice(0, 10);
  }

  return [];
}

function determineGateLane(
  gateName: PulseGateName,
  affectedCapabilityIds: string[],
  capabilityState: PulseCapabilityState,
): PulseConvergenceOwnerLane {
  const mappedLane = selectDominantOwnerLane(
    capabilityState.capabilities
      .filter((capability) => affectedCapabilityIds.includes(capability.id))
      .map((capability) => capability.ownerLane),
  );
  if (mappedLane !== 'platform') {
    return mappedLane;
  }
  if (gateName === 'runtimePass' || gateName === 'flowPass') {
    return 'reliability';
  }
  if (gateName === 'changeRiskPass' || gateName === 'productionDecisionPass') {
    return 'reliability';
  }
  if (
    gateName === 'invariantPass' ||
    gateName === 'recoveryPass' ||
    gateName === 'observabilityPass' ||
    gateName === 'performancePass'
  ) {
    return 'reliability';
  }
  if (gateName === 'isolationPass') {
    return 'security';
  }
  return 'platform';
}

function buildExternalUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (!input.externalSignalState) {
    return [];
  }

  return input.externalSignalState.signals
    .filter((signal) => signal.source !== 'codacy')
    .filter((signal) => signal.impactScore >= 0.5)
    .slice(0, 15)
    .map((signal) => {
      const kind = determineExternalKind(signal);
      return {
        id: `external-${slugify(`${signal.source}-${signal.id}`)}`,
        order: 0,
        priority: determineExternalPriority(signal),
        kind,
        status: signal.executionMode === 'observation_only' ? 'watch' : 'open',
        source: 'external',
        executionMode: signal.executionMode,
        ownerLane: signal.ownerLane,
        riskLevel:
          signal.impactScore >= 0.85 ? 'critical' : signal.impactScore >= 0.7 ? 'high' : 'medium',
        evidenceMode: signal.truthMode,
        confidence: confidenceFromNumeric(signal.confidence),
        productImpact: determineExternalProductImpact(signal),
        title: `Resolve ${humanize(signal.source)} ${humanize(signal.type)}`,
        summary: compactText(signal.summary, 320),
        visionDelta: buildExternalVisionDelta(signal),
        targetState: `External signal ${signal.source}/${signal.type} must clear or materially downgrade in the next Pulse snapshot.`,
        failureClass:
          signal.executionMode === 'observation_only' ? 'missing_evidence' : 'product_failure',
        actorKinds: [],
        gateNames: uniqueStrings(
          [
            kind === 'runtime' ? 'runtimePass' : null,
            signal.recentChangeRefs.length > 0 ? 'changeRiskPass' : null,
            'productionDecisionPass',
          ].filter(Boolean),
        ) as PulseGateName[],
        scenarioIds: [],
        moduleKeys: [],
        routePatterns: signal.routePatterns,
        flowIds: signal.flowIds,
        affectedCapabilityIds: signal.capabilityIds,
        affectedFlowIds: signal.flowIds,
        asyncExpectations: [],
        breakTypes: [signal.type],
        artifactPaths: ['PULSE_EXTERNAL_SIGNAL_STATE.json'],
        relatedFiles: signal.relatedFiles,
        validationArtifacts: signal.validationTargets,
        expectedGateShift:
          kind === 'runtime'
            ? 'Pass runtimePass/changeRiskPass'
            : signal.recentChangeRefs.length > 0
              ? 'Pass changeRiskPass'
              : 'Pass productionDecisionPass',
        exitCriteria: uniqueStrings([
          `Signal ${signal.source}/${signal.type} is absent or downgraded below the high-impact threshold in the next snapshot.`,
          signal.capabilityIds.length > 0
            ? `Mapped capabilities are materially addressed: ${signal.capabilityIds.join(', ')}.`
            : null,
          signal.flowIds.length > 0
            ? `Mapped flows are materially addressed: ${signal.flowIds.join(', ')}.`
            : null,
        ]),
      };
    });
}

function buildGenericGateUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  const units: PulseConvergenceUnit[] = [];

  for (const gateName of Object.keys(input.certification.gates) as PulseGateName[]) {
    const gate = input.certification.gates[gateName];
    if (gate.status !== 'fail' || EXCLUDED_GATE_UNITS.has(gateName)) {
      continue;
    }

    const focusList = summarizeGateFocus(gateName, input.certification);
    const artifactPaths = uniqueStrings([
      ...(input.certification.gateEvidence[gateName] || []).flatMap(
        (record) => record.artifactPaths,
      ),
      'PULSE_CERTIFICATE.json',
    ]);
    const failureClass = gate.failureClass || 'unknown';

    units.push({
      id: `gate-${slugify(gateName)}`,
      order: 0,
      priority: GATE_PRIORITY[gateName] || 'P3',
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
        gateName === 'runtimePass' || gateName === 'flowPass'
          ? 'critical'
          : gateName === 'securityPass' || gateName === 'isolationPass'
            ? 'critical'
            : 'medium',
      evidenceMode: gate.evidenceMode || 'observed',
      confidence: gate.confidence || 'medium',
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
      flowIds:
        gateName === 'flowPass'
          ? uniqueStrings(
              input.certification.evidenceSummary.flows.results
                .filter((result) => result.status !== 'passed')
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
  if (status === 'phantom') {
    return 'P0';
  }
  if (status === 'partial') {
    return 'P1';
  }
  if (status === 'latent') {
    return 'P2';
  }
  return 'P3';
}

function getFlowPriority(
  status: PulseFlowProjection['flows'][number]['status'],
): PulseConvergenceUnitPriority {
  if (status === 'phantom') {
    return 'P0';
  }
  if (status === 'partial') {
    return 'P1';
  }
  if (status === 'latent') {
    return 'P2';
  }
  return 'P3';
}

function buildCapabilityUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return input.capabilityState.capabilities
    .filter((capability) => capability.status !== 'real')
    .slice(0, 12)
    .map((capability) => ({
      id: `capability-${slugify(capability.id)}`,
      order: 0,
      priority: getCapabilityPriority(capability.status),
      kind: 'capability' as const,
      status: capability.executionMode === 'observation_only' ? 'watch' : 'open',
      source: 'pulse' as const,
      executionMode: capability.executionMode,
      ownerLane: capability.ownerLane,
      riskLevel:
        capability.runtimeCritical && capability.status === 'phantom'
          ? 'critical'
          : capability.highSeverityIssueCount > 0
            ? 'high'
            : 'medium',
      evidenceMode: capability.truthMode,
      confidence: confidenceFromNumeric(capability.confidence),
      productImpact:
        capability.status === 'phantom'
          ? 'transformational'
          : capability.status === 'partial'
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
      gateNames: capability.runtimeCritical ? ['truthExtractionPass'] : [],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: capability.routePatterns,
      flowIds: [],
      affectedCapabilityIds: [capability.id],
      affectedFlowIds: [],
      asyncExpectations: [],
      breakTypes: [],
      artifactPaths: ['PULSE_CAPABILITY_STATE.json', 'PULSE_PRODUCT_VISION.json'],
      relatedFiles: capability.filePaths.slice(0, 20),
      validationArtifacts: [
        'PULSE_CAPABILITY_STATE.json',
        'PULSE_PRODUCT_VISION.json',
        'PULSE_CERTIFICATE.json',
      ],
      expectedGateShift: capability.runtimeCritical
        ? 'Pass truthExtractionPass or reduce phantom capability count'
        : undefined,
      exitCriteria: capability.validationTargets,
    }));
}

function buildFlowUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  return input.flowProjection.flows
    .filter((flow) => flow.status !== 'real')
    .slice(0, 12)
    .map((flow) => {
      const relatedCapabilities = input.capabilityState.capabilities.filter((capability) =>
        flow.capabilityIds.includes(capability.id),
      );

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
        riskLevel:
          flow.status === 'phantom' ? 'critical' : flow.status === 'partial' ? 'high' : 'medium',
        evidenceMode: flow.truthMode,
        confidence: confidenceFromNumeric(flow.confidence),
        productImpact:
          flow.status === 'phantom'
            ? 'transformational'
            : flow.status === 'partial'
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
        gateNames: ['flowPass'],
        scenarioIds: [],
        moduleKeys: [],
        routePatterns: flow.routePatterns,
        flowIds: [flow.id],
        affectedCapabilityIds: flow.capabilityIds,
        affectedFlowIds: [flow.id],
        asyncExpectations: [],
        breakTypes: flow.missingLinks,
        artifactPaths: ['PULSE_FLOW_PROJECTION.json', 'PULSE_PRODUCT_VISION.json'],
        relatedFiles: relatedCapabilities
          .flatMap((capability) => capability.filePaths)
          .slice(0, 20),
        validationArtifacts: [
          'PULSE_FLOW_PROJECTION.json',
          'PULSE_PRODUCT_VISION.json',
          'PULSE_CERTIFICATE.json',
        ],
        expectedGateShift: 'Pass flowPass or reduce phantom flow count',
        exitCriteria: flow.validationTargets,
      };
    });
}

function buildExecutionMatrixUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  const matrix = input.executionMatrix;
  if (!matrix) {
    return [];
  }
  const actionable = matrix.paths
    .filter(
      (path) =>
        path.status === 'observed_fail' ||
        (path.risk === 'high' && !['observed_pass', 'observed_fail'].includes(path.status)),
    )
    .slice(0, 12);

  return actionable.map((path) => ({
    id: `matrix-${slugify(path.pathId)}`,
    order: 0,
    priority: path.status === 'observed_fail' ? 'P0' : 'P1',
    kind: path.flowId ? ('flow' as const) : ('capability' as const),
    status: path.executionMode === 'observation_only' ? 'watch' : 'open',
    source: 'pulse' as const,
    executionMode: path.executionMode,
    ownerLane: 'platform' as const,
    riskLevel: path.status === 'observed_fail' ? 'critical' : path.risk,
    evidenceMode: path.truthMode,
    confidence: confidenceFromNumeric(path.confidence),
    productImpact: path.status === 'observed_fail' ? 'transformational' : 'material',
    title:
      path.status === 'observed_fail'
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
    visionDelta:
      path.status === 'observed_fail'
        ? 'Turns an observed broken path into a precise repair target.'
        : 'Turns a critical inferred path into observed pass/fail truth.',
    targetState: 'Path is classified as observed_pass or observed_fail with a precise breakpoint.',
    failureClass: path.status === 'observed_fail' ? 'product_failure' : 'missing_evidence',
    actorKinds: [],
    gateNames:
      path.status === 'observed_fail' ? ['breakpointPrecisionPass'] : ['criticalPathObservedPass'],
    scenarioIds: [],
    moduleKeys: [],
    routePatterns: path.routePatterns,
    flowIds: path.flowId ? [path.flowId] : [],
    affectedCapabilityIds: path.capabilityId ? [path.capabilityId] : [],
    affectedFlowIds: path.flowId ? [path.flowId] : [],
    asyncExpectations: [],
    breakTypes: [],
    artifactPaths: ['PULSE_EXECUTION_MATRIX.json'],
    relatedFiles: path.filePaths.slice(0, 20),
    validationArtifacts: [
      'PULSE_EXECUTION_MATRIX.json',
      'PULSE_CLI_DIRECTIVE.json',
      'PULSE_CERTIFICATE.json',
    ],
    expectedGateShift:
      path.status === 'observed_fail'
        ? 'Pass breakpointPrecisionPass and reduce observed failing matrix paths'
        : 'Pass criticalPathObservedPass by adding observed pass/fail evidence',
    exitCriteria: [
      `Path ${path.pathId} is no longer ${path.status}.`,
      'PULSE_EXECUTION_MATRIX.json is regenerated with a concrete observed classification.',
    ],
  }));
}

/** Build convergence plan. */
export function buildConvergencePlan(input: BuildPulseConvergencePlanInput): PulseConvergencePlan {
  const queue = [
    ...buildExternalUnits(input),
    ...buildExecutionMatrixUnits(input),
    ...buildScopeUnits(input),
    ...buildParityGapUnits(input),
    ...buildCapabilityUnits(input),
    ...buildFlowUnits(input),
    ...buildScenarioUnits(input),
    ...buildSecurityUnit(input),
    ...buildGenericGateUnits(input),
    ...buildNoHardcodedRealityUnits(input),
    ...buildCodacyStaticUnits(input),
    ...buildStaticUnit(input),
  ]
    .sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const impactDelta =
        PRODUCT_IMPACT_RANK[left.productImpact] - PRODUCT_IMPACT_RANK[right.productImpact];
      if (impactDelta !== 0) {
        return impactDelta;
      }
      const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }
      return left.title.localeCompare(right.title);
    })
    .map((unit, index) => ({
      ...normalizeConvergenceUnit(unit),
      order: index + 1,
    }));

  return {
    generatedAt: input.certification.timestamp,
    commitSha: input.certification.commitSha,
    status: input.certification.status,
    humanReplacementStatus: input.certification.humanReplacementStatus,
    blockingTier: input.certification.blockingTier,
    summary: {
      totalUnits: queue.length,
      scenarioUnits: queue.filter((unit) => unit.kind === 'scenario').length,
      securityUnits: queue.filter((unit) => unit.kind === 'security').length,
      staticUnits: queue.filter((unit) => unit.kind === 'static').length,
      runtimeUnits: queue.filter((unit) => unit.kind === 'runtime').length,
      changeUnits: queue.filter((unit) => unit.kind === 'change').length,
      dependencyUnits: queue.filter((unit) => unit.kind === 'dependency').length,
      scopeUnits: queue.filter((unit) => unit.kind === 'scope').length,
      gateUnits: queue.filter((unit) => unit.kind === 'gate').length,
      humanRequiredUnits: 0,
      observationOnlyUnits: queue.filter((unit) => unit.executionMode === 'observation_only')
        .length,
      priorities: {
        P0: queue.filter((unit) => unit.priority === 'P0').length,
        P1: queue.filter((unit) => unit.priority === 'P1').length,
        P2: queue.filter((unit) => unit.priority === 'P2').length,
        P3: queue.filter((unit) => unit.priority === 'P3').length,
      },
      failingGates: (Object.keys(input.certification.gates) as PulseGateName[]).filter(
        (gateName) => input.certification.gates[gateName].status === 'fail',
      ),
      pendingAsyncExpectations:
        input.certification.evidenceSummary.worldState.asyncExpectationsStatus
          .filter((entry) => entry.status !== 'satisfied')
          .map((entry) => `${entry.scenarioId}:${entry.expectation}`)
          .sort(),
    },
    queue,
  };
}

/** Render convergence plan markdown. */
export function renderConvergencePlanMarkdown(plan: PulseConvergencePlan): string {
  const lines: string[] = [];

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
  for (const unit of plan.queue) {
    const openedBy =
      uniqueStrings([...unit.gateNames, ...unit.scenarioIds, ...unit.asyncExpectations]).join(
        ', ',
      ) || '—';
    lines.push(
      `| ${unit.order} | ${unit.priority} | ${unit.ownerLane} | ${unit.kind.toUpperCase()} | ${unit.executionMode.toUpperCase()} | ${compactText(unit.title, 80)} | ${compactText(openedBy, 120)} |`,
    );
  }
  lines.push('');

  for (const unit of plan.queue) {
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
      for (const criterion of unit.exitCriteria) {
        lines.push(`  - ${criterion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
