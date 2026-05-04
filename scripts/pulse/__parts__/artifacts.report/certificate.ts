import { normalizeArtifactText, normalizeCanonicalArtifactValue } from '../../artifacts.queue';
import { buildFindingEventSurface } from '../../finding-event-surface';
import type { PulseArtifactSnapshot } from '../../artifacts.types';
import type { PulseAutonomyState, PulseConvergencePlan } from '../../types';
import { buildPulseMachineReadiness } from './readiness';

export function buildCertificate(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null = null,
): string {
  const pulseMachineReadiness = buildPulseMachineReadiness(
    snapshot,
    convergencePlan,
    previousAutonomyState,
  );
  return JSON.stringify(
    normalizeCanonicalArtifactValue({
      projectId: snapshot.manifest?.projectId || 'unknown',
      projectName: snapshot.manifest?.projectName || 'unknown',
      commitSha: snapshot.certification.commitSha,
      environment: snapshot.certification.environment,
      timestamp: snapshot.certification.timestamp,
      status: snapshot.certification.status,
      humanReplacementStatus: snapshot.certification.humanReplacementStatus,
      profile: snapshot.certification.certificationTarget.profile ?? null,
      certificationScope: snapshot.certification.certificationScope,
      score: snapshot.certification.score,
      rawScore: snapshot.certification.rawScore,
      certificationTarget: snapshot.certification.certificationTarget,
      blockingTier: snapshot.certification.blockingTier,
      gates: snapshot.certification.gates,
      criticalFailures: snapshot.certification.criticalFailures,
      dynamicBlockingReasons: snapshot.certification.dynamicBlockingReasons,
      noHardcodedRealityState: snapshot.certification.noHardcodedRealityState ?? null,
      selfTrustReport: snapshot.certification.selfTrustReport || null,
      scopeStateSummary: snapshot.scopeState.summary,
      codacySummary: snapshot.certification.codacySummary,
      codacyEvidenceSummary: snapshot.codacyEvidence.summary,
      externalSignalSummary: snapshot.externalSignalState.summary,
      topExternalSignals: snapshot.externalSignalState.signals.slice(0, 10),
      structuralGraphSummary: snapshot.structuralGraph.summary,
      capabilityStateSummary: snapshot.capabilityState.summary,
      flowProjectionSummary: snapshot.flowProjection.summary,
      parityGapsSummary: snapshot.parityGaps.summary,
      parityGaps: snapshot.parityGaps.gaps.slice(0, 20),
      productVision: snapshot.productVision,
      findingValidationState: {
        artifact: 'PULSE_FINDING_VALIDATION_STATE',
        operationalIdentity: 'dynamic_finding_event',
        internalBreakTypeIsOperationalIdentity: false,
        eventSurface: buildFindingEventSurface(snapshot.health.breaks, 20),
      },
      convergencePlan: {
        totalUnits: convergencePlan.summary.totalUnits,
        governedValidationUnits: convergencePlan.summary.humanRequiredUnits,
        observationOnlyUnits: convergencePlan.summary.observationOnlyUnits,
        topQueue: convergencePlan.queue.slice(0, 10),
      },
      evidenceSummary: snapshot.certification.evidenceSummary,
      gateEvidence: snapshot.certification.gateEvidence,
      pulseMachineReadiness,
    }),
    (_key, value) => (typeof value === 'string' ? normalizeArtifactText(value) : value),
    2,
  );
}
