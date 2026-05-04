import type { ContinuousDaemonState } from '../../types.continuous-daemon';
import type { BehaviorGraph } from '../../types.behavior-graph';
import {
  CERTIFICATE_ARTIFACT,
  DIRECTIVE_ARTIFACT,
  PATH_PROOF_EVIDENCE_ARTIFACT,
  PROBABILISTIC_RISK_ARTIFACT,
  PROOF_SYNTHESIS_ARTIFACT,
} from './types-and-constants';
import type {
  CalibrationValue,
  DaemonCalibrationSnapshot,
  PulseCertificateArtifact,
  PulseDirectiveArtifact,
  PathProofEvidenceArtifact,
  ProbabilisticRiskArtifact,
  ProofSynthesisArtifact,
} from './types-and-constants';
import { loadOptionalArtifact } from './signals-and-paths';
import { derived, calibrationFloor } from './planning';
import { deriveFileEvidenceDeficits } from './calibration-priority';
import { deriveKindPriority } from './calibration-priority';
import { deriveRiskPriority } from './calibration-priority';
import { deriveFileRiskImpact } from './calibration-priority';

// ── Calibration helpers ───────────────────────────────────────────────────────

export function deriveObservedRatio(observed: number, total: number): number {
  if (!observed || !total) return Math.sign(observed || total);
  return observed / total;
}

export function deriveTargetScore(
  graph: BehaviorGraph,
  certificate: PulseCertificateArtifact | null,
  directive: PulseDirectiveArtifact | null,
): CalibrationValue {
  let observedCeiling = deriveObservedScoreCeiling(graph, certificate, directive);
  if (Number.isFinite(certificate?.targetScore)) {
    return derived(certificate.targetScore, 'artifact', 'certificate.targetScore');
  }

  let checkpoint = directive?.targetCheckpoint;
  if (checkpoint) {
    let numericTargets = Object.values(checkpoint).filter((value): value is number =>
      Number.isFinite(value),
    );
    if (numericTargets.length) {
      let normalized = numericTargets.every((value) => value <= 1)
        ? Math.round(Math.max(...numericTargets) * 100)
        : Math.round(Math.max(...numericTargets));
      return derived(normalized, 'artifact', 'directive.targetCheckpoint');
    }
  }

  if (
    certificate?.certificationTarget ||
    certificate?.status ||
    directive?.productionAutonomyVerdict
  ) {
    return derived(
      observedCeiling,
      'evidence_graph',
      'certification objective projected from behavior graph score ceiling',
    );
  }

  return derived(
    observedCeiling,
    'weak_fallback',
    'DEFAULT_TARGET_SCORE without objective artifact',
  );
}

