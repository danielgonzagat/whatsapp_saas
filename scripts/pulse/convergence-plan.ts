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
import { CHECKER_GAP_TYPES, SECURITY_BREAK_TYPE_KERNEL_GRAMMAR } from './cert-constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from './finding-identity';
import {
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
  type PulseNoHardcodedRealityState,
} from './no-hardcoded-reality-state';
import {
  discoverAllObservedArtifactFilenames,
  discoverAllObservedGateNames,
  discoverGateLaneFromObservedStructure,
  derivePriorityFromObservedContext,
  discoverSourceLabelFromObservedContext,
  deriveUnitIdFromObservedKind,
} from './dynamic-reality-kernel';

let OBSERVED_ARTIFACTS = discoverAllObservedArtifactFilenames();
let OBSERVED_GATES = discoverAllObservedGateNames();

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

function evidenceBatchSize(...collections: Array<{ length: number } | null | undefined>): number {
  let observedSize = collections.reduce((largest, collection) => {
    let currentSize = collection?.length ?? Number();
    return currentSize > largest ? currentSize : largest;
  }, Number());
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, observedSize))));
}

function takeEvidenceBatch<T>(values: T[], ...context: Array<{ length: number }>): T[] {
  return values.slice(0, evidenceBatchSize(values, ...context));
}

function observedThreshold(values: number[]): number {
  let observedValues = values.filter((value) => Number.isFinite(value));
  if (!hasObservedItems(observedValues)) {
    return Number();
  }
  return observedValues.reduce((sum, value) => sum + value, Number()) / observedValues.length;
}

function hasObservedItems(value: { length: number } | { size: number }): boolean {
  return 'length' in value ? Boolean(value.length) : Boolean(value.size);
}

function lacksObservedItems(value: { length: number } | { size: number }): boolean {
  return !hasObservedItems(value);
}

function isSameState<T extends string>(value: T, expected: T): boolean {
  return value === expected;
}

function isDifferentState<T extends string>(value: T, expected: T): boolean {
  return value !== expected;
}

