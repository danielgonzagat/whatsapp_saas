/**
 * Continuous Daemon — autonomous loop orchestration engine (PLANNER MODE).
 *
 * Wave 8, Module A.
 *
 * The continuous daemon is an AUTONOMY PLANNER: it generates the plan for
 * what an autonomous loop WOULD do, without actually editing files or
 * committing changes. Each iteration picks the highest-value ai_safe unit
 * from the behavior graph, acquires a file lease, plans the test harness,
 * validates the strategy, and records the expected outcome.
 *
 * State is persisted to `.pulse/current/PULSE_AUTONOMY_STATE.json`.
 */

import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { resolveRoot } from './lib/safe-path';
import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
} from './types.continuous-daemon';
import type { BehaviorGraph, BehaviorNode } from './types.behavior-graph';
import { evaluateExecutorCycleMateriality } from './autonomous-executor-policy';
import {
  deriveZeroValue,
  deriveUnitValue,
  discoverAllObservedArtifactFilenames,
} from './dynamic-reality-kernel';

// ── Constants ─────────────────────────────────────────────────────────────────

let AUTONOMY_STATE_FILENAME = 'PULSE_AUTONOMY_STATE.json';
const ARTIFACTS = discoverAllObservedArtifactFilenames();
let BEHAVIOR_GRAPH_ARTIFACT = `.pulse/current/${ARTIFACTS.behaviorGraph}`;
let CERTIFICATE_ARTIFACT = `.pulse/current/${ARTIFACTS.certificate}`;
let DIRECTIVE_ARTIFACT = `.pulse/current/${ARTIFACTS.cliDirective}`;
let PROOF_SYNTHESIS_ARTIFACT = '.pulse/current/PULSE_PROOF_SYNTHESIS.json';
let PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';
let PROBABILISTIC_RISK_ARTIFACT = '.pulse/current/PULSE_PROBABILISTIC_RISK.json';

// ── Lease constants ───────────────────────────────────────────────────────────

let LEASE_DIR = '.pulse/leases';

type CalibrationSource =
  | 'artifact'
  | 'history'
  | 'evidence_graph'
  | 'dynamic_risk'
  | 'graph_availability'
  | 'weak_fallback';

interface CalibrationValue {
  value: number;
  source: CalibrationSource;
  detail: string;
}

interface DaemonCalibrationSnapshot {
  generatedAt: string;
  targetScore: CalibrationValue;
  maxIterations: CalibrationValue;
  cooldownCycles: CalibrationValue;
  leaseTtlMs: CalibrationValue;
  planningFailureCeiling: CalibrationValue;
  kindPriority: Record<string, CalibrationValue>;
  riskPriority: Record<string, CalibrationValue>;
  fileEvidenceDeficits: Record<string, number>;
  fileRiskImpact: Record<string, number>;
  weakFallbacks: string[];
}

type CalibratedDaemonState = ContinuousDaemonState & {
  calibration?: DaemonCalibrationSnapshot;
};

interface PulseCertificateArtifact {
  status?: string;
  score?: number;
  rawScore?: number;
  certificationTarget?: {
    final?: boolean | null;
    tier?: string | null;
    profile?: string | null;
    certificationScope?: string | null;
  } | null;
  targetScore?: number;
  objective?: string;
}

interface PulseDirectiveArtifact {
  productionAutonomyVerdict?: string;
  autonomyVerdict?: string;
  targetCheckpoint?: Record<string, number | string | boolean | null>;
  visionGap?: string;
}

interface PathProofEvidenceArtifact {
  summary?: {
    totalTasks?: number;
    executableTasks?: number;
    missingResult?: number;
    notObserved?: number;
  };
}

interface ProofSynthesisArtifact {
  summary?: {
    totalPlans?: number;
    observedPlans?: number;
    plannedPlans?: number;
  };
  targets?: ProofSynthesisTarget[];
}

interface ProofSynthesisTarget {
  filePath?: string;
  sourceKind?: string;
  plans?: Array<{
    observed?: boolean;
    countsAsObserved?: boolean;
  }>;
}

