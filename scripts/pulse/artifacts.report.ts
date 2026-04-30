/**
 * Pulse artifact report and certificate builders.
 */
import { compact } from './artifacts.io';
import {
  buildDecisionQueue,
  buildAutonomyQueue,
  normalizeArtifactExecutionMode,
  normalizeArtifactStatus,
  normalizeArtifactText,
  normalizeCanonicalArtifactValue,
} from './artifacts.queue';
import { buildAutonomyCycleProof } from './artifacts.autonomy';
import { buildFindingEventSurface } from './finding-event-surface';
import type {
  PulseArtifactSnapshot,
  PulseMachineReadiness,
  PulseMachineReadinessCriterion,
} from './artifacts.types';
import type { PulseAutonomyState, PulseConvergencePlan, PulseExecutionMatrixPath } from './types';
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

function statusFromBoolean(pass: boolean): PulseMachineReadinessCriterion['status'] {
  return pass ? 'pass' : 'fail';
}

function isCriticalMatrixPath(path: PulseExecutionMatrixPath): boolean {
  return path.risk === 'high' || path.risk === 'critical';
}

function hasPreciseTerminalReason(path: PulseExecutionMatrixPath): boolean {
  if (path.status === 'observed_pass' || path.status === 'observed_fail') {
    return true;
  }
  if (path.status === 'blocked_human_required') {
    return false;
  }
  const breakpoint = path.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}

function getTerminalCriticalPathDiagnostics(paths: PulseExecutionMatrixPath[]): {
  terminalWithoutObservedEvidence: number;
  firstTerminalPathId: string | null;
  nextAiSafeAction: string;
} {
  const terminalOnlyPaths = paths.filter(
    (path) =>
      isCriticalMatrixPath(path) &&
      path.status !== 'observed_pass' &&
      path.status !== 'observed_fail' &&
      hasPreciseTerminalReason(path),
  );
  const firstTerminalPath = terminalOnlyPaths[0] ?? null;
  return {
    terminalWithoutObservedEvidence: terminalOnlyPaths.length,
    firstTerminalPathId: firstTerminalPath?.pathId ?? null,
    nextAiSafeAction:
      firstTerminalPath?.validationCommand ??
      'node scripts/pulse/run.js --profile pulse-core-final --guidance --json',
  };
}

