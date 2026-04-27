/**
 * Pulse artifact report and certificate builders.
 */
import { compact } from './artifacts.io';
import { buildDecisionQueue } from './artifacts.queue';
import type { PulseArtifactSnapshot } from './artifacts';
import type { PulseConvergencePlan } from './types';
import type { PulseArtifactCleanupReport } from './artifact-gc';
import { calculateCoverage } from './coverage-calculator';

export function getProductFacingCapabilities(
  snapshot: PulseArtifactSnapshot,
): PulseArtifactSnapshot['capabilityState']['capabilities'] {
  const productFacing = snapshot.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || capability.routePatterns.length > 0,
  );
  return productFacing.length > 0 ? productFacing : snapshot.capabilityState.capabilities;
}

export function buildReport(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  cleanupReport: PulseArtifactCleanupReport,
): string {
  const decisionQueue = buildDecisionQueue(convergencePlan);
  const runtimeEvidence = snapshot.certification?.evidenceSummary?.runtime;
  const runtimeProbes = runtimeEvidence?.probes ?? [];
  const coverage = calculateCoverage({
    scopeState: snapshot.scopeState,
    structuralGraph: snapshot.structuralGraph,
    capabilityState: snapshot.capabilityState,
    flowProjection: snapshot.flowProjection,
    runtimeProbeCount: runtimeProbes.length,
    runtimeProbeFreshCount: runtimeProbes.filter((p: { status?: string }) =>
      ['executed', 'fresh'].includes(p.status ?? ''),
    ).length,
    runtimeProbeStaleCount: runtimeProbes.filter((p: { status?: string }) =>
      ['cached', 'stale', 'reused'].includes(p.status ?? ''),
    ).length,
  });
  const lines: string[] = [];
  lines.push(`# PULSE REPORT — ${snapshot.certification.timestamp}`);
  lines.push('');

  const selfTrustPass = snapshot.certification.gates.pulseSelfTrustPass?.status === 'pass';
  const noOverclaimPass = snapshot.certification.gates.noOverclaimPass?.status === 'pass';
  const principalBlocker = snapshot.productVision.topBlockers[0] ?? 'none';
  const nextAction = decisionQueue[0]?.title ?? 'none';

  lines.push('## PULSE VERDICT');
  lines.push('');
  lines.push(
    `- Produto pronto para producao? ${snapshot.certification.status === 'CERTIFIED' ? 'SIM' : 'NAO'}`,
  );
  lines.push(`- IA pode trabalhar autonomamente ate producao? NAO`);
  lines.push(`- Proximo passo seguro? ${decisionQueue.length > 0 ? 'SIM' : 'NAO'}`);
  lines.push(`- Self-trust: ${selfTrustPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- No-overclaim: ${noOverclaimPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- Principal blocker: ${principalBlocker}`);
  lines.push(`- Proxima acao: ${nextAction}`);
  lines.push('');

  lines.push('## Current State');
  lines.push('');
  lines.push(`- Certification: ${snapshot.certification.status}`);
  lines.push(`- Human replacement: ${snapshot.certification.humanReplacementStatus}`);
  lines.push(`- Score: ${snapshot.certification.score}/100`);
  lines.push(`- Blocking tier: ${snapshot.certification.blockingTier ?? 'none'}`);
  lines.push(
    `- Scope parity: ${snapshot.scopeState.parity.status.toUpperCase()} (${snapshot.scopeState.parity.confidence})`,
  );
  lines.push(
    `- Structural chains: ${snapshot.structuralGraph.summary.completeChains}/${snapshot.structuralGraph.summary.interfaceChains} complete`,
  );
  lines.push(
    `- Capabilities: real=${snapshot.capabilityState.summary.realCapabilities}, partial=${snapshot.capabilityState.summary.partialCapabilities}, latent=${snapshot.capabilityState.summary.latentCapabilities}, phantom=${snapshot.capabilityState.summary.phantomCapabilities}`,
  );
  lines.push(
    `- Capability maturity: foundational=${snapshot.capabilityState.summary.foundationalCapabilities}, connected=${snapshot.capabilityState.summary.connectedCapabilities}, operational=${snapshot.capabilityState.summary.operationalCapabilities}, productionReady=${snapshot.capabilityState.summary.productionReadyCapabilities}`,
  );
  lines.push(
    `- Flows: real=${snapshot.flowProjection.summary.realFlows}, partial=${snapshot.flowProjection.summary.partialFlows}, latent=${snapshot.flowProjection.summary.latentFlows}, phantom=${snapshot.flowProjection.summary.phantomFlows}`,
  );
  lines.push(
    `- Structural parity gaps: total=${snapshot.parityGaps.summary.totalGaps}, critical=${snapshot.parityGaps.summary.criticalGaps}, high=${snapshot.parityGaps.summary.highGaps}`,
  );
  lines.push(`- Codacy HIGH issues: ${snapshot.codacyEvidence.summary.highIssues}`);
  // GitNexus code graph status
  const gitnexusSignals = snapshot.externalSignalState.signals.filter(
    (s) => s.source === 'gitnexus',
  );
  const gitnexusStatus = gitnexusSignals.length > 0 ? gitnexusSignals[0].summary : 'not configured';
  lines.push(`- GitNexus Code Graph: ${gitnexusStatus}`);
  lines.push(
    `- External signals: total=${snapshot.externalSignalState.summary.totalSignals}, runtime=${snapshot.externalSignalState.summary.runtimeSignals}, change=${snapshot.externalSignalState.summary.changeSignals}, dependency=${snapshot.externalSignalState.summary.dependencySignals}, high-impact=${snapshot.externalSignalState.summary.highImpactSignals}`,
  );
  lines.push('');
  lines.push('## Coverage Truth');
  lines.push('');
  lines.push(`- Inventory Coverage: ${snapshot.scopeState.summary.inventoryCoverage}%`);
  lines.push(`- Classification Coverage: ${snapshot.scopeState.summary.classificationCoverage}%`);
  lines.push(
    `- Structural Graph Coverage: ${coverage.structuralGraphCoverage}% (${coverage.connectedFilesCount}/${coverage.relevantStructuralFilesCount} connected)`,
  );
  if (coverage.structuralGraphCoverage < 100)
    lines.push(`  Reason: ${coverage.structuralGraphCoverageReason}`);
  lines.push(`- Test Coverage: ${coverage.testCoverage}%`);
  if (coverage.testCoverage < 100) lines.push(`  Reason: ${coverage.testCoverageReason}`);
  lines.push(
    `- Scenario Coverage: ${coverage.scenarioCoverage}% (declared=${coverage.declaredScenarioCoverage}%, executed=${coverage.executedScenarioCoverage}%, passed=${coverage.passedScenarioCoverage}%)`,
  );
  if (coverage.scenarioCoverage < 100) lines.push(`  Reason: ${coverage.scenarioCoverageReason}`);
  lines.push(
    `- Runtime Evidence Coverage: ${coverage.runtimeEvidenceCoverage}% (fresh=${coverage.freshRuntimeEvidenceCoverage}%, stale=${coverage.staleRuntimeEvidenceCoverage}%)`,
  );
  if (coverage.runtimeEvidenceCoverage < 100)
    lines.push(`  Reason: ${coverage.runtimeEvidenceCoverageReason}`);
  lines.push(`- Production Proof Coverage: ${coverage.productionProofCoverage}%`);
  if (coverage.productionProofCoverage < 100)
    lines.push(`  Reason: ${coverage.productionProofCoverageReason}`);
  lines.push(`- Unknown Files: ${snapshot.scopeState.summary.unknownFiles.length}`);
  lines.push(`- Orphan Files: ${coverage.orphanFiles.length}`);
  lines.push(`- Excluded Directories: ${snapshot.scopeState.excludedFiles.length}`);
  lines.push(`- Manifest role: semantic overlay, NOT scope boundary`);
  lines.push(`- Scope source: repo_filesystem`);
  lines.push('');
  lines.push('## What is Observed vs Inferred vs Aspirational');
  lines.push('');
  lines.push('### Observed (direct evidence)');
  lines.push(`- Runtime probes executed: ${runtimeProbes.length}`);
  lines.push(`- External signals: ${snapshot.externalSignalState.summary.totalSignals} total`);
  lines.push(`- Self-trust: ${selfTrustPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- No-overclaim: ${noOverclaimPass ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('### Inferred (structural analysis)');
  lines.push(`- ${snapshot.structuralGraph.summary.interfaceChains} structural chains`);
  lines.push(`- ${snapshot.capabilityState.summary.realCapabilities} real capabilities`);
  lines.push(`- ${snapshot.flowProjection.summary.realFlows} real flows`);
  lines.push('');
  lines.push('### Aspirational (product vision projection)');
  lines.push(`- ${snapshot.productVision.surfaces?.length ?? 0} projected surfaces`);
  lines.push(`- Target: ${snapshot.productVision.projectedProductSummary}`);
  lines.push('');
  if (snapshot.externalSignalState.signals.length > 0) {
    lines.push('## External Reality');
    lines.push('');
    for (const signal of snapshot.externalSignalState.signals.slice(0, 8)) {
      lines.push(
        `- ${signal.source}/${signal.type}: impact=${Math.round(signal.impactScore * 100)}%, mode=${signal.executionMode}, mappedCapabilities=${signal.capabilityIds.length}, mappedFlows=${signal.flowIds.length}, summary=${compact(signal.summary, 200)}`,
      );
    }
    lines.push('');
  }
  lines.push('## Product Identity');
  lines.push('');
  lines.push(`- Current checkpoint: ${snapshot.productVision.currentStateSummary}`);
  lines.push(
    `- Inferred product: ${snapshot.productVision.inferredProductIdentity || snapshot.productVision.projectedProductSummary}`,
  );
  lines.push(`- Projected checkpoint: ${snapshot.productVision.projectedProductSummary}`);
  lines.push(`- Distance: ${snapshot.productVision.distanceSummary}`);
  lines.push('');
  if (snapshot.productVision.surfaces && snapshot.productVision.surfaces.length > 0) {
    lines.push('## Product Surfaces');
    lines.push('');
    for (const surface of snapshot.productVision.surfaces.slice(0, 12)) {
      lines.push(
        `- ${surface.name}: status=${surface.status}, completion=${Math.round(surface.completion * 100)}%, capabilities=${surface.capabilityIds.length}, flows=${surface.flowIds.length}${surface.blockers[0] ? `, blocker=${compact(surface.blockers[0], 180)}` : ''}`,
      );
    }
    lines.push('');
  }
  if (snapshot.productVision.experiences && snapshot.productVision.experiences.length > 0) {
    lines.push('## Experience Projection');
    lines.push('');
    for (const experience of snapshot.productVision.experiences.slice(0, 10)) {
      lines.push(
        `- ${experience.name}: status=${experience.status}, completion=${Math.round(experience.completion * 100)}%, routes=${experience.routePatterns.join(', ') || 'n/a'}${experience.blockers[0] ? `, blocker=${compact(experience.blockers[0], 180)}` : ''}`,
      );
    }
    lines.push('');
  }
  if (snapshot.productVision.promiseToProductionDelta) {
    lines.push('## Promise To Production Delta');
    lines.push('');
    lines.push(
      `- Declared surfaces: ${snapshot.productVision.promiseToProductionDelta.declaredSurfaces}`,
    );
    lines.push(`- Real surfaces: ${snapshot.productVision.promiseToProductionDelta.realSurfaces}`);
    lines.push(
      `- Partial surfaces: ${snapshot.productVision.promiseToProductionDelta.partialSurfaces}`,
    );
    lines.push(
      `- Latent surfaces: ${snapshot.productVision.promiseToProductionDelta.latentSurfaces}`,
    );
    lines.push(
      `- Phantom surfaces: ${snapshot.productVision.promiseToProductionDelta.phantomSurfaces}`,
    );
    if (snapshot.productVision.promiseToProductionDelta.criticalGaps.length > 0) {
      lines.push('- Critical gaps:');
      for (const gap of snapshot.productVision.promiseToProductionDelta.criticalGaps) {
        lines.push(`  - ${compact(gap, 220)}`);
      }
    }
    lines.push('');
  }
  if (snapshot.parityGaps.gaps.length > 0) {
    lines.push('## Structural Parity Gaps');
    lines.push('');
    for (const gap of snapshot.parityGaps.gaps.slice(0, 10)) {
      lines.push(
        `- ${gap.title}: severity=${gap.severity}, mode=${gap.executionMode}${gap.routePatterns[0] ? `, route=${gap.routePatterns[0]}` : ''}, summary=${compact(gap.summary, 200)}`,
      );
    }
    lines.push('');
  }
  if (snapshot.capabilityState.capabilities.length > 0) {
    lines.push('## Capability Maturity');
    lines.push('');
    for (const capability of [...getProductFacingCapabilities(snapshot)]
      .sort(
        (left, right) =>
          left.maturity.score - right.maturity.score || left.name.localeCompare(right.name),
      )
      .slice(0, 10)) {
      lines.push(
        `- ${capability.name}: stage=${capability.maturity.stage}, score=${Math.round(capability.maturity.score * 100)}%, missing=${capability.maturity.missing.slice(0, 4).join(', ') || 'none'}`,
      );
    }
    lines.push('');
  }
  lines.push('## Top Blockers');
  lines.push('');
  if (snapshot.productVision.topBlockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of snapshot.productVision.topBlockers) {
      lines.push(`- ${compact(blocker, 320)}`);
    }
  }
  lines.push('');
  lines.push('## Next Work');
  lines.push('');
  if (decisionQueue.length === 0) {
    lines.push('- No convergence units open.');
  } else {
    for (const unit of decisionQueue.slice(0, 8)) {
      lines.push(
        `- [${unit.priority}] ${unit.title} | impact=${unit.productImpact} | mode=${unit.executionMode} | evidence=${unit.evidenceMode}/${unit.confidence} | risk=${unit.riskLevel} | ${compact(unit.visionDelta, 180)}`,
      );
    }
  }
  lines.push('');
  lines.push('## Cross-Artifact Consistency');
  lines.push('');
  const selfTrustReport = snapshot.certification.selfTrustReport;
  const consistencyCheck = selfTrustReport?.checks?.find(
    (c) => c.id === 'cross-artifact-consistency',
  );
  if (!consistencyCheck) {
    lines.push('- Not evaluated this run.');
  } else if (consistencyCheck.pass) {
    lines.push(
      `- PASS: all loaded PULSE artifacts are mutually consistent on shared fields (status, verdicts, counters, generatedAt).`,
    );
  } else {
    lines.push(
      `- FAIL: ${consistencyCheck.reason ?? 'PULSE artifacts disagree on shared fields'}.`,
    );
    lines.push(
      '- Self-trust is degraded until divergent artifacts are reconciled. The pulseSelfTrustPass gate is failing.',
    );
  }
  lines.push('');
  lines.push('## Cleanup');
  lines.push('');
  lines.push(`- Canonical dir: ${cleanupReport.canonicalDir}`);
  lines.push(`- Mirrors: ${cleanupReport.mirrors.join(', ')}`);
  lines.push(
    `- Removed legacy artifacts this run: ${cleanupReport.removedLegacyPulseArtifacts.length}`,
  );
  lines.push('');
  lines.push('## Truth Model');
  lines.push('');
  lines.push(
    '- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.',
  );
  lines.push(
    '- `inferred`: reconstructed from structure with no direct executed proof in this run.',
  );
  lines.push(
    '- `projected`: future-consistent product shape implied by connected latent structures.',
  );
  lines.push('');
  lines.push('## Safety');
  lines.push('');
  lines.push('- Governance-protected surfaces stay human-required.');
  lines.push('- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.');
  return lines.join('\n');
}

export function buildCertificate(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): string {
  return JSON.stringify(
    {
      projectId: snapshot.manifest?.projectId || 'unknown',
      projectName: snapshot.manifest?.projectName || 'unknown',
      commitSha: snapshot.certification.commitSha,
      environment: snapshot.certification.environment,
      timestamp: snapshot.certification.timestamp,
      status: snapshot.certification.status,
      humanReplacementStatus: snapshot.certification.humanReplacementStatus,
      score: snapshot.certification.score,
      rawScore: snapshot.certification.rawScore,
      certificationTarget: snapshot.certification.certificationTarget,
      blockingTier: snapshot.certification.blockingTier,
      gates: snapshot.certification.gates,
      criticalFailures: snapshot.certification.criticalFailures,
      dynamicBlockingReasons: snapshot.certification.dynamicBlockingReasons,
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
      convergencePlan: {
        totalUnits: convergencePlan.summary.totalUnits,
        humanRequiredUnits: convergencePlan.summary.humanRequiredUnits,
        observationOnlyUnits: convergencePlan.summary.observationOnlyUnits,
        topQueue: convergencePlan.queue.slice(0, 10),
      },
      evidenceSummary: snapshot.certification.evidenceSummary,
      gateEvidence: snapshot.certification.gateEvidence,
    },
    null,
    2,
  );
}