interface ProbabilisticRiskArtifact {
  summary?: {
    avgReliability?: number;
    minReliability?: number;
    capabilitiesWithLowReliability?: number;
  };
  reliabilities?: Array<{
    capabilityId?: string;
    capabilityName?: string;
    expectedImpact?: number;
    reliabilityP?: number;
    observations?: number;
  }>;
}

interface FileLease {
  filePath: string;
  unitId: string;
  iteration: number;
  acquiredAt: string;
  expiresAt: string;
  agentId: string;
}

// ── Daemon-level signal state ─────────────────────────────────────────────────

let shutdownRequested = Boolean(deriveZeroValue());

function onSignal(signal: string): void {
  if (shutdownRequested) {
    process.exit(deriveZeroValue());
  }
  shutdownRequested = Boolean(deriveUnitValue());
  if (process.env.PULSE_CONTINUOUS_DEBUG === '1') {
    console.warn(`[continuous-daemon] Received ${signal}, initiating graceful shutdown...`);
  }
}

function installSignalHandlers(): void {
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}

function uninstallSignalHandlers(): void {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function autonomyStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_STATE_FILENAME);
}

function behaviorGraphPath(rootDir: string): string {
  return path.join(rootDir, BEHAVIOR_GRAPH_ARTIFACT);
}

function leaseDirPath(rootDir: string): string {
  return path.join(rootDir, LEASE_DIR);
}

function leaseFilePath(rootDir: string, filePath: string): string {
  let safeName = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 120);
  return path.join(leaseDirPath(rootDir), `${safeName}.lease.json`);
}

// ── State I/O ────────────────────────────────────────────────────────────────

function loadAutonomyState(rootDir: string): ContinuousDaemonState | null {
  let filePath = autonomyStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<ContinuousDaemonState>(filePath);
  } catch {
    return null;
  }
}

function saveAutonomyState(rootDir: string, state: ContinuousDaemonState): void {
  let filePath = autonomyStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: Boolean(deriveUnitValue()) });
  state.generatedAt = new Date().toISOString();
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

function loadOptionalArtifact<T>(rootDir: string, artifactPath: string): T | null {
  let fullPath = path.join(rootDir, artifactPath);
  if (!pathExists(fullPath)) return null;
  try {
    return readJsonFile<T>(fullPath);
  } catch {
    return null;
  }
}

// ── Behavior graph loading ───────────────────────────────────────────────────

function loadBehaviorGraph(rootDir: string): BehaviorGraph | null {
  let artifactPath = behaviorGraphPath(rootDir);
  if (!pathExists(artifactPath)) return null;
  try {
    return readJsonFile<BehaviorGraph>(artifactPath);
  } catch {
    return null;
  }
}

// ── Dynamic daemon calibration ────────────────────────────────────────────────

