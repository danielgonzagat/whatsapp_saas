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

// ── Constants ─────────────────────────────────────────────────────────────────

let AUTONOMY_STATE_FILENAME = 'PULSE_AUTONOMY_STATE.json';
let BEHAVIOR_GRAPH_ARTIFACT = '.pulse/current/PULSE_BEHAVIOR_GRAPH.json';
let CERTIFICATE_ARTIFACT = '.pulse/current/PULSE_CERTIFICATE.json';
let DIRECTIVE_ARTIFACT = '.pulse/current/PULSE_CLI_DIRECTIVE.json';
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
  | 'graph_availability';

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
  derivedFloors: string[];
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

let shutdownRequested = false;

function onSignal(signal: string): void {
  if (shutdownRequested) {
    process.exit(0);
  }
  shutdownRequested = true;
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
  ensureDir(path.dirname(filePath), { recursive: true });
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
    derivedFloors: [
      targetScore,
      maxIterations,
      cooldownCycles,
      leaseTtlMs,
      planningFailureCeiling,
      ...Object.values(kindPriority),
      ...Object.values(riskPriority),
    ]
      .filter((entry) => entry.source === 'graph_availability')
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
      let normalized = numericTargets.every((value) => value <= 1)
        ? Math.round(Math.max(...numericTargets) * observedCeiling)
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
    'graph_availability',
    'behavior graph projected score ceiling without explicit objective artifact',
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
import "./__companions__/continuous-daemon.companion";