export function deriveObservedScoreCeiling(
  graph: BehaviorGraph,
  certificate: PulseCertificateArtifact | null,
  directive: PulseDirectiveArtifact | null,
): number {
  let currentScore = computeCurrentScore(graph);
  let artifactScores = [
    certificate?.targetScore,
    certificate?.rawScore,
    certificate?.score,
    ...Object.values(directive?.targetCheckpoint ?? {}).filter((value): value is number =>
      Number.isFinite(value),
    ),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  let artifactCeiling = Math.max(...artifactScores.map((value) => Math.ceil(value)), currentScore);
  let safeNodes = graph.summary.aiSafeNodes;
  if (graph.summary.totalNodes && safeNodes) {
    return Math.max(
      artifactCeiling,
      Math.ceil((currentScore * graph.summary.totalNodes) / safeNodes),
    );
  }
  return Math.max(artifactCeiling, graph.summary.totalNodes);
}

export function deriveMaxIterations(
  graph: BehaviorGraph,
  pathProof: PathProofEvidenceArtifact | null,
  proofSynthesis: ProofSynthesisArtifact | null,
  targetScore: number,
): CalibrationValue {
  let currentScore = computeCurrentScore(graph);
  let scoreGap = Math.max(
    Math.sign(targetScore || graph.summary.totalNodes),
    targetScore - currentScore,
  );
  let proofSummary = pathProof?.summary;
  let missingPathTasks = Math.max(
    proofSummary?.missingResult ?? Number(),
    proofSummary?.notObserved ?? Number(),
    (proofSynthesis?.summary?.plannedPlans ?? Number()) -
      (proofSynthesis?.summary?.observedPlans ?? Number()),
  );

  if (missingPathTasks) {
    let executableRatio = Math.max(
      Math.sign(missingPathTasks),
      Math.ceil(
        (proofSummary?.totalTasks ?? graph.summary.totalNodes) /
          Math.max(
            Math.sign(missingPathTasks),
            proofSummary?.executableTasks ?? Math.sign(missingPathTasks),
          ),
      ),
    );
    return derived(
      Math.max(scoreGap, Math.ceil(missingPathTasks / executableRatio)),
      'evidence_graph',
      'unobserved path/proof evidence divided by executable evidence ratio',
    );
  }

  if (graph.summary.totalNodes) {
    let autonomyDensity = Math.max(
      Math.sign(graph.summary.totalNodes),
      Math.ceil(
        graph.summary.totalNodes /
          Math.max(Math.sign(graph.summary.totalNodes), graph.summary.aiSafeNodes),
      ),
    );
    return derived(
      scoreGap * autonomyDensity,
      'artifact',
      'score gap scaled by behavior graph autonomy density',
    );
  }

  return derived(
    Math.max(Math.sign(targetScore || graph.summary.totalNodes), scoreGap),
    'graph_availability',
    'score gap from live behavior graph without proof evidence',
  );
}

export function deriveCooldownCycles(
  graph: BehaviorGraph,
  existing: ContinuousDaemonState | null,
  risk: ProbabilisticRiskArtifact | null,
): CalibrationValue {
  let recentFailures =
    existing?.cycles.filter((cycle) => cycle.result === 'blocked' || cycle.result === 'error') ??
    [];
  if (recentFailures.length) {
    let distinctUnits = new Set(recentFailures.map((cycle) => cycle.unitId).filter(Boolean));
    return derived(
      Math.max(Math.sign(recentFailures.length), distinctUnits.size),
      'history',
      'distinct blocked/error units in daemon history',
    );
  }

  let lowReliability = risk?.summary?.capabilitiesWithLowReliability;
  if (Number.isFinite(lowReliability) && lowReliability) {
    return derived(
      Math.max(
        Math.sign(lowReliability),
        Math.ceil(Math.log2(lowReliability + Math.sign(lowReliability))),
      ),
      'dynamic_risk',
      'low-reliability capability count from probabilistic risk',
    );
  }

  return derived(
    Math.max(
      Math.sign(graph.summary.totalNodes || graph.nodes.length),
      Math.ceil(
        Math.sqrt(
          Math.max(
            Math.sign(graph.summary.totalNodes || graph.nodes.length),
            graph.summary.aiSafeNodes,
          ),
        ),
      ),
    ),
    'graph_availability',
    'ai-safe availability square-root cooldown floor',
  );
}

export function deriveLeaseTtlMs(
  graph: BehaviorGraph,
  existing: ContinuousDaemonState | null,
): CalibrationValue {
  let durations = existing?.cycles
    .map((cycle) => cycle.durationMs)
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .sort((a, b) => a - b);

  if (durations?.length) {
    let percentileIndex = Math.max(
      Number(),
      Math.ceil(
        durations.length *
          deriveObservedRatio(durations.length, existing?.cycles.length ?? durations.length),
      ) - Math.sign(durations.length),
    );
    return derived(durations[percentileIndex], 'history', 'p90 daemon cycle duration');
  }

  let graphGeneratedAt = new Date(graph.generatedAt).getTime();
  let graphAgeMs = Number.isFinite(graphGeneratedAt) ? Date.now() - graphGeneratedAt : 0;
  let availabilityMs = Math.max(
    graphAgeMs,
    Math.ceil(
      process.uptime() *
        Math.max(
          Math.sign(graph.nodes.length || graph.summary.totalNodes),
          graph.summary.aiSafeNodes + graph.summary.totalNodes,
        ),
    ),
  );
  return derived(
    Math.max(Math.sign(graph.nodes.length || graph.summary.totalNodes), availabilityMs),
    'weak_fallback',
    'LEASE_TTL_MS without duration history',
  );
}

export function derivePlanningFailureCeiling(
  graph: BehaviorGraph,
  existing: ContinuousDaemonState | null,
  risk: ProbabilisticRiskArtifact | null,
): CalibrationValue {
  let blockedOrErrorCycles =
    existing?.cycles.filter((cycle) => cycle.result === 'blocked' || cycle.result === 'error') ??
    [];
  if (blockedOrErrorCycles.length) {
    let distinctUnits = new Set(blockedOrErrorCycles.map((cycle) => cycle.unitId).filter(Boolean));
    return derived(
      Math.max(Math.sign(blockedOrErrorCycles.length), distinctUnits.size),
      'history',
      'distinct blocked/error daemon units before stopping planning',
    );
  }

  let lowReliability = risk?.summary?.capabilitiesWithLowReliability;
  if (Number.isFinite(lowReliability) && lowReliability) {
    return derived(
      Math.max(Math.sign(lowReliability), Math.ceil(Math.sqrt(lowReliability))),
      'dynamic_risk',
      'low-reliability capability breadth before stopping planning',
    );
  }

  return derived(
    Math.max(
      Math.sign(graph.nodes.length || graph.summary.totalNodes),
      Math.ceil(
        Math.sqrt(
          Math.max(
            Math.sign(graph.nodes.length || graph.summary.totalNodes),
            graph.summary.totalNodes,
          ),
        ),
      ),
    ),
    'graph_availability',
    'behavior graph breadth before stopping planning',
  );
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function computeCurrentScore(graph: BehaviorGraph): number {
  let totalNodes = graph.summary.totalNodes;
  if (!totalNodes) return Number();
  let aiSafeNodes = graph.summary.aiSafeNodes;
  let automatableTarget = totalNodes;
  if (!automatableTarget) return Number();
  return Math.round((aiSafeNodes / automatableTarget) * totalNodes);
}

// ── Dynamic daemon calibration ────────────────────────────────────────────────

export function buildDaemonCalibration(
  rootDir: string,
  graph: BehaviorGraph,
  existing: ContinuousDaemonState | null,
): DaemonCalibrationSnapshot {
  let certificate = loadOptionalArtifact<PulseCertificateArtifact>(rootDir, CERTIFICATE_ARTIFACT);
  let directive = loadOptionalArtifact<PulseDirectiveArtifact>(rootDir, DIRECTIVE_ARTIFACT);
  let proofSynthesis = loadOptionalArtifact<ProofSynthesisArtifact>(
    rootDir,
    PROOF_SYNTHESIS_ARTIFACT,
  );
  let pathProof = loadOptionalArtifact<PathProofEvidenceArtifact>(
    rootDir,
    PATH_PROOF_EVIDENCE_ARTIFACT,
  );
  let risk = loadOptionalArtifact<ProbabilisticRiskArtifact>(rootDir, PROBABILISTIC_RISK_ARTIFACT);

  let targetScore = deriveTargetScore(graph, certificate, directive);
  let fileEvidenceDeficits = deriveFileEvidenceDeficits(proofSynthesis);
  let kindPriority = deriveKindPriority(graph, proofSynthesis);
  let riskPriority = deriveRiskPriority(graph, risk);
  let fileRiskImpact = deriveFileRiskImpact(risk);
  let maxIterations = deriveMaxIterations(graph, pathProof, proofSynthesis, targetScore.value);
  let cooldownCycles = deriveCooldownCycles(graph, existing, risk);
  let leaseTtlMs = deriveLeaseTtlMs(graph, existing);
  let planningFailureCeiling = derivePlanningFailureCeiling(graph, existing, risk);

  return {
    generatedAt: new Date().toISOString(),
    targetScore,
    maxIterations,
    cooldownCycles,
    leaseTtlMs,
    planningFailureCeiling,
    kindPriority,
    riskPriority,
    fileEvidenceDeficits,
    fileRiskImpact,
    weakFallbacks: [
      targetScore,
      maxIterations,
      cooldownCycles,
      leaseTtlMs,
      planningFailureCeiling,
      ...Object.values(kindPriority),
      ...Object.values(riskPriority),
    ]
      .filter((entry) => entry.source === 'graph_availability' || entry.source === 'weak_fallback')
      .map((entry) => entry.detail),
  };
}
