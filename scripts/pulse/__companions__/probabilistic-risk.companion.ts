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

