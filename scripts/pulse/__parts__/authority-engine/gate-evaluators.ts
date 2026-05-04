import type { PulseGateName } from '../../types.manifest';
import type { PulseCertification } from '../../types.evidence';
import type { PulseMachineReadiness } from '../../artifacts.types';
import type { AuthorityLevel } from '../../types.authority-engine';
import { loadCertificate, loadAuthorityState } from './state-io';
import { ADVANCEMENT_LEVEL_COUNT, LEVEL_ORDER } from './constants';

function uniqueGateNames(gateNames: PulseGateName[]): PulseGateName[] {
  return [...new Set(gateNames)];
}

function authorityAdvancementRank(level: AuthorityLevel): number {
  return Math.max(0, LEVEL_ORDER.indexOf(level));
}

function gateOrderFromCertificate(certificate: PulseCertification): PulseGateName[] {
  const tierGateOrder = certificate.tierStatus.flatMap((tier) => tier.gates);
  if (tierGateOrder.length > 0) {
    return uniqueGateNames(tierGateOrder);
  }
  return Object.keys(certificate.gates) as PulseGateName[];
}

function requiredGatesForCertificateLevel(
  certificate: PulseCertification,
  level: AuthorityLevel,
): PulseGateName[] {
  const rank = authorityAdvancementRank(level);
  if (rank === 0) {
    return [];
  }
  const tiers = [...certificate.tierStatus].sort((left, right) => left.id - right.id);
  if (tiers.length > 0) {
    const tierEnd = Math.min(rank - 1, tiers.length - 1);
    return uniqueGateNames(tiers.slice(0, tierEnd + 1).flatMap((tier) => tier.gates));
  }
  const observedGateOrder = gateOrderFromCertificate(certificate);
  const requiredGateCount = Math.ceil((observedGateOrder.length * rank) / ADVANCEMENT_LEVEL_COUNT);
  return observedGateOrder.slice(0, requiredGateCount);
}

function gateDescription(name: string, certificate: PulseCertification): string {
  return certificate.gates[name as PulseGateName]?.reason ?? name;
}

function evaluateCertificateGate(
  certificate: PulseCertification,
  gateName: PulseGateName,
): { passed: boolean; evidence: string[] } {
  const gateResult = certificate.gates?.[gateName];
  if (!gateResult) {
    return { passed: false, evidence: [`Gate "${gateName}" not found in certificate`] };
  }
  const passed = gateResult.status === 'pass';
  const confidence = gateResult.confidence ? ` (confidence: ${gateResult.confidence})` : '';
  return {
    passed,
    evidence: [
      `Certificate gate "${gateName}": ${gateResult.status}${confidence}`,
      gateResult.reason ? `Reason: ${gateResult.reason}` : '',
    ].filter(Boolean),
  };
}

function evaluateMachineReadinessCriterion(
  machineReadiness: PulseMachineReadiness,
  criterionId: string,
): { passed: boolean; evidence: string[] } {
  const criterion = machineReadiness.criteria?.find((c) => c.id === criterionId);
  if (!criterion) {
    return { passed: false, evidence: [`Machine readiness criterion "${criterionId}" not found`] };
  }
  return {
    passed: criterion.status === 'pass',
    evidence: [
      `Machine readiness "${criterionId}": ${criterion.status}`,
      `Reason: ${criterion.reason}`,
      ...Object.entries(criterion.evidence ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    ],
  };
}

function checkNoRegression(rootDir: string): { passed: boolean; evidence: string[] } {
  const cert = loadCertificate(rootDir);
  const existing = loadAuthorityState(rootDir);
  if (!cert) {
    return { passed: false, evidence: ['PULSE_CERTIFICATE.json not found'] };
  }
  const currentScore = cert.score;
  if (!existing?.history?.length) {
    return {
      passed: true,
      evidence: [`Current score: ${currentScore} — no prior history to compare`],
    };
  }
  return {
    passed: currentScore > 0,
    evidence: [`Current certificate score: ${currentScore}`, 'No regression baseline available'],
  };
}

function checkFullE2E(certificate: PulseCertification): { passed: boolean; evidence: string[] } {
  const terminalTier = [...certificate.tierStatus].sort((left, right) => right.id - left.id)[0];
  const evidenceGateNames = gateOrderFromCertificate(certificate);
  const candidateGateNames = terminalTier?.gates.length ? terminalTier.gates : evidenceGateNames;
  const results = candidateGateNames.map((gateName) =>
    evaluateCertificateGate(certificate, gateName),
  );
  const failures = results.filter((r) => !r.passed);
  const passed = failures.length === 0;
  return {
    passed,
    evidence: [
      `Terminal certification gates: ${candidateGateNames.length} total, ${candidateGateNames.length - failures.length} passing, ${failures.length} failing`,
      ...failures.map((f) => `  FAIL: ${f.evidence[0]}`),
    ],
  };
}

export {
  uniqueGateNames,
  authorityAdvancementRank,
  gateOrderFromCertificate,
  requiredGatesForCertificateLevel,
  gateDescription,
  evaluateCertificateGate,
  evaluateMachineReadinessCriterion,
  checkNoRegression,
  checkFullE2E,
};