function buildDaemonCalibration(
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

function derived(value: number, source: CalibrationSource, detail: string): CalibrationValue {
  return { value, source, detail };
}

function deriveObservedRatio(observed: number, total: number): number {
  if (!observed || !total) return Math.sign(observed || total);
  return observed / total;
}

function nextCycleIteration(state: ContinuousDaemonState): number {
  return (
    state.totalCycles +
    Math.sign(state.cycles.length || state.totalCycles || Number.POSITIVE_INFINITY)
  );
}

function incrementCount(counts: Record<string, number>, key: string, evidence: number): void {
  let previous = Number(counts[key]);
  counts[key] = (Number.isFinite(previous) ? previous : Number()) + Math.sign(evidence);
}

function hasEntries(record: Record<string, number>): boolean {
  return Boolean(Object.keys(record).length);
}

function calibrationFloor(evidence: number): number {
  return Math.sign(evidence || Number.POSITIVE_INFINITY);
}

function deriveTargetScore(
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
      let normalized = numericTargets.every((value) => value <= deriveUnitValue())
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

function deriveObservedScoreCeiling(
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

function deriveMaxIterations(
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

function deriveCooldownCycles(
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

function deriveLeaseTtlMs(
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

function derivePlanningFailureCeiling(
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

function deriveFileEvidenceDeficits(
  proofSynthesis: ProofSynthesisArtifact | null,
): Record<string, number> {
  let deficits: Record<string, number> = {};
  for (let target of proofSynthesis?.targets ?? []) {
    if (!target.filePath) continue;
    let missingPlans = (target.plans ?? []).filter(
      (plan) =>
        plan.observed !== Boolean(deriveUnitValue()) &&
        plan.countsAsObserved !== Boolean(deriveUnitValue()),
    ).length;
    if (missingPlans > deriveZeroValue()) {
      deficits[target.filePath] = (deficits[target.filePath] ?? deriveZeroValue()) + missingPlans;
    }
  }
  return deficits;
}

function deriveKindPriority(
  graph: BehaviorGraph,
  proofSynthesis: ProofSynthesisArtifact | null,
): Record<string, CalibrationValue> {
  let counts: Record<string, number> = {};
  for (let target of proofSynthesis?.targets ?? []) {
    let kind = normalizeProofSourceKind(target.sourceKind);
    if (!kind) continue;
    let missingPlans = (target.plans ?? []).filter(
      (plan) =>
        plan.observed !== Boolean(deriveUnitValue()) &&
        plan.countsAsObserved !== Boolean(deriveUnitValue()),
    ).length;
    incrementCount(counts, kind, missingPlans);
  }

  if (hasEntries(counts)) {
    return mapCountsToCalibration(
      counts,
      'evidence_graph',
      'unobserved proof plans by behavior kind',
    );
  }

  for (let node of graph.nodes) {
    incrementCount(counts, node.kind, graph.nodes.length);
  }

  if (hasEntries(counts)) {
    return mapCountsToCalibration(counts, 'artifact', 'behavior graph node distribution');
  }

  return {};
}

function deriveRiskPriority(
  graph: BehaviorGraph,
  risk: ProbabilisticRiskArtifact | null,
): Record<string, CalibrationValue> {
  let counts: Record<string, number> = {};
  for (let node of graph.nodes) {
    if (!isAiSafeNode(node)) continue;
    incrementCount(counts, node.risk, graph.summary.aiSafeNodes || graph.nodes.length);
  }

  if (risk?.summary?.avgReliability !== undefined) {
    let uncertaintyBoost = Math.max(
      deriveUnitValue(),
      Math.round((deriveUnitValue() - risk.summary.avgReliability) * 10),
    );
    for (let key of Object.keys(counts)) {
      counts[key] += uncertaintyBoost;
    }
    return mapCountsToCalibration(
      counts,
      'dynamic_risk',
      'ai-safe risk bins boosted by reliability gap',
    );
  }

  if (hasEntries(counts)) {
    return mapCountsToCalibration(counts, 'artifact', 'ai-safe behavior risk distribution');
  }

  return {};
}

function mapCountsToCalibration(
  counts: Record<string, number>,
  source: CalibrationSource,
  detail: string,
): Record<string, CalibrationValue> {
  let values = Object.values(counts);
  let max = Math.max(...values, calibrationFloor(values.length));
  let result: Record<string, CalibrationValue> = {};
  for (let [key, count] of Object.entries(counts)) {
    result[key] = derived(
      Math.max(calibrationFloor(count), Math.round((count / max) * Math.max(...values))),
      source,
      detail,
    );
  }
  return result;
}

function normalizeProofSourceKind(sourceKind: string | undefined): string | null {
  switch (sourceKind) {
    case 'endpoint':
      return 'api_endpoint';
    case 'pure_function':
      return 'function_definition';
    case 'worker':
      return 'queue_consumer';
    case 'webhook':
      return 'webhook_receiver';
    case 'state_mutation':
      return 'db_writer';
    case 'ui_action':
      return 'ui_action';
    default:
      return sourceKind ?? null;
  }
}

function deriveFileRiskImpact(risk: ProbabilisticRiskArtifact | null): Record<string, number> {
  let impacts: Record<string, number> = {};
  let reliabilities = risk?.reliabilities ?? [];
  let maxImpact = Math.max(
    ...reliabilities.map((entry) => entry.expectedImpact ?? Number()),
    Number(),
  );
  if (!maxImpact) return impacts;

  for (let entry of reliabilities) {
    let id = entry.capabilityId ?? entry.capabilityName;
    let expectedImpact = entry.expectedImpact ?? Number();
    if (!id || !expectedImpact) continue;
    impacts[normalizeCapabilityToken(id)] = Math.round(
      (expectedImpact / maxImpact) *
        Math.max(
          ...reliabilities.map((item) => item.observations ?? Number()),
          calibrationFloor(reliabilities.length),
        ),
    );
  }
  return impacts;
}

function normalizeCapabilityToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/^capability:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function riskImpactForFile(filePath: string, fileRiskImpact: Record<string, number>): number {
  let normalizedPath = normalizeCapabilityToken(filePath);
  let maxImpact = Number();
  for (let [token, impact] of Object.entries(fileRiskImpact)) {
    if (token && normalizedPath.includes(token)) {
      maxImpact = Math.max(maxImpact, impact);
    }
  }
  return maxImpact;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeCurrentScore(graph: BehaviorGraph): number {
  let totalNodes = graph.summary.totalNodes;
  if (!totalNodes) return Number();
  let aiSafeNodes = graph.summary.aiSafeNodes;
  // Score: ratio of ai_safe vs total discovered nodes; PULSE should not remove
  // nodes from the autonomy denominator by routing them to humans.
  let automatableTarget = totalNodes;
  if (!automatableTarget) return Number();
  return Math.round((aiSafeNodes / automatableTarget) * totalNodes);
}

// ── Unit selection ────────────────────────────────────────────────────────────

function isAiSafeNode(node: BehaviorNode): node is BehaviorNode & { executionMode: 'ai_safe' } {
  return node.executionMode === 'ai_safe';
}

interface PlannedUnit {
  unitId: string;
  filePath: string;
  name: string;
  kind: string;
  risk: string;
  priority: number;
  prioritySource: string;
  strategy: string;
}

/**
 * Pick the highest-value ai_safe unit from the behavior graph.
 *
 * Priority scoring:
 *   - kind priority is derived from unobserved proof/evidence graph gaps
 *   - risk priority is derived from behavior graph risk distribution and dynamic risk
 *   - prefers units with observability (hasLogging, hasMetrics, hasTracing)
 *   - excludes recently planned units (cooldown)
 *
 * @param graph       The behavior graph containing all nodes.
 * @param recentUnits Set of unit IDs from recent cycles to exclude.
 * @param calibration Dynamic daemon calibration loaded from PULSE artifacts/history.
 * @returns The selected unit with a strategy description, or null.
 */
function pickNextUnit(
  graph: BehaviorGraph,
  recentUnits: Set<string>,
  calibration: DaemonCalibrationSnapshot,
): PlannedUnit | null {
  let aiSafeNodes = graph.nodes.filter(
    (n): n is BehaviorNode & { executionMode: 'ai_safe' } => n.executionMode === 'ai_safe',
  );

  if (!aiSafeNodes.length) return null;

  let eligible = aiSafeNodes.filter((n) => !recentUnits.has(n.id));

  if (!eligible.length) {
    // All units on cooldown — relax cooldown and retry
    let allEligible = aiSafeNodes;
    let scored = allEligible.map((node) => ({
      node,
      score: scoreNodePriority(node, calibration),
    }));
    scored.sort((a, b) => b.score - a.score);
    let best = scored[0];
    if (!best) return null;
    return buildPlannedUnit(best.node, best.score, calibration);
  }

  let scored = eligible.map((node) => ({
    node,
    score: scoreNodePriority(node, calibration),
  }));

  scored.sort((a, b) => b.score - a.score);
  let best = scored[0];
  if (!best) return null;
  return buildPlannedUnit(best.node, best.score, calibration);
}

function scoreNodePriority(node: BehaviorNode, calibration: DaemonCalibrationSnapshot): number {
  return (
    (calibration.kindPriority[node.kind]?.value ?? Number()) +
    (calibration.riskPriority[node.risk]?.value ?? Number()) +
    (calibration.fileEvidenceDeficits[node.filePath] ?? Number()) +
    riskImpactForFile(node.filePath, calibration.fileRiskImpact) +
    (node.hasLogging ? 1 : 0) +
    (node.hasMetrics ? 1 : 0) +
    (node.hasTracing ? 1 : 0)
  );
}

function buildPlannedUnit(
  node: BehaviorNode,
  priority: number,
  calibration: DaemonCalibrationSnapshot,
): PlannedUnit {
  let strategyParts: string[] = [];

  if (node.hasErrorHandler) {
    strategyParts.push('unit already has error handler — validate coverage');
  } else {
    strategyParts.push('add try/catch error boundary');
  }

  if (!node.hasLogging) strategyParts.push('add structured logging');
  if (!node.hasMetrics) strategyParts.push('add metrics instrumentation');
  if (!node.hasTracing) strategyParts.push('add tracing span');
  if ((calibration.fileEvidenceDeficits[node.filePath] ?? deriveZeroValue()) > deriveZeroValue()) {
    strategyParts.push('close unobserved proof plans from evidence graph');
  }
  if (riskImpactForFile(node.filePath, calibration.fileRiskImpact) > deriveZeroValue()) {
    strategyParts.push('prioritize dynamic-risk capability impact');
  }

  let strategy =
    strategyParts.length > 0
      ? strategyParts.join('; ')
      : `validate unit ${node.name} idempotency and error paths`;

  return {
    unitId: node.id,
    filePath: node.filePath,
    name: node.name,
    kind: node.kind,
    risk: node.risk,
    priority,
    prioritySource: [
      calibration.kindPriority[node.kind]?.source ?? String(calibration.kindPriority[node.kind]),
      calibration.riskPriority[node.risk]?.source ?? String(calibration.riskPriority[node.risk]),
    ].join('+'),
    strategy,
  };
}

// ── File leasing ──────────────────────────────────────────────────────────────

/**
 * Acquire a lease on a file to prevent concurrent work on the same unit.
 *
 * Leases are stored as JSON files in `.pulse/leases/` with a TTL calibrated
 * from daemon history or live graph freshness.
 * Returns `true` if the lease was acquired, `false` if the file is already
 * leased (and the lease has not expired).
 */
function acquireFileLease(
  rootDir: string,
  filePath: string,
  unitId: string,
  iteration: number,
  leaseTtlMs: number,
): boolean {
  ensureDir(leaseDirPath(rootDir), { recursive: Boolean(deriveUnitValue()) });
  let leasePath = leaseFilePath(rootDir, filePath);

  // Check existing lease
  if (pathExists(leasePath)) {
    try {
      let existing: FileLease = readJsonFile<FileLease>(leasePath);
      let expiresAt = new Date(existing.expiresAt).getTime();
      if (Date.now() < expiresAt) {
        return Boolean(deriveZeroValue()); // Active lease exists
      }
      // Lease expired — we can overwrite
    } catch {
      // Corrupt lease file — overwrite
    }
  }

  let now = new Date();
  let lease: FileLease = {
    filePath,
    unitId,
    iteration,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString(),
    agentId: `pulse-planner-${process.pid ?? 'unknown'}`,
  };

  writeTextFile(leasePath, JSON.stringify(lease, null, 2));
  return Boolean(lease);
}

/**
 * Release a file lease after a planning cycle completes.
 */
function releaseFileLease(rootDir: string, filePath: string): void {
  let leasePath = leaseFilePath(rootDir, filePath);
  try {
    if (pathExists(leasePath)) {
      let fs = require('fs');
      fs.unlinkSync(leasePath);
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Release all active leases for the current agent.
 */
function releaseAllLeases(rootDir: string): void {
  let dirPath = leaseDirPath(rootDir);
  if (!pathExists(dirPath)) return;

  try {
    let fs = require('fs');
    let entries = fs.readdirSync(dirPath);
    let agentId = `pulse-planner-${process.pid ?? 'unknown'}`;
    for (let entry of entries) {
      if (!entry.endsWith('.lease.json')) continue;
      let fullPath = path.join(dirPath, entry);
      try {
        let lease: FileLease = readJsonFile<FileLease>(fullPath);
        if (lease.agentId === agentId) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Best-effort
  }
}

// ── Test plan generation ──────────────────────────────────────────────────────

/**
 * Generate a test plan for the selected unit.
 *
 * As an autonomy planner, we produce the strategy and test steps that would
 * be executed, without actually running any tests or modifying code.
 */
function generateTestPlan(unit: PlannedUnit): string {
  let lines: string[] = [
    `Unit: ${unit.name} (${unit.kind}, risk=${unit.risk})`,
    `File: ${unit.filePath}`,
    '',
    'Strategy:',
    ...unit.strategy.split('; ').map((s) => `  - ${s.trim()}`),
    '',
    'Planned validation steps:',
    '  1. Verify unit is reachable via call graph (not orphan)',
    '  2. Check existing error handling coverage',
    '  3. Check existing observability instrumentation',
    '  4. Plan targeted test harness for edge cases',
    '  5. Verify no cross-unit side effects',
    '',
    `Expected outcome: ${unit.kind === 'api_endpoint' ? 'Endpoint validated with test coverage' : 'Unit instrumentation added and validated'}`,
  ];

  return lines.join('\n');
}

// ── Cycle tracking ────────────────────────────────────────────────────────────

function recordCycle(
  state: ContinuousDaemonState,
  unitId: string | null,
  phase: DaemonCycle['phase'],
  result: DaemonCycleResult,
  filesChanged: string[],
  startedAt: string,
  summary: string,
): DaemonCycle {
  let finishedAt = new Date().toISOString();
  let durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  let cycle: DaemonCycle = {
    iteration: nextCycleIteration(state),
    phase,
    unitId,
    agent: 'autonomy-planner',
    result,
    filesChanged,
    scoreBefore: state.currentScore,
    scoreAfter: state.currentScore,
    durationMs,
    startedAt,
    finishedAt,
    summary,
  };

  return cycle;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the continuous daemon autonomy planner loop.
 *
 * The daemon repeatedly:
 * 1. Loads the behavior graph to discover ai_safe units
 * 2. Picks the highest-value ai_safe unit
 * 3. Acquires a file lease to prevent concurrent work
 * 4. Generates a test plan and validation strategy
 * 5. Records the planned outcome
 *
 * This is a PLANNER — it does NOT modify code, commit changes, or execute
 * external agents. Each cycle records what WOULD be done.
 *
 * State is persisted to `.pulse/current/PULSE_AUTONOMY_STATE.json` after
 * every cycle.
 *
 * @param rootDir  Absolute or relative path to the repository root.
 * @param options  Optional externally supplied cycle ceiling.
 * @returns The final autonomy state after the loop terminates.
 */
export function startContinuousDaemon(
  rootDir: string,
  options: { maxCycles?: number } = {},
): ContinuousDaemonState {
  let resolvedRoot = resolveRoot(rootDir);

  let existing = loadAutonomyState(resolvedRoot);
  let now = new Date().toISOString();

  let state: CalibratedDaemonState;

  if (existing && existing.status === 'running') {
    state = existing;
  } else {
    state = {
      generatedAt: now,
      startedAt: existing?.startedAt ?? now,
      totalCycles: deriveZeroValue(),
      improvements: deriveZeroValue(),
      regressions: deriveZeroValue(),
      rollbacks: deriveZeroValue(),
      currentScore: Number(),
      targetScore: existing?.targetScore ?? Number(),
      milestones: [],
      cycles: [],
      status: 'running',
      eta: null,
    };
  }

  installSignalHandlers();

  // Load behavior graph for unit selection
  let behaviorGraph = loadBehaviorGraph(resolvedRoot);

  if (!behaviorGraph || !behaviorGraph.nodes.length) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: deriveUnitValue(),
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: Number(),
      scoreAfter: Number(),
      durationMs: deriveZeroValue(),
      startedAt: now,
      finishedAt: now,
      summary: 'No behavior graph available — generate PULSE_BEHAVIOR_GRAPH.json first',
    });
    state.totalCycles = deriveUnitValue();
    saveAutonomyState(resolvedRoot, state);
    uninstallSignalHandlers();
    return state;
  }

  let initialScore = computeCurrentScore(behaviorGraph);
  let calibration = buildDaemonCalibration(resolvedRoot, behaviorGraph, existing);
  let maxCycles = options.maxCycles ?? calibration.maxIterations.value;
  state.currentScore = initialScore;
  state.targetScore = calibration.targetScore.value;
  state.calibration = calibration;

  let consecutiveFailures = deriveZeroValue();

  while (!shutdownRequested && state.status === 'running' && state.totalCycles < maxCycles) {
    let cycleStartedAt = new Date().toISOString();

    // ── Re-read behavior graph each cycle to get fresh state ──
    let freshGraph = loadBehaviorGraph(resolvedRoot);
    if (!freshGraph || !freshGraph.nodes.length) {
      state.status = 'stopped';
      let cycle = recordCycle(
        state,
        null,
        'scanning',
        'blocked',
        [],
        cycleStartedAt,
        'Behavior graph disappeared — stopping daemon',
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      break;
    }

    let calibrationHistory = state.cycles.length > 0 ? state : existing;
    let freshCalibration = buildDaemonCalibration(resolvedRoot, freshGraph, calibrationHistory);
    let newScore = computeCurrentScore(freshGraph);
    state.currentScore = newScore;
    state.targetScore = freshCalibration.targetScore.value;
    state.calibration = freshCalibration;

    // Check if certified
    if (state.currentScore >= state.targetScore) {
      state.status = 'certified';
      let cycle = recordCycle(
        state,
        null,
        'idle',
        'improvement',
        [],
        cycleStartedAt,
        `Target score ${state.targetScore} reached (current: ${state.currentScore})`,
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      break;
    }

    // Cooldown: don't re-plan recently planned units
    let recentUnits = new Set<string>();
    let recentCycles = state.cycles.slice(-freshCalibration.cooldownCycles.value);
    for (let cycle of recentCycles) {
      if (cycle.unitId && (cycle.result === 'error' || cycle.result === 'blocked')) {
        recentUnits.add(cycle.unitId);
      }
    }

    // Step 1: Pick highest-value ai_safe unit
    let planned = pickNextUnit(freshGraph, recentUnits, freshCalibration);

    if (!planned) {
      if (consecutiveFailures >= freshCalibration.planningFailureCeiling.value) {
        state.status = 'stopped';
        let cycle = recordCycle(
          state,
          null,
          'planning',
          'blocked',
          [],
          cycleStartedAt,
          `No ai_safe units available after ${freshCalibration.planningFailureCeiling.value} dynamically calibrated attempts`,
        );
        state.cycles.push(cycle);
        state.totalCycles++;
        saveAutonomyState(resolvedRoot, state);
        break;
      }

      consecutiveFailures++;
      let cycle = recordCycle(
        state,
        null,
        'planning',
        'blocked',
        [],
        cycleStartedAt,
        'No eligible ai_safe unit found',
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      continue;
    }

    // Step 2: Acquire file lease
    let leaseAcquired = acquireFileLease(
      resolvedRoot,
      planned.filePath,
      planned.unitId,
      nextCycleIteration(state),
      freshCalibration.leaseTtlMs.value,
    );

    if (!leaseAcquired) {
      let cycle = recordCycle(
        state,
        planned.unitId,
        'planning',
        'blocked',
        [],
        cycleStartedAt,
        `File lease conflict for ${planned.filePath} — another agent holds the lock`,
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      consecutiveFailures++;
      saveAutonomyState(resolvedRoot, state);
      continue;
    }

    // Step 3: Generate test plan
    let testPlan = generateTestPlan(planned);

    // Step 4: Validate strategy (planning-level validation)
    let hasStrategy = planned.strategy.length > 0;
    let hasTestSteps = testPlan.includes('Planned validation steps:');

    let cycleResult: DaemonCycleResult;
    let cycleSummary: string;

    if (hasStrategy && hasTestSteps) {
      let materiality = evaluateExecutorCycleMateriality({
        daemonMode: 'planner',
        sandboxResult: null,
        validationResult: null,
        beforeAfterMetric: null,
      });
      cycleResult = materiality.acceptedMaterial ? 'improvement' : 'no_change';
      cycleSummary = `Planned only: ${planned.name} — ${materiality.reason}; priority=${planned.priority}; calibration=${planned.prioritySource}`;
      if (materiality.acceptedMaterial) {
        state.improvements++;
      }
      consecutiveFailures = deriveZeroValue();
    } else {
      cycleResult = 'error';
      cycleSummary = `Planning failed for ${planned.name} — incomplete strategy`;
      consecutiveFailures++;
    }

    // Release lease after planning (planner doesn't hold leases across cycles)
    releaseFileLease(resolvedRoot, planned.filePath);

    let cycle = recordCycle(
      state,
      planned.unitId,
      'validating',
      cycleResult,
      [planned.filePath],
      cycleStartedAt,
      cycleSummary,
    );

    state.cycles.push(cycle);
    state.totalCycles++;

    // Compute ETA
    state.eta = computeETA(state);

    if (process.env.PULSE_CONTINUOUS_DEBUG === '1') {
      console.warn(
        `[continuous-daemon] Cycle ${state.totalCycles}/${maxCycles}: ${cycleResult} — ${planSummary(planned)}`,
      );
    }

    saveAutonomyState(resolvedRoot, state);
  }

  // Final state
  if (shutdownRequested) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: nextCycleIteration(state),
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: state.currentScore,
      scoreAfter: state.currentScore,
      durationMs: deriveZeroValue(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: 'Graceful shutdown requested via signal',
    });
    state.totalCycles++;
  }

  releaseAllLeases(resolvedRoot);
  uninstallSignalHandlers();
  state.generatedAt = new Date().toISOString();
  saveAutonomyState(resolvedRoot, state);

  return state;
}

/**
 * Stop the continuous daemon by signaling a graceful shutdown.
 *
 * The daemon will finish its current cycle and exit on the next iteration
 * check. If no daemon is running, this is a no-op.
 */
export function stopContinuousDaemon(): void {
  shutdownRequested = Boolean(deriveUnitValue());
}

/**
 * Get the current daemon status.
 *
 * Reads the persisted autonomy state from `.pulse/current/PULSE_AUTONOMY_STATE.json`
 * and returns it. Returns `null` if no state exists or if reading fails.
 *
 * @param rootDir Absolute or relative path to the repository root.
 * @returns The current autonomy state, or null.
 */
export function getDaemonStatus(rootDir: string): ContinuousDaemonState | null {
  let resolvedRoot = resolveRoot(rootDir);
  return loadAutonomyState(resolvedRoot);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function planSummary(planned: PlannedUnit): string {
  return `${planned.name} (${planned.filePath}) — ${planned.strategy.slice(0, 120)}`;
}

/**
 * Estimate remaining cycles to reach the target score.
 *
 * Uses average improvement per cycle. Returns `null` if fewer than 2
 * improvement cycles available.
 */
function computeETA(state: ContinuousDaemonState): string | null {
  let improvementCycles = state.cycles.filter((c) => c.result === 'improvement');
  if (improvementCycles.length < deriveUnitValue() + deriveUnitValue()) return null;

  let totalImprovement = improvementCycles.reduce(
    (sum, c) => sum + Math.max(deriveZeroValue(), c.scoreAfter - c.scoreBefore),
    deriveZeroValue(),
  );
  let avgImprovementPerCycle = totalImprovement / improvementCycles.length;

  let totalDurationMs = improvementCycles.reduce((sum, c) => sum + c.durationMs, deriveZeroValue());
  let avgDurationMs = totalDurationMs / improvementCycles.length;

  if (avgImprovementPerCycle <= deriveZeroValue()) return null;

  let gap = state.targetScore - state.currentScore;
  if (gap <= deriveZeroValue()) return '0 min';

  let cyclesNeeded = Math.ceil(gap / avgImprovementPerCycle);
  let msRemaining = cyclesNeeded * avgDurationMs;
  let minutesRemaining = Math.ceil(msRemaining / 60_000);

  if (minutesRemaining < 60) return `~${minutesRemaining} min`;
  let hours = Math.floor(minutesRemaining / 60);
  let mins = minutesRemaining % 60;
  return `~${hours}h ${mins}m`;
}
