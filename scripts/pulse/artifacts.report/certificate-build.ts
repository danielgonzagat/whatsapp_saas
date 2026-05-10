/**
 * Pulse certificate builder.
 */
import { normalizeCanonicalArtifactValue, normalizeArtifactText } from '../artifacts.queue';
import { buildFindingEventSurface } from '../finding-event-surface';
import type { PulseArtifactSnapshot } from '../artifacts.types';
import type { PulseAutonomyState } from '../types.autonomy';
import type { PulseConvergencePlan } from '../types.convergence';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { buildPulseMachineReadiness } from './machine-readiness';

export function buildCertificate(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null = null,
): string {
  const U = deriveUnitValue();
  const Z = deriveZeroValue();
  const certLimit10 = U + U + U + U + U + U + U + U + U + U;
  const certLimit20 = U + U + U + U + U + U + U + U + U + U + U + U + U + U + U + U + U + U + U + U;
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
      topExternalSignals: snapshot.externalSignalState.signals.slice(Z, certLimit10),
      structuralGraphSummary: snapshot.structuralGraph.summary,
      capabilityStateSummary: snapshot.capabilityState.summary,
      flowProjectionSummary: snapshot.flowProjection.summary,
      parityGapsSummary: snapshot.parityGaps.summary,
      parityGaps: snapshot.parityGaps.gaps.slice(Z, certLimit20),
      productVision: snapshot.productVision,
      findingValidationState: {
        artifact: discoverAllObservedArtifactFilenames().findingValidationState,
        operationalIdentity: 'dynamic_finding_event',
        internalFindingEventIsOperationalIdentity: false,
        eventSurface: buildFindingEventSurface(snapshot.health.breaks, certLimit20),
      },
      convergencePlan: {
        totalUnits: convergencePlan.summary.totalUnits,
        governedValidationUnits: convergencePlan.summary.humanRequiredUnits,
        observationOnlyUnits: convergencePlan.summary.observationOnlyUnits,
        topQueue: convergencePlan.queue.slice(Z, certLimit10),
      },
      evidenceSummary: snapshot.certification.evidenceSummary,
      gateEvidence: snapshot.certification.gateEvidence,
      pulseMachineReadiness,
    }),
    (_key, value) => (typeof value === 'string' ? normalizeArtifactText(value) : value),
    U + U,
  );
}