function countUnitEvidence(unit: PulseConvergenceUnit): number {
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

function unitPressure(unit: PulseConvergenceUnit): number {
  let pressure = countUnitEvidence(unit);
  if (unit.status === 'open') {
    pressure += unit.exitCriteria.length || 1;
  }
  if (unit.evidenceMode === 'observed') {
    pressure += unit.artifactPaths.length || 1;
  }
  if (unit.failureClass === 'product_failure' || unit.failureClass === 'mixed') {
    pressure += unit.validationArtifacts.length || 1;
  }
  if (unit.riskLevel === 'critical') {
    pressure += unit.relatedFiles.length || unit.breakTypes.length || 1;
  }
  if (unit.productImpact === 'transformational') {
    pressure += unit.affectedCapabilityIds.length + unit.affectedFlowIds.length + 1;
  }
  if (unit.executionMode === 'observation_only') {
    pressure -= unit.artifactPaths.length || 1;
  }
  return pressure;
}

function compareByObservedPressure(
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

function applyDerivedPriorities(units: PulseConvergenceUnit[]): PulseConvergenceUnit[] {
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

function compactText(value: string, max?: number): string {
  let maxLength = max ?? Math.max(Number(Boolean(value)), value.length);
  let compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - Math.min(maxLength, 3))}...`;
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
  return SECURITY_BREAK_TYPE_KERNEL_GRAMMAR.some((pattern) => pattern.test(item.type));
}

function rankBreakTypes(breaks: Break[], limit?: number): string[] {
  return summarizeDynamicFindingEvents(breaks, limit ?? evidenceBatchSize(breaks));
}

function rankFiles(breaks: Break[], limit?: number): string[] {
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

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildSearchTerms(
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): string[] {
  let routeTerms = routePatterns.flatMap((route) => route.split('/').filter(Boolean));
  let flowTerms = flowIds.flatMap((flowId) => splitWords(flowId));
  let scenarioTerms = splitWords(scenarioId);

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

function determineFailureClass(
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

function determineUnitStatus(
  failureClass: PulseConvergenceUnit['failureClass'],
): PulseConvergenceUnitStatus {
  return failureClass === 'missing_evidence' || failureClass === 'checker_gap' ? 'watch' : 'open';
}

function normalizeFailureClass(
  failureClass: PulseGateFailureClass | null | undefined,
): PulseConvergenceUnit['failureClass'] {
  return failureClass ?? 'unknown';
}

function normalizeOptionalState<T extends string>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function countUnitState<T extends string>(
  units: PulseConvergenceUnit[],
  select: (unit: PulseConvergenceUnit) => T,
  expected: T,
): number {
  return units.filter((unit) => isSameState(select(unit), expected)).length;
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
  if (context.critical || context.failingGateCount > Number(Boolean(context.critical))) {
    return 'P1';
  }
  if (!Boolean(context.executedEvidenceCount)) {
    return 'P2';
  }
  return 'P3';
}

function determineScenarioLane(
  context: ScenarioPriorityContext,
  gateNames: PulseGateName[],
  affectedCapabilityLanes: PulseConvergenceOwnerLane[],
): PulseConvergenceOwnerLane {
  let mappedLane = selectDominantOwnerLane(affectedCapabilityLanes);
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
  let available = lanes.filter((lane): lane is PulseConvergenceOwnerLane => Boolean(lane));
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
  let pivot = observedThreshold([score, Number(Boolean(score))]);
  if (score > pivot) {
    return 'high';
  }
  if (Boolean(score)) {
    return 'medium';
  }
  return 'low';
}

function confidenceFromTruthMode(
  truthMode: 'observed' | 'inferred' | 'aspirational',
): 'high' | 'medium' | 'low' {
  if (isSameState(truthMode, 'observed')) {
    return 'high';
  }
  if (isSameState(truthMode, 'inferred')) {
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
  if (Boolean(context.missingCodacyFiles)) {
    return 'material';
  }
  if (Boolean(context.userFacingCandidates)) {
    return 'enabling';
  }
  return 'enabling';
}

function determineParityProductImpact(
  gapKind: PulseParityGapsArtifact['gaps'][number]['kind'],
): PulseConvergenceUnit['productImpact'] {
  if (
    isSameState(gapKind, 'front_without_back') ||
    isSameState(gapKind, 'ui_without_persistence') ||
    isSameState(gapKind, 'feature_declared_without_runtime')
  ) {
    return 'transformational';
  }
  if (
    isSameState(gapKind, 'back_without_front') ||
    isSameState(gapKind, 'flow_without_validation')
  ) {
    return 'material';
  }
  return 'enabling';
}

function determineGateProductImpact(
  gateName: PulseGateName,
): PulseConvergenceUnit['productImpact'] {
  if (
    isSameState(gateName, 'runtimePass') ||
    isSameState(gateName, 'flowPass') ||
    isSameState(gateName, 'changeRiskPass') ||
    isSameState(gateName, 'productionDecisionPass')
  ) {
    return 'material';
  }
  if (
    isSameState(gateName, 'invariantPass') ||
    isSameState(gateName, 'recoveryPass') ||
    isSameState(gateName, 'observabilityPass') ||
    isSameState(gateName, 'performancePass') ||
    isSameState(gateName, 'isolationPass')
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
  if (Boolean(context.missingCodacyFiles)) {
    return 'Closes scope drift between what Codacy is flagging and what PULSE can actually inventory and classify.';
  }
  return 'Reduces structural ambiguity so later capability, flow, and product vision inference stop depending on unclassified surfaces.';
}

function buildParityVisionDelta(gap: PulseParityGapsArtifact['gaps'][number]): string {
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

function buildCapabilityVisionDelta(
  capability: PulseCapabilityState['capabilities'][number],
): string {
  return `Moves capability ${capability.name} from ${capability.status} toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.`;
}

function buildFlowVisionDelta(flow: PulseFlowProjection['flows'][number]): string {
  return `Moves flow ${humanize(flow.id)} from ${flow.status} toward a complete interface-to-effect path instead of a partial or projected experience.`;
}

function buildGateVisionDelta(gateName: PulseGateName): string {
  if (isSameState(gateName, 'runtimePass') || isSameState(gateName, 'flowPass')) {
    return `Turns ${humanize(gateName)} from a certification blocker into live executed evidence for the affected runtime behavior.`;
  }
  if (isSameState(gateName, 'isolationPass') || isSameState(gateName, 'securityPass')) {
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
