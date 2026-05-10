import type {
  PulseActorEvidence,
  PulseCertification,
  PulseCertificationTarget,
  PulseGateResult,
} from '../types.evidence';
import type { PulseGateName, PulseManifest } from '../types.manifest';

import {
  _checkerGapLabel,
  _gateFailLabel,
  _gatePassLabel,
  _highConfidenceLabel,
  _missingEvidenceLabel,
  _observedTruthModeLabel,
} from './helpers';

import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { evaluateActorGate } from '../cert-gate-evaluators-actor';

export function findTierForGate(
  certificationTiers: PulseManifest['certificationTiers'],
  gateName: PulseGateName,
): number | null {
  const tier = certificationTiers.find((item) => item.gates.includes(gateName));
  return tier?.id ?? null;
}

export function certificationTargetRequiresGate(
  certificationTarget: PulseCertificationTarget,
  certificationTiers: PulseManifest['certificationTiers'],
  gateName: PulseGateName,
  gateEvidence?: Partial<Record<PulseGateName, unknown[]>>,
): boolean {
  const gateTier = findTierForGate(certificationTiers, gateName);
  if (gateTier === null) {
    const hasEvidence = (gateEvidence?.[gateName] ?? []).length > deriveZeroValue();
    return hasEvidence && (certificationTarget.final || certificationTarget.tier !== null);
  }
  const requestedTier = certificationTarget.tier;
  return (
    Boolean(certificationTarget.final) || (requestedTier !== null && gateTier <= requestedTier)
  );
}

export function evaluateActorGateForCurrentObjective(
  gateName: PulseGateName,
  label: PulseActorEvidence['actorKind'],
  evidence: PulseActorEvidence,
  certificationTarget: PulseCertificationTarget,
  certificationTiers: PulseManifest['certificationTiers'],
  gateEvidence: Partial<Record<PulseGateName, unknown[]>>,
): PulseGateResult {
  const requiresCriticalExecution = certificationTargetRequiresGate(
    certificationTarget,
    certificationTiers,
    gateName,
    gateEvidence,
  );
  if (!evidence.declared.some(Boolean) && requiresCriticalExecution) {
    return {
      status: _gatePassLabel(),
      reason: `${label} actor evidence is outside the current certification objective because the resolved evidence bundle declared no ${label} scenarios.`,
    };
  }
  return evaluateActorGate(label, evidence, requiresCriticalExecution);
}

export function deriveCertificationStatus(
  certificationTarget: PulseCertificationTarget,
  foundationsPass: boolean,
  finalReadinessPass: boolean,
  tierStatus: PulseCertification['tierStatus'],
  allPass: boolean,
): PulseCertification['status'] {
  if (!foundationsPass) {
    return 'NOT_CERTIFIED';
  }
  if (certificationTarget.final) {
    return finalReadinessPass ? 'CERTIFIED' : 'PARTIAL';
  }
  if (certificationTarget.tier !== null) {
    const targetTier = certificationTarget.tier;
    const requested = tierStatus.filter((tier) => tier.id <= targetTier);
    return requested.every((tier) => tier.status === _gatePassLabel()) ? 'CERTIFIED' : 'PARTIAL';
  }
  return allPass ? 'CERTIFIED' : 'PARTIAL';
}

export function deriveFoundationalGates(
  certificationTiers: PulseManifest['certificationTiers'],
  gateOrder: PulseGateName[],
): PulseGateName[] {
  const firstDeclaredTier = certificationTiers.find((tier) =>
    tier.gates.some((gateName) => gateOrder.includes(gateName)),
  );
  if (!firstDeclaredTier) {
    return [];
  }
  return firstDeclaredTier.gates.filter((gateName) => gateOrder.includes(gateName));
}

export function isGateBlockingFinalReadiness(_gateName: PulseGateName, result: PulseGateResult): boolean {
  return (
    result.status === _gateFailLabel() &&
    (result.evidenceMode === _observedTruthModeLabel() ||
      result.confidence === _highConfidenceLabel() ||
      result.failureClass === _missingEvidenceLabel() ||
      result.failureClass === _checkerGapLabel())
  );
}
