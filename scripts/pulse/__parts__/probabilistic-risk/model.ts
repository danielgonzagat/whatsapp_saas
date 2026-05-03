import * as path from 'node:path';
import { pathExists, readJsonFile } from '../../safe-fs';
import type {
  PulseHealth,
  PulseCertification,
  PulseCapability,
  PulseCapabilityState,
  PulseAutonomyState,
} from '../../types';
import type { CapabilityReliability, ProbabilisticRiskState } from '../../types.probabilistic-risk';

export const ARTIFACT_FILE = 'PULSE_PROBABILISTIC_RISK.json';
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const PRIOR_ALPHA = 1;
export const PRIOR_BETA = 1;

export function confidenceInterval(alpha: number, beta: number): [number, number] {
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const std = Math.sqrt(variance);
  const lower = Math.max(0, mean - 1.96 * std);
  const upper = Math.min(1, mean + 1.96 * std);
  return [lower, upper];
}

export function computeTrend(
  current: number,
  previous: number | undefined,
): CapabilityReliability['trend'] {
  if (previous === undefined || previous === 0) return 'unknown';
  const delta = current - previous;
  if (delta > 0.02) return 'improving';
  if (delta < -0.02) return 'degrading';
  return 'stable';
}

export function computeDecayFactor(ageMs: number): number {
  if (ageMs <= 0) return 1;
  return Math.exp(-ageMs / SEVEN_DAYS_MS);
}

export function applyTemporalDecay(
  reliability: CapabilityReliability,
  now: Date,
): CapabilityReliability {
  const updatedAt = new Date(reliability.lastUpdate);
  const ageMs = now.getTime() - updatedAt.getTime();

  if (ageMs <= 0) return reliability;

  const decayFactor = computeDecayFactor(ageMs);

  if (decayFactor >= 0.999) return reliability;

  const decayedAlpha = PRIOR_ALPHA + decayFactor * (reliability.alpha - PRIOR_ALPHA);
  const decayedBeta = PRIOR_BETA + decayFactor * (reliability.beta - PRIOR_BETA);
  const decayedObservations = Math.round(decayFactor * reliability.observations);

  return {
    ...reliability,
    alpha: decayedAlpha,
    beta: decayedBeta,
    reliabilityP: decayedAlpha / (decayedAlpha + decayedBeta),
    confidenceInterval: confidenceInterval(decayedAlpha, decayedBeta),
    observations: decayedObservations,
    decayFactor,
  };
}

export function estimateTrafficShare(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): number {
  if (allCapabilities.length === 0) return 0;

  const routeCount = capability.routePatterns?.length ?? 1;
  const totalRoutes = allCapabilities.reduce((sum, c) => sum + (c.routePatterns?.length ?? 1), 0);

  if (totalRoutes === 0) return 1 / allCapabilities.length;
  return routeCount / totalRoutes;
}

export function computeExpectedImpact(reliability: CapabilityReliability): number {
  return (1 - reliability.reliabilityP) * reliability.trafficShare;
}

export function artifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', ARTIFACT_FILE);
}

export function loadCapabilities(rootDir: string): PulseCapabilityState | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_CAPABILITY_STATE.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseCapabilityState>(fp);
  } catch {
    return null;
  }
}

export function loadHealth(rootDir: string): PulseHealth | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_HEALTH.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseHealth>(fp);
  } catch {
    return null;
  }
}

export function loadCertificate(rootDir: string): PulseCertification | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_CERTIFICATE.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseCertification>(fp);
  } catch {
    return null;
  }
}

export function loadAutonomyState(rootDir: string): PulseAutonomyState | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseAutonomyState>(fp);
  } catch {
    return null;
  }
}

export function loadPriorState(rootDir: string): ProbabilisticRiskState | null {
  const fp = artifactPath(rootDir);
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<ProbabilisticRiskState>(fp);
  } catch {
    return null;
  }
}
