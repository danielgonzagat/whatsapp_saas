/**
 * Authority Engine — Core internals: contracts, paths, I/O, gate evaluators, helpers.
 */
import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyPassedStatusFromTypeEvidence,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type { PulseGateName } from '../../types.manifest';
import type { PulseCertification } from '../../types.evidence';
import type { PulseMachineReadiness } from '../../artifacts.types';
import type {
  AuthorityLevel,
  AuthorityState,
  AuthorityTransitionGate,
} from '../../types.authority-engine';

// ── Authority-level contract derivation ─────────────────────────────────────

const authorityLevelMembers = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.authority-engine.ts',
  'AuthorityLevel',
);

export const LEVEL_ORDER: readonly AuthorityLevel[] = [
  'advisory_only',
  'operator_gated',
  'bounded_autonomous',
  'certified_autonomous',
  'production_authority',
] as const;

export function isMemberOfAuthorityContract(value: string): value is AuthorityLevel {
  return authorityLevelMembers.has(value);
}

export function isPassStatus(status: string): boolean {
  const statusMembers = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'status',
  );
  if (!statusMembers.has(status)) return false;
  return [...discoverPropertyPassedStatusFromTypeEvidence()].some((passed) =>
    passed.includes(status),
  );
}

export const ADVANCEMENT_LEVEL_COUNT = Math.max(
  deriveUnitValue(),
  LEVEL_ORDER.length - deriveUnitValue(),
);

// ── Path helpers ──────────────────────────────────────────────────────────────

function observedArtifactFilename(key: string, staticFallback: string): string {
  return discoverAllObservedArtifactFilenames()[key] ?? staticFallback;
}

function authorityStatePath(rootDir: string): string {
  return path.join(
    rootDir,
    '.pulse',
    'current',
    observedArtifactFilename('authorityState', 'PULSE_AUTHORITY_STATE.json'),
  );
}

function certificatePath(rootDir: string): string {
  return path.join(
    rootDir,
    '.pulse',
    'current',
    observedArtifactFilename('certificate', 'PULSE_CERTIFICATE.json'),
  );
}

function machineReadinessPath(rootDir: string): string {
  return path.join(
    rootDir,
    '.pulse',
    'current',
    observedArtifactFilename('machineReadiness', 'PULSE_MACHINE_READINESS.json'),
  );
}

// ── State I/O ─────────────────────────────────────────────────────────────────

export function loadAuthorityState(rootDir: string): AuthorityState | null {
  const filePath = authorityStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<AuthorityState>(filePath);
  } catch {
    return null;
  }
}

export function saveAuthorityState(rootDir: string, state: AuthorityState): void {
  const filePath = authorityStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  writeTextFile(filePath, JSON.stringify(state, null, deriveUnitValue() + deriveUnitValue()));
}

export function loadCertificate(rootDir: string): PulseCertification | null {
  const filePath = certificatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseCertification>(filePath);
  } catch {
    return null;
  }
}

export function loadMachineReadiness(rootDir: string): PulseMachineReadiness | null {
  const filePath = machineReadinessPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseMachineReadiness>(filePath);
  } catch {
    return null;
  }
}

export function uniqueGateNames(gateNames: PulseGateName[]): PulseGateName[] {
  return [...new Set(gateNames)];
}

export function authorityAdvancementRank(level: AuthorityLevel): number {
  return Math.max(deriveZeroValue(), LEVEL_ORDER.indexOf(level));
}

export function gateOrderFromCertificate(certificate: PulseCertification): PulseGateName[] {
  const tierGateOrder = certificate.tierStatus.flatMap((tier) => tier.gates);
  if (tierGateOrder.length > 0) {
    return uniqueGateNames(tierGateOrder);
  }
  return Object.keys(certificate.gates) as PulseGateName[];
}

export function requiredGatesForCertificateLevel(
  certificate: PulseCertification,
  level: AuthorityLevel,
): PulseGateName[] {
  const rank = authorityAdvancementRank(level);
  if (rank === deriveZeroValue()) {
    return [];
  }

  const tiers = [...certificate.tierStatus].sort((left, right) => left.id - right.id);
  if (tiers.length > deriveZeroValue()) {
    const tierEnd = Math.min(rank - deriveUnitValue(), tiers.length - deriveUnitValue());
    return uniqueGateNames(tiers.slice(0, tierEnd + 1).flatMap((tier) => tier.gates));
  }

  const observedGateOrder = gateOrderFromCertificate(certificate);
  const requiredGateCount = Math.ceil((observedGateOrder.length * rank) / ADVANCEMENT_LEVEL_COUNT);
  return observedGateOrder.slice(0, requiredGateCount);
}

export function gateDescription(name: string, certificate: PulseCertification): string {
  return certificate.gates[name as PulseGateName]?.reason ?? name;
}

// ── Gate evaluators ───────────────────────────────────────────────────────────

export function evaluateCertificateGate(
  certificate: PulseCertification,
  gateName: PulseGateName,
): { passed: boolean; evidence: string[] } {
  const gateResult = certificate.gates?.[gateName];
  if (!gateResult) {
    return { passed: false, evidence: [`Gate "${gateName}" not found in certificate`] };
  }

  const passed = isPassStatus(gateResult.status);
  const confidence = gateResult.confidence ? ` (confidence: ${gateResult.confidence})` : '';

  return {
    passed,
    evidence: [
      `Certificate gate "${gateName}": ${gateResult.status}${confidence}`,
      gateResult.reason ? `Reason: ${gateResult.reason}` : '',
    ].filter(Boolean),
  };
}

export function evaluateMachineReadinessCriterion(
  machineReadiness: PulseMachineReadiness,
  criterionId: string,
): { passed: boolean; evidence: string[] } {
  const criterion = machineReadiness.criteria?.find((c) => c.id === criterionId);
  if (!criterion) {
    return { passed: false, evidence: [`Machine readiness criterion "${criterionId}" not found`] };
  }

  return {
    passed: isPassStatus(criterion.status),
    evidence: [
      `Machine readiness "${criterionId}": ${criterion.status}`,
      `Reason: ${criterion.reason}`,
      ...Object.entries(criterion.evidence ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    ],
  };
}

export function checkNoRegression(rootDir: string): { passed: boolean; evidence: string[] } {
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
    passed: currentScore > deriveZeroValue(),
    evidence: [`Current certificate score: ${currentScore}`, 'No regression baseline available'],
  };
}

export function checkFullE2E(certificate: PulseCertification): {
  passed: boolean;
  evidence: string[];
} {
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

export function findNextLevel(current: AuthorityLevel): AuthorityLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  if (idx < deriveZeroValue() || idx >= LEVEL_ORDER.length - deriveUnitValue()) return current;
  return LEVEL_ORDER[idx + deriveUnitValue()];
}

export function isValidTransition(from: AuthorityLevel, to: AuthorityLevel): boolean {
  const fromIdx = LEVEL_ORDER.indexOf(from);
  const toIdx = LEVEL_ORDER.indexOf(to);
  return toIdx > fromIdx && toIdx <= fromIdx + deriveUnitValue();
}
