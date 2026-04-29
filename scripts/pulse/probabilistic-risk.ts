// PULSE — Wave 7 Module A: Probabilistic Risk Model (Bayesian)
//
// Tracks per-capability reliability using a Beta(α,β) distribution updated
// with static, runtime, and security pass/fail evidence from PULSE_HEALTH.json
// and PULSE_CERTIFICATE.json. Applies exponential temporal decay with 7-day
// half-life. Estimates traffic share from route patterns to compute expected
// impact = (1−reliabilityP) × trafficShare.
//
// Prior: Beta(1,1) uniform (no prior belief).
// Output: .pulse/current/PULSE_PROBABILISTIC_RISK.json

import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  PulseHealth,
  PulseCertification,
  PulseCapability,
  PulseCapabilityState,
  PulseAutonomyState,
} from './types';
import type { CapabilityReliability, ProbabilisticRiskState } from './types.probabilistic-risk';

// ─── Constants ────────────────────────────────────────────────────────────────

const ARTIFACT_FILE = 'PULSE_PROBABILISTIC_RISK.json';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Beta(1,1) uniform prior — no prior belief about pass/fail. */
const PRIOR_ALPHA = 1;
const PRIOR_BETA = 1;

// ─── Confidence interval ──────────────────────────────────────────────────────

/** 95% confidence interval via normal approximation to the Beta distribution. */
function confidenceInterval(alpha: number, beta: number): [number, number] {
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const std = Math.sqrt(variance);
  const lower = Math.max(0, mean - 1.96 * std);
  const upper = Math.min(1, mean + 1.96 * std);
  return [lower, upper];
}

// ─── Trend detection ──────────────────────────────────────────────────────────

function computeTrend(
  current: number,
  previous: number | undefined,
): CapabilityReliability['trend'] {
  if (previous === undefined || previous === 0) return 'unknown';
  const delta = current - previous;
  if (delta > 0.02) return 'improving';
  if (delta < -0.02) return 'degrading';
  return 'stable';
}

// ─── Temporal decay — exponential with 7-day half-life ────────────────────────

/**
 * Weight = exp(−age / halfLife)
 *
 * Shrinks posterior toward Beta(1,1) prior as observations age.
 * Observations 7 days old carry 50% weight; 14 days → 25%.
 */
function computeDecayFactor(ageMs: number): number {
  if (ageMs <= 0) return 1;
  return Math.exp(-ageMs / SEVEN_DAYS_MS);
}

function applyTemporalDecay(reliability: CapabilityReliability, now: Date): CapabilityReliability {
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

// ─── Traffic share estimation ─────────────────────────────────────────────────

function estimateTrafficShare(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): number {
  if (allCapabilities.length === 0) return 0;

  const routeCount = capability.routePatterns?.length ?? 1;
  const totalRoutes = allCapabilities.reduce((sum, c) => sum + (c.routePatterns?.length ?? 1), 0);

  if (totalRoutes === 0) return 1 / allCapabilities.length;
  return routeCount / totalRoutes;
}

// ─── Expected impact ──────────────────────────────────────────────────────────

function computeExpectedImpact(reliability: CapabilityReliability): number {
  return (1 - reliability.reliabilityP) * reliability.trafficShare;
}

// ─── File loading helpers ─────────────────────────────────────────────────────

function artifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', ARTIFACT_FILE);
}

function loadCapabilities(rootDir: string): PulseCapabilityState | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_CAPABILITY_STATE.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseCapabilityState>(fp);
  } catch {
    return null;
  }
}

function loadHealth(rootDir: string): PulseHealth | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_HEALTH.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseHealth>(fp);
  } catch {
    return null;
  }
}

function loadCertificate(rootDir: string): PulseCertification | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_CERTIFICATE.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseCertification>(fp);
  } catch {
    return null;
  }
}

function loadAutonomyState(rootDir: string): PulseAutonomyState | null {
  const fp = path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json');
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<PulseAutonomyState>(fp);
  } catch {
    return null;
  }
}

function loadPriorState(rootDir: string): ProbabilisticRiskState | null {
  const fp = artifactPath(rootDir);
  if (!pathExists(fp)) return null;
  try {
    return readJsonFile<ProbabilisticRiskState>(fp);
  } catch {
    return null;
  }
}

