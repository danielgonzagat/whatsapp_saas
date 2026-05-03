import type {
  PulseCertification,
  PulseEvidenceRecord,
  PulseGateName,
  PulseScenarioResult,
  PulseWorldState,
} from '../../types';
import {
  uniqueStrings,
  compactText,
  splitWords,
  normalizeSearchToken,
  lacksObservedItems,
  isSameState,
  isDifferentState,
} from './helpers';
import { OBSERVED_ARTIFACTS } from './state';

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
