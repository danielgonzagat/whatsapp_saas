import type {
  PulseCapabilityState,
  PulseConvergenceOwnerLane,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseFlowProjection,
  PulseGateName,
  PulseParityGapsArtifact,
} from '../../types';
import type { BuildPulseConvergencePlanInput, ScenarioPriorityContext } from './types';
import {
  isSameState,
  isDifferentState,
  hasObservedItems,
  uniqueStrings,
  humanize,
  evidenceBatchSize,
  observedThreshold,
} from './helpers';

export function determineScenarioPriority(
  context: ScenarioPriorityContext,
): PulseConvergenceUnitPriority {
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

export function determineScenarioLane(
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

export function selectDominantOwnerLane(
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

export function confidenceFromNumeric(score: number): 'high' | 'medium' | 'low' {
  let pivot = observedThreshold([score, Number(Boolean(score))]);
  if (score > pivot) {
    return 'high';
  }
  if (Boolean(score)) {
    return 'medium';
  }
  return 'low';
}

export function confidenceFromTruthMode(
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

export function determineScenarioProductImpact(
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

export function determineScopeProductImpact(context: {
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

export function determineParityProductImpact(
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

export function determineGateProductImpact(
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

export function buildScenarioVisionDelta(
  scenarioId: string,
  context: ScenarioPriorityContext,
): string {
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
  return 'Reduces structural drift that keeps the projected product shape ahead of the real implementation.';
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

export function determineExternalPriority(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnitPriority {
  if (
    signal.impactScore > impactThreshold &&
    hasObservedItems([...signal.capabilityIds, ...signal.flowIds])
  ) {
    return 'P0';
  }
  if (signal.impactScore > impactThreshold) {
    return 'P1';
  }
  if (hasObservedItems([...signal.relatedFiles, ...signal.routePatterns])) {
    return 'P2';
  }
  return 'P3';
}

export function determineExternalProductImpact(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnit['productImpact'] {
  if (hasObservedItems([...signal.capabilityIds, ...signal.flowIds])) {
    return signal.impactScore > impactThreshold ? 'transformational' : 'material';
  }
  if (signal.source === 'dependabot') {
    return 'enabling';
  }
  return 'diagnostic';
}

export function determineExternalRiskLevel(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  severityThreshold: number,
): PulseConvergenceUnit['riskLevel'] {
  if (signal.severity > severityThreshold && signal.impactScore > severityThreshold) {
    return 'critical';
  }
  if (signal.severity > severityThreshold || signal.impactScore > severityThreshold) {
    return 'high';
  }
  return hasObservedItems([...signal.relatedFiles, ...signal.routePatterns]) ? 'medium' : 'low';
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