// ─── Evidence counting ────────────────────────────────────────────────────────

/**
 * Static evidence: 1 observation per capability from PULSE_HEALTH.
 *
 * Pass if no breaks found for this capability's files; fail if any breaks
 * are associated with the capability.
 */
function countStaticEvidence(
  capability: PulseCapability,
  health: PulseHealth | null,
): { passed: number; failed: number } {
  if (!health) return { passed: 0, failed: 0 };
  if (capability.filePaths.length === 0) return { passed: 0, failed: 0 };

  const hasBreak = health.breaks.some((b) =>
    capability.filePaths.some((fp) => b.file.includes(fp) || fp.includes(b.file)),
  );

  return hasBreak ? { passed: 0, failed: 1 } : { passed: 1, failed: 0 };
}

/**
 * Runtime evidence: 1 observation per capability from PULSE_CERTIFICATE.
 *
 * Pass if all gates that affect this capability pass; fail if any gate
 * that affects this capability fails.
 */
function countRuntimeEvidence(
  capabilityId: string,
  certificate: PulseCertification | null,
): { passed: number; failed: number } {
  if (!certificate) return { passed: 0, failed: 0 };

  let hasGate = false;
  let hasFail = false;

  for (const gateResult of Object.values(certificate.gates)) {
    if (gateResult.affectedCapabilityIds?.includes(capabilityId)) {
      hasGate = true;
      if (gateResult.status === 'fail') {
        hasFail = true;
      }
    }
  }

  if (!hasGate) return { passed: 0, failed: 0 };
  return hasFail ? { passed: 0, failed: 1 } : { passed: 1, failed: 0 };
}

/**
 * Security evidence: 1 observation per governance-protected capability from
 * PULSE_HEALTH security signals.
 *
 * Pass if no security/data-safety issues and no high-severity Codacy issues;
 * fail if security issues are detected for the capability.
 */
function countSecurityEvidence(
  capability: PulseCapability,
  health: PulseHealth | null,
): { passed: number; failed: number } {
  if (!health) return { passed: 0, failed: 0 };

  const isGovernmental = capability.protectedByGovernance;
  const hasHighSeverity = capability.highSeverityIssueCount > 0;

  if (!isGovernmental && !hasHighSeverity) return { passed: 0, failed: 0 };

  const hasSecurityIssue =
    health.stats.securityIssues > 0 ||
    health.stats.dataSafetyIssues > 0 ||
    capability.highSeverityIssueCount > 0;

  return hasSecurityIssue ? { passed: 0, failed: 1 } : { passed: 1, failed: 0 };
}

/**
 * Autonomy iteration evidence: counts completed/validated iterations that
 * touched this capability and finished after `since` ISO timestamp.
 *
 * Each completed codex execution (exitCode===0 → pass, >0 → fail) and each
 * validation command count as observations.
 */
function countAutonomyEvidence(
  capabilityId: string,
  autonomyState: PulseAutonomyState | null,
  since: string | null,
): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  if (!autonomyState?.history) return { passed: 0, failed: 0 };

  for (const iteration of autonomyState.history) {
    if (!iteration.unit?.affectedCapabilities) continue;
    if (!iteration.unit.affectedCapabilities.includes(capabilityId)) continue;
    if (iteration.status !== 'completed' && iteration.status !== 'validated') continue;

    if (since && iteration.finishedAt <= since) continue;

    if (iteration.codex.executed) {
      if (iteration.codex.exitCode === 0) {
        passed += 1;
      } else if (iteration.codex.exitCode !== null && iteration.codex.exitCode > 0) {
        failed += 1;
      }
    }

    if (iteration.validation.executed) {
      for (const cmd of iteration.validation.commands) {
        if (cmd.exitCode === 0) {
          passed += 1;
        } else if (cmd.exitCode !== null && cmd.exitCode > 0) {
          failed += 1;
        }
      }
    }
  }

  return { passed, failed };
}

// ─── Build ────────────────────────────────────────────────────────────────────

