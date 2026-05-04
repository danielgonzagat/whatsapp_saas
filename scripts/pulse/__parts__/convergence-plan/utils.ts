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
  PulseParityGapsArtifact,
  PulseScenarioResult,
  PulseWorldState,
} from '../../types';
import {
  OBSERVED_ARTIFACTS,
  OBSERVED_GATES,
  CAPABILITY_STATUSES,
  EXTERNAL_SIGNAL_SOURCES,
  FAILURE_CLASSES,
  FLOW_STATUSES,
  PARITY_GAP_KINDS,
  PARITY_GAP_SEVERITIES,
  TRUTH_MODES,
  UNIT_CONFIDENCES,
  UNIT_EXECUTION_MODES,
  UNIT_KINDS,
  UNIT_OWNER_LANES,
  UNIT_PRIORITIES,
  UNIT_PRODUCT_IMPACTS,
  UNIT_RISK_LEVELS,
  UNIT_STATUSES,
} from './kernel';
import type {
  BuildPulseConvergencePlanInput,
  ScenarioPriorityContext,
} from './kernel';
import { CHECKER_GAP_TYPES, SECURITY_BREAK_TYPE_KERNEL_GRAMMAR } from '../../cert-constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from '../../finding-identity';
import {
  discoverGateLaneFromObservedStructure,
  derivePriorityFromObservedContext,
  deriveProductImpactFromObservedScope,
  deriveUnitValue,
} from '../../dynamic-reality-kernel';

export function evidenceBatchSize(...collections: Array<{ length: number } | null | undefined>): number {
  let observedSize = collections.reduce((largest, collection) => {
    let currentSize = collection?.length ?? Number();
    return currentSize > largest ? currentSize : largest;
  }, Number());
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, observedSize))));
}

export function takeEvidenceBatch<T>(values: T[], ...context: Array<{ length: number }>): T[] {
  return values.slice(0, evidenceBatchSize(values, ...context));
}

export function observedThreshold(values: number[]): number {
  let observedValues = values.filter((value) => Number.isFinite(value));
  if (!hasObservedItems(observedValues)) {
    return Number();
  }
  return observedValues.reduce((sum, value) => sum + value, Number()) / observedValues.length;
}

export function hasObservedItems(value: { length: number } | { size: number }): boolean {
  return 'length' in value ? Boolean(value.length) : Boolean(value.size);
}

export function lacksObservedItems(value: { length: number } | { size: number }): boolean {
  return !hasObservedItems(value);
}

export function isSameState<T extends string>(value: T, expected: T): boolean {
  return value === expected;
}

export function isDifferentState<T extends string>(value: T, expected: T): boolean {
  return value !== expected;
}

export function countUnitEvidence(unit: PulseConvergenceUnit): number {
  return [
    unit.gateNames,
    unit.scenarioIds,
    unit.routePatterns,
    unit.flowIds,
    unit.affectedCapabilityIds,
    unit.affectedFlowIds,
    unit.asyncExpectations,
    unit.breakTypes,
    unit.artifactPaths,
    unit.relatedFiles,
    unit.validationArtifacts,
    unit.exitCriteria,
  ].reduce((total, values) => total + values.length, 0);
}

export function unitPressure(unit: PulseConvergenceUnit): number {
  let openStatus = [...UNIT_STATUSES].find((s) => s.includes('open'))!;
  let observedMode = [...TRUTH_MODES].find((t) => t.includes('observed'))!;
  let productFailureClass = [...FAILURE_CLASSES].find((fc) => fc.includes('product_failure'))!;
  let mixedClass = [...FAILURE_CLASSES].find((fc) => fc.includes('mixed'))!;
  let criticalLevel = [...UNIT_RISK_LEVELS].find((r) => r.includes('critical'))!;
  let transformationalImpact = [...UNIT_PRODUCT_IMPACTS].find((i) =>
    i.includes('transformational'),
  )!;
  let observationOnlyMode = [...UNIT_EXECUTION_MODES].find((m) => m.includes('observation_only'))!;
  let pressure = countUnitEvidence(unit);
  if (unit.status === openStatus) {
    pressure += unit.exitCriteria.length || 1;
  }
  if (unit.evidenceMode === observedMode) {
    pressure += unit.artifactPaths.length || 1;
  }
  if (unit.failureClass === productFailureClass || unit.failureClass === mixedClass) {
    pressure += unit.validationArtifacts.length || 1;
  }
  if (unit.riskLevel === criticalLevel) {
    pressure += unit.relatedFiles.length || unit.breakTypes.length || 1;
  }
  if (unit.productImpact === transformationalImpact) {
    pressure += unit.affectedCapabilityIds.length + unit.affectedFlowIds.length + 1;
  }
  if (unit.executionMode === observationOnlyMode) {
    pressure -= unit.artifactPaths.length || 1;
  }
  return pressure;
}

