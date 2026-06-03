import type { PulseGateName } from '../types.manifest';
import type { PulseCapabilityState } from '../types.capabilities/03-capability';
import type { PulseParityGapsArtifact } from '../types.capabilities.parity';
import type { PulseFlowProjection } from '../types.capabilities/04-flow-projection';
import type { PulseCertification } from '../types.evidence';
import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseEvidenceRecord,
} from '../types.convergence';
import type { PulseWorldState } from '../types.evidence';
import type { PulseScenarioResult } from '../types.scenario-result';

import {
  OBSERVED_ARTIFACTS,
  OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS,
} from './kernel';
import {
  deriveObservedConvergenceEvidenceLabel,
} from './builder-labels';
import type { BuildPulseConvergencePlanInput, ScenarioPriorityContext } from './kernel';

import {
  observedP0Priority,
  observedP1Priority,
  observedP2Priority,
  observedP3Priority,
  observedCriticalRisk,
  observedHighRisk,
  observedMediumRisk,
  observedLowRisk,
  observedTransformationalImpact,
  observedMaterialImpact,
  observedEnablingImpact,
  observedDiagnosticImpact,
  observedRuntimeKind,
  observedChangeKind,
  observedDependencyKind,
} from './builder-labels';
import {
  hasObservedItems,
  lacksObservedItems,
  isSameState,
  isDifferentState,
  uniqueStrings,
  humanize,
  splitWords,
  compactText,
  normalizeSearchToken,
} from './utils-core';

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
  let dependabotSource = deriveObservedConvergenceEvidenceLabel<string>(OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS, 'dependabot');
  let sentrySource = deriveObservedConvergenceEvidenceLabel<string>(OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS, 'sentry');
  let datadogSource = deriveObservedConvergenceEvidenceLabel<string>(OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS, 'datadog');
  let prometheusSource = deriveObservedConvergenceEvidenceLabel<string>(OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS, 'prometheus');
  if (signal.source === dependabotSource || /dependency|vuln|supply/i.test(signal.type)) {
    return observedDependencyKind;
  }
  if (
    signal.source === sentrySource ||
    signal.source === datadogSource ||
    signal.source === prometheusSource ||
    /runtime|latency|error|incident|timeout/i.test(signal.type)
  ) {
    return observedRuntimeKind;
  }
  return observedChangeKind;
}

export function determineExternalPriority(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnitPriority {
  if (
    signal.impactScore > impactThreshold &&
    hasObservedItems([...signal.capabilityIds, ...signal.flowIds])
  )
    return observedP0Priority;
  if (signal.impactScore > impactThreshold) return observedP1Priority;
  if (hasObservedItems([...signal.relatedFiles, ...signal.routePatterns])) return observedP2Priority;
  return observedP3Priority;
}

export function determineExternalProductImpact(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  impactThreshold: number,
): PulseConvergenceUnit['productImpact'] {
  if (hasObservedItems([...signal.capabilityIds, ...signal.flowIds])) {
    return signal.impactScore > impactThreshold
      ? observedTransformationalImpact
      : observedMaterialImpact;
  }
  let dependabotSource = deriveObservedConvergenceEvidenceLabel<string>(OBSERVED_EXTERNAL_SIGNAL_SOURCE_LABELS, 'dependabot');
  if (signal.source === dependabotSource) return observedEnablingImpact;
  return observedDiagnosticImpact;
}

export function determineExternalRiskLevel(
  signal: NonNullable<BuildPulseConvergencePlanInput['externalSignalState']>['signals'][number],
  severityThreshold: number,
): PulseConvergenceUnit['riskLevel'] {
  if (signal.severity > severityThreshold && signal.impactScore > severityThreshold)
    return observedCriticalRisk;
  if (signal.severity > severityThreshold || signal.impactScore > severityThreshold)
    return observedHighRisk;
  return hasObservedItems([...signal.relatedFiles, ...signal.routePatterns])
    ? observedMediumRisk
    : observedLowRisk;
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