export function buildPulseMachineReadiness(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null = null,
): PulseMachineReadiness {
  const autonomyQueue = buildAutonomyQueue(convergencePlan);
  const boundedExecutableUnits = autonomyQueue.slice(0, 8);
  const boundedRunPass = boundedExecutableUnits.length > 0 && boundedExecutableUnits.length <= 8;
  const consistencyCheck = snapshot.certification.selfTrustReport?.checks?.find(
    (check) => check.id === 'cross-artifact-consistency',
  );
  const artifactConsistencyPass = consistencyCheck?.pass === true;
  const executionMatrixGate = snapshot.certification.gates.executionMatrixCompletePass;
  const criticalPathGate = snapshot.certification.gates.criticalPathObservedPass;
  const breakpointGate = snapshot.certification.gates.breakpointPrecisionPass;
  const externalSummary = snapshot.externalSignalState.summary;
  const externalRealityPass =
    externalSummary.missingAdapters === 0 &&
    externalSummary.staleAdapters === 0 &&
    externalSummary.invalidAdapters === 0;
  const selfTrustGate = snapshot.certification.gates.pulseSelfTrustPass;
  const selfTrustPass = selfTrustGate.status === 'pass';
  const multiCycleGate = snapshot.certification.gates.multiCycleConvergencePass;
  const cycleProof = buildAutonomyCycleProof(previousAutonomyState);
  const multiCyclePass = multiCycleGate.status === 'pass' && cycleProof.proven;
  const criticalPathDiagnostics = getTerminalCriticalPathDiagnostics(
    snapshot.executionMatrix.paths,
  );

  const criteria: PulseMachineReadinessCriterion[] = [
    {
      id: 'bounded_run',
      status: statusFromBoolean(boundedRunPass),
      reason: boundedRunPass
        ? `Bounded next autonomous cycle exposes ${boundedExecutableUnits.length} ai_safe unit(s).`
        : `No bounded ai_safe unit is available for the next PULSE-machine cycle.`,
      evidence: {
        nextExecutableUnitLimit: 8,
        boundedExecutableUnits: boundedExecutableUnits.length,
        totalAutonomousUnits: autonomyQueue.length,
        totalConvergenceUnits: convergencePlan.summary.totalUnits,
      },
    },
    {
      id: 'artifact_consistency',
      status: statusFromBoolean(artifactConsistencyPass),
      reason:
        consistencyCheck?.reason ??
        (artifactConsistencyPass
          ? 'Cross-artifact consistency passed.'
          : 'Cross-artifact consistency has not produced a passing check.'),
      evidence: {
        selfTrustOverallPass: snapshot.certification.selfTrustReport?.overallPass ?? null,
        selfTrustScore: snapshot.certification.selfTrustReport?.score ?? null,
      },
    },
    {
      id: 'execution_matrix',
      status: executionMatrixGate.status,
      reason: executionMatrixGate.reason,
      evidence: {
        totalPaths: snapshot.executionMatrix.summary.totalPaths,
        unknownPaths: snapshot.executionMatrix.summary.unknownPaths,
        criticalUnobservedPaths: snapshot.executionMatrix.summary.criticalUnobservedPaths,
        impreciseBreakpoints: snapshot.executionMatrix.summary.impreciseBreakpoints,
        coveragePercent: snapshot.executionMatrix.summary.coveragePercent,
      },
    },
    {
      id: 'critical_path_terminal',
      status: criticalPathGate.status,
      reason: criticalPathGate.reason,
      evidence: {
        criticalUnobservedPaths: snapshot.executionMatrix.summary.criticalUnobservedPaths,
        observedPass: snapshot.executionMatrix.summary.observedPass,
        observedFail: snapshot.executionMatrix.summary.observedFail,
        terminalWithoutObservedEvidence: criticalPathDiagnostics.terminalWithoutObservedEvidence,
        firstTerminalPathId: criticalPathDiagnostics.firstTerminalPathId,
        terminalArtifact: 'PULSE_EXECUTION_MATRIX.json',
        coverageArtifact: 'PULSE_PATH_COVERAGE.json',
        nextAiSafeAction: criticalPathDiagnostics.nextAiSafeAction,
      },
    },
    {
      id: 'breakpoint_precision',
      status: breakpointGate.status,
      reason: breakpointGate.reason,
      evidence: {
        impreciseBreakpoints: snapshot.executionMatrix.summary.impreciseBreakpoints,
        observedFail: snapshot.executionMatrix.summary.observedFail,
      },
    },
    {
      id: 'external_reality',
      status: statusFromBoolean(externalRealityPass),
      reason: externalRealityPass
        ? 'Required external adapters are fresh and available for PULSE-machine decisions.'
        : `${externalSummary.missingAdapters} missing, ${externalSummary.staleAdapters} stale, and ${externalSummary.invalidAdapters} invalid external adapter(s) remain.`,
      evidence: {
        totalSignals: externalSummary.totalSignals,
        mappedSignals: externalSummary.mappedSignals,
        requiredAdapters: externalSummary.requiredAdapters,
        optionalAdapters: externalSummary.optionalAdapters,
        observedAdapters: externalSummary.observedAdapters,
        blockingAdapters: externalSummary.blockingAdapters,
        missingAdapters: externalSummary.missingAdapters,
        staleAdapters: externalSummary.staleAdapters,
        invalidAdapters: externalSummary.invalidAdapters,
        highImpactSignals: externalSummary.highImpactSignals,
      },
    },
    {
      id: 'self_trust',
      status: selfTrustGate.status,
      reason: selfTrustGate.reason,
      evidence: {
        overallPass: snapshot.certification.selfTrustReport?.overallPass ?? null,
        confidence: snapshot.certification.selfTrustReport?.confidence ?? null,
        score: snapshot.certification.selfTrustReport?.score ?? null,
      },
    },
    {
      id: 'multi_cycle',
      status: statusFromBoolean(multiCyclePass),
      reason: multiCyclePass
        ? multiCycleGate.reason
        : `${multiCycleGate.reason} Cycle proof: ${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} successful non-regressing real cycle(s).`,
      evidence: {
        gateStatus: multiCycleGate.status,
        requiredCycles: cycleProof.requiredCycles,
        totalRecordedCycles: cycleProof.totalRecordedCycles,
        realExecutedCycles: cycleProof.realExecutedCycles,
        successfulNonRegressingCycles: cycleProof.successfulNonRegressingCycles,
        proven: cycleProof.proven,
      },
    },
  ];
  const blockers = criteria
    .filter((criterion) => criterion.status !== 'pass')
    .map((criterion) => `${criterion.id}: ${criterion.reason}`);
  const ready = blockers.length === 0;

  return {
    scope: 'pulse_machine_not_kloel_product',
    status: ready ? 'READY' : 'NOT_READY',
    generatedAt: snapshot.certification.timestamp,
    productCertificationStatus: snapshot.certification.status,
    productCertificationExcludedFromVerdict: true,
    canRunBoundedAutonomousCycle: boundedRunPass && artifactConsistencyPass && selfTrustPass,
    canDeclareKloelProductCertified: snapshot.certification.status === 'CERTIFIED',
    criteria,
    blockers,
  };
}