export function compareByObservedPressure(
  left: PulseConvergenceUnit,
  right: PulseConvergenceUnit,
): number {
  let pressureDelta = unitPressure(right) - unitPressure(left);
  if (pressureDelta !== 0) {
    return pressureDelta;
  }
  let confidenceDelta = countUnitEvidence(right) - countUnitEvidence(left);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return left.title.localeCompare(right.title);
}

export function applyDerivedPriorities(units: PulseConvergenceUnit[]): PulseConvergenceUnit[] {
  let labels = uniqueStrings(units.map((unit) => unit.priority)) as PulseConvergenceUnitPriority[];
  let batchSize = evidenceBatchSize(units, labels);
  return units.map((unit, index) => {
    let labelIndex = Math.min(labels.length - 1, Math.floor(index / batchSize));
    return {
      ...unit,
      priority: labels[labelIndex] ?? unit.priority,
    };
  });
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

export function compactText(value: string, max?: number): string {
  let maxLength = max ?? Math.max(Number(Boolean(value)), value.length);
  let compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - Math.min(maxLength, 3))}...`;
}

export function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/g)
    .filter(Boolean);
}

export function slugify(value: string): string {
  return splitWords(value)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function humanize(value: string): string {
  return splitWords(value)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

export function isBlockingBreak(item: Break): boolean {
  return (
    (item.severity === 'critical' || item.severity === 'high') &&
    !CHECKER_GAP_TYPES.has(item.type) &&
    isBlockingDynamicFinding(item)
  );
}

export function isSecurityBreak(item: Break): boolean {
  return SECURITY_BREAK_TYPE_KERNEL_GRAMMAR.some((pattern) => pattern.test(item.type));
}

export function rankBreakTypes(breaks: Break[], limit?: number): string[] {
  return summarizeDynamicFindingEvents(breaks, limit ?? evidenceBatchSize(breaks));
}

export function rankFiles(breaks: Break[], limit?: number): string[] {
  let resolvedLimit = limit ?? evidenceBatchSize(breaks);
  let counts = new Map<string, number>();
  for (let item of breaks) {
    counts.set(item.file, (counts.get(item.file) ?? Number()) + Number(Boolean(item.file)));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, resolvedLimit)
    .map(([file, count]) => (count > Number(Boolean(file)) ? `${file} (${count})` : file));
}

export function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function buildSearchTerms(
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): string[] {
  let routeTerms = routePatterns.flatMap((route) => route.split('/').filter(Boolean));
  let flowTerms = flowIds.flatMap((flowId) => splitWords(flowId));
  let scenarioTerms = splitWords(scenarioId);

  let minTermLength = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  return uniqueStrings([...moduleKeys, ...routeTerms, ...flowTerms, ...scenarioTerms]).filter(
    (term) => normalizeSearchToken(term).length >= minTermLength,
  );
}

export function findRelatedBreaks(
  breaks: Break[],
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): Break[] {
  let terms = buildSearchTerms(scenarioId, moduleKeys, routePatterns, flowIds);
  if (terms.length === 0) {
    return [];
  }

  return breaks.filter((item) => {
    let haystack = normalizeSearchToken(
      [item.file, item.description, item.detail, item.source || '', item.surface || ''].join(' '),
    );

    return terms.some((term) => haystack.includes(normalizeSearchToken(term)));
  });
}

export function determineFailureClass(
  classes: Array<PulseGateFailureClass | undefined>,
  hasPendingAsync: boolean,
): PulseConvergenceUnit['failureClass'] {
  let uniqueClasses = uniqueStrings(classes);
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

export function deriveWatchFailureClasses(): Set<string> {
  return new Set([
    ...CHECKER_GAP_TYPES,
    ...[...FAILURE_CLASSES].find((fc) => fc.includes('missing'))!,
  ]);
}

export function determineUnitStatus(
  failureClass: PulseConvergenceUnit['failureClass'],
): PulseConvergenceUnitStatus {
  return deriveWatchFailureClasses().has(failureClass)
    ? [...UNIT_STATUSES].find((s) => s.includes('watch'))!
    : [...UNIT_STATUSES].find((s) => s.includes('open'))!;
}

export function normalizeFailureClass(
  failureClass: PulseGateFailureClass | null | undefined,
): PulseConvergenceUnit['failureClass'] {
  return failureClass ?? 'unknown';
}

export function normalizeOptionalState<T extends string>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

export function countUnitState<T extends string>(
  units: PulseConvergenceUnit[],
  select: (unit: PulseConvergenceUnit) => T,
  expected: T,
): number {
  return units.filter((unit) => isSameState(select(unit), expected)).length;
}

export function normalizeConvergenceExecutionMode(
  mode: PulseConvergenceUnit['executionMode'],
): PulseConvergenceUnit['executionMode'] {
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'observation_only';
  }
  return 'ai_safe';
}

export function normalizeConvergenceUnit(unit: PulseConvergenceUnit): PulseConvergenceUnit {
  let executionMode = normalizeConvergenceExecutionMode(unit.executionMode);
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

export function determineScenarioPriority(context: ScenarioPriorityContext): PulseConvergenceUnitPriority {
  let isBlocker =
    context.critical &&
    (context.hasObservedFailure ||
      context.hasPendingAsync ||
      context.requiresBrowser ||
      context.requiresPersistence);
  if (isBlocker) {
    return derivePriorityFromObservedContext('critical', true, context.critical);
  }
  if (context.critical || context.failingGateCount > Number(Boolean(context.critical))) {
    return derivePriorityFromObservedContext('high', false, context.critical);
  }
  if (!Boolean(context.executedEvidenceCount)) {
    return derivePriorityFromObservedContext('medium', false, false);
  }
  return derivePriorityFromObservedContext('low', false, false);
}

export function determineScenarioLane(
  context: ScenarioPriorityContext,
  gateNames: PulseGateName[],
  affectedCapabilityLanes: PulseConvergenceOwnerLane[],
): PulseConvergenceOwnerLane {
  let mappedLane = selectDominantOwnerLane(affectedCapabilityLanes);
  if (mappedLane !== 'platform') {
    return mappedLane;
  }
  for (let gateName of gateNames) {
    let derivedLane = discoverGateLaneFromObservedStructure(gateName);
    if (derivedLane !== 'platform') {
      return derivedLane;
    }
  }
  if (context.hasPendingAsync || context.requiresBrowser) {
    return 'reliability';
  }
  return 'platform';
}

export function selectDominantOwnerLane(
  lanes: Array<PulseConvergenceOwnerLane | null | undefined>,
): PulseConvergenceOwnerLane {
  let available = lanes.filter((lane): lane is PulseConvergenceOwnerLane => Boolean(lane));
  let dominanceOrder = [...UNIT_OWNER_LANES].filter(
    (l) => l !== [...UNIT_OWNER_LANES].find((ll) => ll.includes('platform'))!,
  );
  for (let preferred of dominanceOrder) {
    if (available.includes(preferred)) return preferred;
  }
  return [...UNIT_OWNER_LANES].find((l) => l.includes('platform'))!;
}

export function confidenceFromNumeric(score: number): 'high' | 'medium' | 'low' {
  let pivot = observedThreshold([score, Number(Boolean(score))]);
  let confLabels = [...UNIT_CONFIDENCES];
  let highLabel = confLabels.find((l) => l.includes('high'))!;
  let mediumLabel = confLabels.find((l) => l.includes('medium'))!;
  let lowLabel = confLabels.find((l) => l.includes('low'))!;
  if (score > pivot) return highLabel;
  if (Boolean(score)) return mediumLabel;
  return lowLabel;
}

export function confidenceFromTruthMode(
  truthMode: 'observed' | 'inferred' | 'aspirational',
): 'high' | 'medium' | 'low' {
  let truthObserved = [...TRUTH_MODES].find((t) => t.includes('observed'))!;
  let truthInferred = [...TRUTH_MODES].find((t) => t.includes('inferred'))!;
  let confLabels = [...UNIT_CONFIDENCES];
  let highLabel = confLabels.find((l) => l.includes('high'))!;
  let mediumLabel = confLabels.find((l) => l.includes('medium'))!;
  let lowLabel = confLabels.find((l) => l.includes('low'))!;
  if (isSameState(truthMode, truthObserved)) return highLabel;
  if (isSameState(truthMode, truthInferred)) return mediumLabel;
  return lowLabel;
}

export function determineScenarioProductImpact(
  context: ScenarioPriorityContext,
): PulseConvergenceUnit['productImpact'] {
  if (context.critical && (context.hasObservedFailure || context.hasPendingAsync)) {
    return deriveProductImpactFromObservedScope('critical', true);
  }
  if (context.critical || context.requiresPersistence || context.requiresBrowser) {
    return deriveProductImpactFromObservedScope('high', true);
  }
  return deriveProductImpactFromObservedScope('partial', false);
}

export function determineScopeProductImpact(context: {
  missingCodacyFiles: number;
  userFacingCandidates: number;
}): PulseConvergenceUnit['productImpact'] {
  let materialImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('material'))!;
  let enablingImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('enabling'))!;
  if (Boolean(context.missingCodacyFiles)) return materialImpact;
  return enablingImpact;
}

export function determineParityProductImpact(
  gapKind: PulseParityGapsArtifact['gaps'][number]['kind'],
): PulseConvergenceUnit['productImpact'] {
  let transformationalImpact = [...UNIT_PRODUCT_IMPACTS].find((i) =>
    i.includes('transformational'),
  )!;
  let materialImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('material'))!;
  let enablingImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('enabling'))!;
  let frontWithoutBack = [...PARITY_GAP_KINDS].find((k) => k.includes('front_without_back'))!;
  let uiWithoutPersistence = [...PARITY_GAP_KINDS].find((k) =>
    k.includes('ui_without_persistence'),
  )!;
  let featureDeclared = [...PARITY_GAP_KINDS].find((k) =>
    k.includes('feature_declared_without_runtime'),
  )!;
  let backWithoutFront = [...PARITY_GAP_KINDS].find((k) => k.includes('back_without_front'))!;
  let flowWithoutValidation = [...PARITY_GAP_KINDS].find((k) =>
    k.includes('flow_without_validation'),
  )!;
  if (
    isSameState(gapKind, frontWithoutBack) ||
    isSameState(gapKind, uiWithoutPersistence) ||
    isSameState(gapKind, featureDeclared)
  ) {
    return transformationalImpact;
  }
  if (isSameState(gapKind, backWithoutFront) || isSameState(gapKind, flowWithoutValidation)) {
    return materialImpact;
  }
  return enablingImpact;
}

export function determineGateProductImpact(
  gateName: PulseGateName,
): PulseConvergenceUnit['productImpact'] {
  let structuralLane = discoverGateLaneFromObservedStructure(gateName);
  let enablingImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('enabling'))!;
  let materialImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('material'))!;
  let diagnosticImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('diagnostic'))!;
  if (structuralLane === 'reliability') return enablingImpact;
  if (structuralLane === 'security') return enablingImpact;
  if (
    gateName === OBSERVED_GATES.find((g) => g.includes('runtime')) ||
    gateName === OBSERVED_GATES.find((g) => g.includes('flow')) ||
    gateName === OBSERVED_GATES.find((g) => g.includes('change')) ||
    gateName === OBSERVED_GATES.find((g) => g.includes('production'))
  ) {
    return materialImpact;
  }
  return diagnosticImpact;
}

export function buildScenarioVisionDelta(scenarioId: string, context: ScenarioPriorityContext): string {
  if (context.hasObservedFailure) {
    return `Turns the observed failure in ${humanize(scenarioId)} into an executed repair target with fresh proof.`;
  }
  if (context.hasPendingAsync) {
    return `Closes pending asynchronous evidence for ${humanize(scenarioId)} so convergence is based on settled world-state proof.`;
  }
  return `Improves executed evidence for ${humanize(scenarioId)} and reduces uncertainty in the runtime product state.`;
}

export function buildScopeVisionDelta(context: {
  missingCodacyFiles: number;
  userFacingCandidates: number;
}): string {
  if (Boolean(context.missingCodacyFiles)) {
    return 'Closes scope drift between what Codacy is flagging and what PULSE can actually inventory and classify.';
  }
  return 'Reduces structural ambiguity so later capability, flow, and product vision inference stop depending on unclassified surfaces.';
}

export function buildParityVisionDelta(gap: PulseParityGapsArtifact['gaps'][number]): string {
  if (
    isSameState(gap.kind, 'front_without_back') ||
    isSameState(gap.kind, 'ui_without_persistence')
  ) {
    return `Converts a user-facing illusion into a real product chain for ${gap.routePatterns[0] || gap.title}.`;
  }
  if (isSameState(gap.kind, 'feature_declared_without_runtime')) {
    return `Aligns declared product promise with live runtime reality for ${gap.title}.`;
  }
  if (isSameState(gap.kind, 'flow_without_validation')) {
    return `Adds missing proof that ${gap.title} can complete without silent failure.`;
  }
  return `Reduces structural drift that keeps the projected product shape ahead of the real implementation.`;
}

export function buildCapabilityVisionDelta(
  capability: PulseCapabilityState['capabilities'][number],
): string {
  return `Moves capability ${capability.name} from ${capability.status} toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.`;
}

export function buildFlowVisionDelta(flow: PulseFlowProjection['flows'][number]): string {
  return `Moves flow ${humanize(flow.id)} from ${flow.status} toward a complete interface-to-effect path instead of a partial or projected experience.`;
}

export function buildGateVisionDelta(gateName: PulseGateName): string {
  if (isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')) {
    return `Turns ${humanize(gateName)} from a certification blocker into live executed evidence for the affected runtime behavior.`;
  }
  if (isSameState(gateName, 'isolationPass') || isSameState(gateName, 'securityPass')) {
    return `Protects the target product shape by removing blocking safety gaps before production convergence.`;
  }
  return `Improves trust in the reconstructed product state by clearing ${humanize(gateName)} as a blocking evidence layer.`;
}

export function buildCodacyVisionDelta(filePath: string): string {
  return `Shrinks static debt in ${filePath} so capability and flow work can converge without recurring structural regressions.`;
}

export function determineExternalKind(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
): PulseConvergenceUnit['kind'] {
  let dependencyKind = [...UNIT_KINDS].find((k) => k.includes('dependency'))!;
  let runtimeKind = [...UNIT_KINDS].find((k) => k.includes('runtime'))!;
  let changeKind = [...UNIT_KINDS].find((k) => k.includes('change'))!;
  let dependabotSource = [...EXTERNAL_SIGNAL_SOURCES].find((s) => s.includes('dependabot'));
  let sentrySource = [...EXTERNAL_SIGNAL_SOURCES].find((s) => s.includes('sentry'));
  let datadogSource = [...EXTERNAL_SIGNAL_SOURCES].find((s) => s.includes('datadog'));
  let prometheusSource = [...EXTERNAL_SIGNAL_SOURCES].find((s) => s.includes('prometheus'));
  if (signal.source === dependabotSource || /dependency|vuln|supply/i.test(signal.type)) {
    return dependencyKind;
  }
  if (
    signal.source === sentrySource ||
    signal.source === datadogSource ||
    signal.source === prometheusSource ||
    /runtime|latency|error|incident|timeout/i.test(signal.type)
  ) {
    return runtimeKind;
  }
  return changeKind;
}

export function determineExternalPriority(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnitPriority {
  let p0 = [...UNIT_PRIORITIES].find((p) => p.includes('P0'))!;
  let p1 = [...UNIT_PRIORITIES].find((p) => p.includes('P1'))!;
  let p2 = [...UNIT_PRIORITIES].find((p) => p.includes('P2'))!;
  let p3 = [...UNIT_PRIORITIES].find((p) => p.includes('P3'))!;
  if (
    signal.impactScore > impactThreshold &&
    hasObservedItems([...signal.capabilityIds, ...signal.flowIds])
  )
    return p0;
  if (signal.impactScore > impactThreshold) return p1;
  if (hasObservedItems([...signal.relatedFiles, ...signal.routePatterns])) return p2;
  return p3;
}

export function determineExternalProductImpact(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnit['productImpact'] {
  let transformationalImpact = [...UNIT_PRODUCT_IMPACTS].find((i) =>
    i.includes('transformational'),
  )!;
  let materialImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('material'))!;
  let enablingImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('enabling'))!;
  let diagnosticImpact = [...UNIT_PRODUCT_IMPACTS].find((i) => i.includes('diagnostic'))!;
  if (hasObservedItems([...signal.capabilityIds, ...signal.flowIds])) {
    return signal.impactScore > impactThreshold ? transformationalImpact : materialImpact;
  }
  let dependabotSource = [...EXTERNAL_SIGNAL_SOURCES].find((s) => s.includes('dependabot'));
  if (signal.source === dependabotSource) return enablingImpact;
  return diagnosticImpact;
}

export function determineExternalRiskLevel(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  severityThreshold: number,
): PulseConvergenceUnit['riskLevel'] {
  let criticalLevel = [...UNIT_RISK_LEVELS].find((r) => r.includes('critical'))!;
  let highLevel = [...UNIT_RISK_LEVELS].find((r) => r.includes('high'))!;
  let mediumLevel = [...UNIT_RISK_LEVELS].find((r) => r.includes('medium'))!;
  let lowLevel = [...UNIT_RISK_LEVELS].find((r) => r.includes('low'))!;
  if (signal.severity > severityThreshold && signal.impactScore > severityThreshold)
    return criticalLevel;
  if (signal.severity > severityThreshold || signal.impactScore > severityThreshold)
    return highLevel;
  return hasObservedItems([...signal.relatedFiles, ...signal.routePatterns])
    ? mediumLevel
    : lowLevel;
}

export function buildExternalVisionDelta(
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

export function summarizeScenario(
  results: PulseScenarioResult[],
  asyncEntries: PulseWorldState['asyncExpectationsStatus'],
): string {
  let resultSummary = uniqueStrings(
    results
      .filter((result) => result.status !== 'passed')
      .map((result) => compactText(result.summary, 180)),
  ).slice(0, 2);

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

export function gateEvidenceEntries(
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>,
): Array<[PulseGateName, PulseEvidenceRecord[]]> {
  return (Object.keys(gateEvidence) as PulseGateName[]).map((gateName) => [
    gateName,
    gateEvidence[gateName] || [],
  ]);
}

export function gateEntries(
  certification: PulseCertification,
): Array<[PulseGateName, PulseCertification['gates'][PulseGateName]]> {
  return Object.entries(certification.gates) as Array<
    [PulseGateName, PulseCertification['gates'][PulseGateName]]
  >;
}

export function gateNamesForResult(
  certification: PulseCertification,
  target: PulseCertification['gates'][PulseGateName],
): PulseGateName[] {
  return gateEntries(certification)
    .filter(([, result]) => result === target)
    .map(([gateName]) => gateName);
}

export function relatedFailedGateNames(
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

export function failedGateNamesForCapability(
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

export function failedGateNamesForFlow(
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

export function evidenceMetricMatches(
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

export function buildValidationArtifacts(
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