export function buildProbabilisticRisk(rootDir: string): ProbabilisticRiskState {
  const capabilities = loadCapabilities(rootDir);
  const health = loadHealth(rootDir);
  const certificate = loadCertificate(rootDir);
  const autonomyState = loadAutonomyState(rootDir);
  const priorState = loadPriorState(rootDir);
  const now = new Date();
  const nowIso = now.toISOString();

  const capList = capabilities?.capabilities ?? [];

  const priorMap = new Map<string, CapabilityReliability>();
  if (priorState?.reliabilities) {
    for (const r of priorState.reliabilities) {
      priorMap.set(r.capabilityId, r);
    }
  }

  const priorGeneratedAt = priorState?.generatedAt ?? null;

  const reliabilities: CapabilityReliability[] = capList.map((cap) => {
    const prior = priorMap.get(cap.id);

    // Count evidence from all sources
    const staticE = countStaticEvidence(cap, health);
    const runtimeE = countRuntimeEvidence(cap.id, certificate);
    const securityE = countSecurityEvidence(cap, health);
    const autonomyE = countAutonomyEvidence(cap.id, autonomyState, priorGeneratedAt);

    const totalPassed = staticE.passed + runtimeE.passed + securityE.passed + autonomyE.passed;
    const totalFailed = staticE.failed + runtimeE.failed + securityE.failed + autonomyE.failed;

    let alpha: number;
    let beta: number;
    let observations: number;
    let previousP: number | undefined;

    if (prior) {
      previousP = prior.reliabilityP;
      // Apply temporal decay to prior, then add new evidence on top
      const decayed = applyTemporalDecay(prior, now);
      alpha = decayed.alpha + totalPassed;
      beta = decayed.beta + totalFailed;
      observations = decayed.observations + totalPassed + totalFailed;
    } else {
      // Fresh: Beta(1,1) uniform prior + evidence
      alpha = PRIOR_ALPHA + totalPassed;
      beta = PRIOR_BETA + totalFailed;
      observations = totalPassed + totalFailed;
    }

    const reliabilityP =
      observations > 0 ? alpha / (alpha + beta) : PRIOR_ALPHA / (PRIOR_ALPHA + PRIOR_BETA);

    const trend = prior ? computeTrend(reliabilityP, previousP) : 'unknown';

    const trafficShare = estimateTrafficShare(cap, capList);
    const ci = confidenceInterval(alpha, beta);

    return {
      capabilityId: cap.id,
      capabilityName: cap.name,
      alpha,
      beta,
      reliabilityP,
      confidenceInterval: ci,
      observations,
      lastUpdate: nowIso,
      trafficShare,
      expectedImpact: 0, // computed below
      trend,
      decayFactor: prior
        ? computeDecayFactor(now.getTime() - new Date(prior.lastUpdate).getTime())
        : 1,
    };
  });

  // Compute expected impact for all
  for (const r of reliabilities) {
    r.expectedImpact = computeExpectedImpact(r);
  }

  // Sort by expected impact descending
  const sorted = [...reliabilities].sort((a, b) => b.expectedImpact - a.expectedImpact);

  const avgReliability =
    reliabilities.length > 0
      ? reliabilities.reduce((sum, r) => sum + r.reliabilityP, 0) / reliabilities.length
      : 0;

  const minReliability =
    reliabilities.length > 0 ? Math.min(...reliabilities.map((r) => r.reliabilityP)) : 0;

  const state: ProbabilisticRiskState = {
    generatedAt: nowIso,
    summary: {
      totalCapabilities: reliabilities.length,
      avgReliability: Math.round(avgReliability * 1000) / 1000,
      minReliability: Math.round(minReliability * 1000) / 1000,
      capabilitiesWithLowReliability: reliabilities.filter((r) => r.reliabilityP < 0.5).length,
      topImpactCapabilities: sorted.slice(0, 10).map((r) => ({
        capabilityId: r.capabilityId,
        expectedImpact: Math.round(r.expectedImpact * 10000) / 10000,
      })),
    },
    reliabilities,
    prioritizedPlan: sorted.map((r) => r.capabilityId),
  };

  const outPath = artifactPath(rootDir);
  ensureDir(path.dirname(outPath), { recursive: true });
  writeTextFile(outPath, JSON.stringify(state, null, 2));

  return state;
}
