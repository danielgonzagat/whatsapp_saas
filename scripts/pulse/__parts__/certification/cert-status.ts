import type {
  PulseCertification,
  PulseCertificationTarget,
  PulseGateName,
  PulseGateResult,
  PulseManifest,
} from '../../types';

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
    const requested = tierStatus.filter((tier) => tier.id <= certificationTarget.tier);
    return requested.every((tier) => tier.status === 'pass') ? 'CERTIFIED' : 'PARTIAL';
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

export function isGateBlockingFinalReadiness(
  _gateName: PulseGateName,
  result: PulseGateResult,
): boolean {
  return (
    result.status === 'fail' &&
    (result.evidenceMode === 'observed' ||
      result.confidence === 'high' ||
      result.failureClass === 'missing_evidence' ||
      result.failureClass === 'checker_gap')
  );
}