export function buildReport(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  cleanupReport: PulseArtifactCleanupReport,
  previousAutonomyState: PulseAutonomyState | null = null,
): string {
  const decisionQueue = buildDecisionQueue(convergencePlan);
  const pulseMachineReadiness = buildPulseMachineReadiness(
    snapshot,
    convergencePlan,
    previousAutonomyState,
  );
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
  const findingEventSurface = buildFindingEventSurface(snapshot.health.breaks, 8);

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

  lines.push('## PULSE Machine Readiness');
  lines.push('');
  lines.push(`- Machine readiness: ${pulseMachineReadiness.status}`);
  lines.push(`- Scope: ${pulseMachineReadiness.scope}`);
  lines.push(
    `- Product certification excluded from machine verdict: ${pulseMachineReadiness.productCertificationExcludedFromVerdict ? 'SIM' : 'NAO'} (${pulseMachineReadiness.productCertificationStatus})`,
  );
  lines.push(
    `- Can run bounded autonomous cycle: ${pulseMachineReadiness.canRunBoundedAutonomousCycle ? 'SIM' : 'NAO'}`,
  );
  lines.push(
    `- Can declare Kloel product certified: ${pulseMachineReadiness.canDeclareKloelProductCertified ? 'SIM' : 'NAO'}`,
  );
  for (const criterion of pulseMachineReadiness.criteria) {
    lines.push(`- ${criterion.id}: ${criterion.status.toUpperCase()} - ${criterion.reason}`);
  }
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
    `- Execution matrix: paths=${snapshot.executionMatrix.summary.totalPaths}, observedPass=${snapshot.executionMatrix.summary.observedPass}, observedFail=${snapshot.executionMatrix.summary.observedFail}, criticalUnobserved=${snapshot.executionMatrix.summary.criticalUnobservedPaths}, unknown=${snapshot.executionMatrix.summary.unknownPaths}`,
  );
  lines.push(
    `- Structural parity gaps: total=${snapshot.parityGaps.summary.totalGaps}, critical=${snapshot.parityGaps.summary.criticalGaps}, high=${snapshot.parityGaps.summary.highGaps}`,
  );
  lines.push(
    `- Finding events: totalSignals=${findingEventSurface.totalBreaks}, uniqueEvents=${findingEventSurface.uniqueEvents}, observed=${findingEventSurface.truthModeCounts.observed}, confirmedStatic=${findingEventSurface.truthModeCounts.confirmed_static}, weakSignals=${findingEventSurface.truthModeCounts.weak_signal}`,
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
  lines.push('## Dynamic Finding Events');
  lines.push('');
  lines.push(
    '- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.',
  );
  for (const event of findingEventSurface.topEvents) {
    lines.push(
      `- ${event.eventName}: count=${event.count}, truth=${event.truthMode}, action=${event.actionability}, falsePositiveRisk=${Math.round(event.falsePositiveRisk * 100)}%`,
    );
  }
  if (findingEventSurface.topEvents.length === 0) {
    lines.push('- No finding events detected.');
  }
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
        `- ${signal.source}/${signal.type}: impact=${Math.round(signal.impactScore * 100)}%, mode=${normalizeArtifactExecutionMode(signal.executionMode)}, mappedCapabilities=${signal.capabilityIds.length}, mappedFlows=${signal.flowIds.length}, summary=${compact(signal.summary, 200)}`,
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
        `- ${gap.title}: severity=${gap.severity}, mode=${normalizeArtifactExecutionMode(gap.executionMode)}${gap.routePatterns[0] ? `, route=${gap.routePatterns[0]}` : ''}, summary=${compact(gap.summary, 200)}`,
      );
    }
    lines.push('');
  }
  if (snapshot.executionMatrix.paths.length > 0) {
    lines.push('## Execution Matrix');
    lines.push('');
    lines.push(
      `- Coverage: ${snapshot.executionMatrix.summary.coveragePercent}% classified, unknown=${snapshot.executionMatrix.summary.unknownPaths}, criticalUnobserved=${snapshot.executionMatrix.summary.criticalUnobservedPaths}`,
    );
    for (const path of snapshot.executionMatrix.paths
      .filter((entry) => entry.status !== 'observed_pass')
      .slice(0, 10)) {
      lines.push(
        `- ${path.pathId}: status=${normalizeArtifactStatus(path.status)}, truth=${path.truthMode}, mode=${normalizeArtifactExecutionMode(path.executionMode)}, route=${path.routePatterns[0] ?? 'n/a'}${path.breakpoint ? `, breakpoint=${compact(path.breakpoint.reason, 160)}` : ''}`,
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
        `- [${unit.priority}] ${unit.title} | impact=${unit.productImpact} | mode=${normalizeArtifactExecutionMode(unit.executionMode)} | evidence=${unit.evidenceMode}/${unit.confidence} | risk=${unit.riskLevel} | ${compact(unit.visionDelta, 180)}`,
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
  lines.push('- Governance-protected surfaces stay governed by sandboxed validation.');
  lines.push('- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.');
  return lines.map(normalizeArtifactText).join('\n');
}

export function buildCertificate(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null = null,
): string {
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
      findingValidationState: {
        artifact: 'PULSE_FINDING_VALIDATION_STATE',
        operationalIdentity: 'dynamic_finding_event',
        internalBreakTypeIsOperationalIdentity: false,
        eventSurface: buildFindingEventSurface(snapshot.health.breaks, 20),
      },
      convergencePlan: {
        totalUnits: convergencePlan.summary.totalUnits,
        governedValidationUnits: convergencePlan.summary.humanRequiredUnits,
        observationOnlyUnits: convergencePlan.summary.observationOnlyUnits,
        topQueue: convergencePlan.queue.slice(0, 10),
      },
      evidenceSummary: snapshot.certification.evidenceSummary,
      gateEvidence: snapshot.certification.gateEvidence,
      pulseMachineReadiness,
    }),
    (_key, value) => (typeof value === 'string' ? normalizeArtifactText(value) : value),
    2,
  );
}
