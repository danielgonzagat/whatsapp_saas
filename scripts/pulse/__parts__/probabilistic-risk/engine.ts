import * as path from 'node:path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import type {
  PulseHealth,
  PulseCertification,
  PulseCapability,
  PulseAutonomyState,
} from '../../types';
import type { CapabilityReliability, ProbabilisticRiskState } from '../../types.probabilistic-risk';
import {
  SEVEN_DAYS_MS,
  PRIOR_ALPHA,
  PRIOR_BETA,
  confidenceInterval,
  computeTrend,
  computeDecayFactor,
  applyTemporalDecay,
  estimateTrafficShare,
  computeExpectedImpact,
  artifactPath,
  loadCapabilities,
  loadHealth,
  loadCertificate,
  loadAutonomyState,
  loadPriorState,
} from './model';

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
      const decayed = applyTemporalDecay(prior, now);
      alpha = decayed.alpha + totalPassed;
      beta = decayed.beta + totalFailed;
      observations = decayed.observations + totalPassed + totalFailed;
    } else {
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
      expectedImpact: 0,
      trend,
      decayFactor: prior
        ? computeDecayFactor(now.getTime() - new Date(prior.lastUpdate).getTime())
        : 1,
    };
  });

  for (const r of reliabilities) {
    r.expectedImpact = computeExpectedImpact(r);
  }

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
