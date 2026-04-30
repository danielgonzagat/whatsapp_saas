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

const AUTONOMY_STATE_FILENAME = 'PULSE_AUTONOMY_STATE.json';
const BEHAVIOR_GRAPH_ARTIFACT = '.pulse/current/PULSE_BEHAVIOR_GRAPH.json';
const CERTIFICATE_ARTIFACT = '.pulse/current/PULSE_CERTIFICATE.json';
const DIRECTIVE_ARTIFACT = '.pulse/current/PULSE_CLI_DIRECTIVE.json';
const PROOF_SYNTHESIS_ARTIFACT = '.pulse/current/PULSE_PROOF_SYNTHESIS.json';
const PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';
const PROBABILISTIC_RISK_ARTIFACT = '.pulse/current/PULSE_PROBABILISTIC_RISK.json';

const DEFAULT_TARGET_SCORE = 100;
const DEFAULT_MAX_ITERATIONS = 100;
const COOLDOWN_CYCLE_COUNT = 3;
const MAX_CONSECUTIVE_PLANNING_FAILURES = 5;

// ── Lease constants ───────────────────────────────────────────────────────────

const LEASE_DIR = '.pulse/leases';
const LEASE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type CalibrationSource =
  | 'artifact'
  | 'history'
  | 'evidence_graph'
  | 'dynamic_risk'
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
  const safeName = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 120);
  return path.join(leaseDirPath(rootDir), `${safeName}.lease.json`);
}

// ── State I/O ────────────────────────────────────────────────────────────────

function loadAutonomyState(rootDir: string): ContinuousDaemonState | null {
  const filePath = autonomyStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<ContinuousDaemonState>(filePath);
  } catch {
    return null;
  }
}

function saveAutonomyState(rootDir: string, state: ContinuousDaemonState): void {
  const filePath = autonomyStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  state.generatedAt = new Date().toISOString();
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

function loadOptionalArtifact<T>(rootDir: string, artifactPath: string): T | null {
  const fullPath = path.join(rootDir, artifactPath);
  if (!pathExists(fullPath)) return null;
  try {
    return readJsonFile<T>(fullPath);
  } catch {
    return null;
  }
}

// ── Behavior graph loading ───────────────────────────────────────────────────

function loadBehaviorGraph(rootDir: string): BehaviorGraph | null {
  const artifactPath = behaviorGraphPath(rootDir);
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
  const certificate = loadOptionalArtifact<PulseCertificateArtifact>(rootDir, CERTIFICATE_ARTIFACT);
  const directive = loadOptionalArtifact<PulseDirectiveArtifact>(rootDir, DIRECTIVE_ARTIFACT);
  const proofSynthesis = loadOptionalArtifact<ProofSynthesisArtifact>(
    rootDir,
    PROOF_SYNTHESIS_ARTIFACT,
  );
  const pathProof = loadOptionalArtifact<PathProofEvidenceArtifact>(
    rootDir,
    PATH_PROOF_EVIDENCE_ARTIFACT,
  );
  const risk = loadOptionalArtifact<ProbabilisticRiskArtifact>(
    rootDir,
    PROBABILISTIC_RISK_ARTIFACT,
  );

  const targetScore = deriveTargetScore(certificate, directive);
  const fileEvidenceDeficits = deriveFileEvidenceDeficits(proofSynthesis);
  const kindPriority = deriveKindPriority(graph, proofSynthesis);
  const riskPriority = deriveRiskPriority(graph, risk);
  const fileRiskImpact = deriveFileRiskImpact(risk);
  const maxIterations = deriveMaxIterations(graph, pathProof, proofSynthesis, targetScore.value);
  const cooldownCycles = deriveCooldownCycles(existing, risk);
  const leaseTtlMs = deriveLeaseTtlMs(existing);

  return {
    generatedAt: new Date().toISOString(),
    targetScore,
    maxIterations,
    cooldownCycles,
    leaseTtlMs,
    kindPriority,
    riskPriority,
    fileEvidenceDeficits,
    fileRiskImpact,
    weakFallbacks: [
      targetScore,
      maxIterations,
      cooldownCycles,
      leaseTtlMs,
      ...Object.values(kindPriority),
      ...Object.values(riskPriority),
    ]
      .filter((entry) => entry.source === 'weak_fallback')
      .map((entry) => entry.detail),
  };
}

function derived(value: number, source: CalibrationSource, detail: string): CalibrationValue {
  return { value, source, detail };
}

function deriveTargetScore(
  certificate: PulseCertificateArtifact | null,
  directive: PulseDirectiveArtifact | null,
): CalibrationValue {
  if (typeof certificate?.targetScore === 'number') {
    return derived(certificate.targetScore, 'artifact', 'certificate.targetScore');
  }

  const checkpoint = directive?.targetCheckpoint;
  if (checkpoint) {
    const numericTargets = Object.values(checkpoint).filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    if (numericTargets.length > 0) {
      const normalized = numericTargets.every((value) => value <= 1)
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
      DEFAULT_TARGET_SCORE,
      'artifact',
      'certification objective requires full target when certificate is not explicitly capped',
    );
  }

  return derived(
    DEFAULT_TARGET_SCORE,
    'weak_fallback',
    'DEFAULT_TARGET_SCORE without objective artifact',
  );
}

function deriveMaxIterations(
  graph: BehaviorGraph,
  pathProof: PathProofEvidenceArtifact | null,
  proofSynthesis: ProofSynthesisArtifact | null,
  targetScore: number,
): CalibrationValue {
  const currentScore = computeCurrentScore(graph);
  const scoreGap = Math.max(1, targetScore - currentScore);
  const proofSummary = pathProof?.summary;
  const missingPathTasks = Math.max(
    proofSummary?.missingResult ?? 0,
    proofSummary?.notObserved ?? 0,
    (proofSynthesis?.summary?.plannedPlans ?? 0) - (proofSynthesis?.summary?.observedPlans ?? 0),
  );

  if (missingPathTasks > 0) {
    const executableRatio = Math.max(
      1,
      Math.ceil(
        (proofSummary?.totalTasks ?? graph.summary.totalNodes) /
          Math.max(1, proofSummary?.executableTasks ?? 1),
      ),
    );
    return derived(
      Math.max(scoreGap, Math.ceil(missingPathTasks / executableRatio)),
      'evidence_graph',
      'unobserved path/proof evidence divided by executable evidence ratio',
    );
  }

  if (graph.summary.totalNodes > 0) {
    const autonomyDensity = Math.max(
      1,
      Math.ceil(graph.summary.totalNodes / Math.max(1, graph.summary.aiSafeNodes)),
    );
    return derived(
      scoreGap * autonomyDensity,
      'artifact',
      'score gap scaled by behavior graph autonomy density',
    );
  }

  return derived(
    DEFAULT_MAX_ITERATIONS,
    'weak_fallback',
    'DEFAULT_MAX_ITERATIONS without graph evidence',
  );
}

function deriveCooldownCycles(
  existing: ContinuousDaemonState | null,
  risk: ProbabilisticRiskArtifact | null,
): CalibrationValue {
  const recentFailures =
    existing?.cycles.filter((cycle) => cycle.result === 'blocked' || cycle.result === 'error') ??
    [];
  if (recentFailures.length > 0) {
    const distinctUnits = new Set(recentFailures.map((cycle) => cycle.unitId).filter(Boolean));
    return derived(
      Math.max(1, distinctUnits.size),
      'history',
      'distinct blocked/error units in daemon history',
    );
  }

  const lowReliability = risk?.summary?.capabilitiesWithLowReliability;
  if (typeof lowReliability === 'number' && lowReliability > 0) {
    return derived(
      Math.max(1, Math.ceil(Math.log2(lowReliability + 1))),
      'dynamic_risk',
      'low-reliability capability count from probabilistic risk',
    );
  }

  return derived(
    COOLDOWN_CYCLE_COUNT,
    'weak_fallback',
    'COOLDOWN_CYCLE_COUNT without history/risk evidence',
  );
}

function deriveLeaseTtlMs(existing: ContinuousDaemonState | null): CalibrationValue {
  const durations = existing?.cycles
    .map((cycle) => cycle.durationMs)
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .sort((a, b) => a - b);

  if (durations && durations.length > 0) {
    const percentileIndex = Math.max(0, Math.ceil(durations.length * 0.9) - 1);
    return derived(durations[percentileIndex], 'history', 'p90 daemon cycle duration');
  }

  return derived(LEASE_TTL_MS, 'weak_fallback', 'LEASE_TTL_MS without duration history');
}

function deriveFileEvidenceDeficits(
  proofSynthesis: ProofSynthesisArtifact | null,
): Record<string, number> {
  const deficits: Record<string, number> = {};
  for (const target of proofSynthesis?.targets ?? []) {
    if (!target.filePath) continue;
    const missingPlans = (target.plans ?? []).filter(
      (plan) => plan.observed !== true && plan.countsAsObserved !== true,
    ).length;
    if (missingPlans > 0) {
      deficits[target.filePath] = (deficits[target.filePath] ?? 0) + missingPlans;
    }
  }
  return deficits;
}

function deriveKindPriority(
  graph: BehaviorGraph,
  proofSynthesis: ProofSynthesisArtifact | null,
): Record<string, CalibrationValue> {
  const counts: Record<string, number> = {};
  for (const target of proofSynthesis?.targets ?? []) {
    const kind = normalizeProofSourceKind(target.sourceKind);
    if (!kind) continue;
    const missingPlans = (target.plans ?? []).filter(
      (plan) => plan.observed !== true && plan.countsAsObserved !== true,
    ).length;
    counts[kind] = (counts[kind] ?? 0) + missingPlans;
  }

  if (Object.keys(counts).length > 0) {
    return mapCountsToCalibration(
      counts,
      'evidence_graph',
      'unobserved proof plans by behavior kind',
    );
  }

  for (const node of graph.nodes) {
    counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  }

  if (Object.keys(counts).length > 0) {
    return mapCountsToCalibration(counts, 'artifact', 'behavior graph node distribution');
  }

  return {
    api_endpoint: derived(5, 'weak_fallback', 'legacy api_endpoint priority'),
    handler: derived(4, 'weak_fallback', 'legacy handler priority'),
    function_definition: derived(3, 'weak_fallback', 'legacy function_definition priority'),
    lifecycle_hook: derived(2, 'weak_fallback', 'legacy lifecycle_hook priority'),
    validation: derived(1, 'weak_fallback', 'legacy validation priority'),
  };
}

function deriveRiskPriority(
  graph: BehaviorGraph,
  risk: ProbabilisticRiskArtifact | null,
): Record<string, CalibrationValue> {
  const counts: Record<string, number> = {};
  for (const node of graph.nodes) {
    if (node.executionMode !== 'ai_safe') continue;
    counts[node.risk] = (counts[node.risk] ?? 0) + 1;
  }

  if (risk?.summary?.avgReliability !== undefined) {
    const uncertaintyBoost = Math.max(1, Math.round((1 - risk.summary.avgReliability) * 10));
    for (const key of Object.keys(counts)) {
      counts[key] += uncertaintyBoost;
    }
    return mapCountsToCalibration(
      counts,
      'dynamic_risk',
      'ai-safe risk bins boosted by reliability gap',
    );
  }

  if (Object.keys(counts).length > 0) {
    return mapCountsToCalibration(counts, 'artifact', 'ai-safe behavior risk distribution');
  }

  return {
    low: derived(5, 'weak_fallback', 'legacy low-risk priority'),
    medium: derived(3, 'weak_fallback', 'legacy medium-risk priority'),
    none: derived(1, 'weak_fallback', 'legacy no-risk priority'),
  };
}

function mapCountsToCalibration(
  counts: Record<string, number>,
  source: CalibrationSource,
  detail: string,
): Record<string, CalibrationValue> {
  const values = Object.values(counts);
  const max = Math.max(...values, 1);
  const result: Record<string, CalibrationValue> = {};
  for (const [key, count] of Object.entries(counts)) {
    result[key] = derived(Math.max(1, Math.round((count / max) * 10)), source, detail);
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
  const impacts: Record<string, number> = {};
  const reliabilities = risk?.reliabilities ?? [];
  const maxImpact = Math.max(...reliabilities.map((entry) => entry.expectedImpact ?? 0), 0);
  if (maxImpact <= 0) return impacts;

  for (const entry of reliabilities) {
    const id = entry.capabilityId ?? entry.capabilityName;
    const expectedImpact = entry.expectedImpact ?? 0;
    if (!id || expectedImpact <= 0) continue;
    impacts[normalizeCapabilityToken(id)] = Math.round((expectedImpact / maxImpact) * 10);
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
  const normalizedPath = normalizeCapabilityToken(filePath);
  let maxImpact = 0;
  for (const [token, impact] of Object.entries(fileRiskImpact)) {
    if (token && normalizedPath.includes(token)) {
      maxImpact = Math.max(maxImpact, impact);
    }
  }
  return maxImpact;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeCurrentScore(graph: BehaviorGraph): number {
  const totalNodes = graph.summary.totalNodes;
  if (totalNodes === 0) return 0;
  const aiSafeNodes = graph.summary.aiSafeNodes;
  // Score: ratio of ai_safe vs total discovered nodes; PULSE should not remove
  // nodes from the autonomy denominator by routing them to humans.
  const automatableTarget = totalNodes;
  if (automatableTarget <= 0) return 0;
  return Math.round((aiSafeNodes / automatableTarget) * 100);
}

// ── Unit selection ────────────────────────────────────────────────────────────

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
  const aiSafeNodes = graph.nodes.filter(
    (n): n is BehaviorNode & { executionMode: 'ai_safe' } => n.executionMode === 'ai_safe',
  );

  if (!aiSafeNodes.length) return null;

  const eligible = aiSafeNodes.filter((n) => !recentUnits.has(n.id));

  if (!eligible.length) {
    // All units on cooldown — relax cooldown and retry
    const allEligible = aiSafeNodes;
    const scored = allEligible.map((node) => ({
      node,
      score: scoreNodePriority(node, calibration),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return null;
    return buildPlannedUnit(best.node, best.score, calibration);
  }

  const scored = eligible.map((node) => ({
    node,
    score: scoreNodePriority(node, calibration),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return buildPlannedUnit(best.node, best.score, calibration);
}

function scoreNodePriority(node: BehaviorNode, calibration: DaemonCalibrationSnapshot): number {
  return (
    (calibration.kindPriority[node.kind]?.value ?? 0) +
    (calibration.riskPriority[node.risk]?.value ?? 0) +
    (calibration.fileEvidenceDeficits[node.filePath] ?? 0) +
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
  const strategyParts: string[] = [];

  if (node.hasErrorHandler) {
    strategyParts.push('unit already has error handler — validate coverage');
  } else {
    strategyParts.push('add try/catch error boundary');
  }

  if (!node.hasLogging) strategyParts.push('add structured logging');
  if (!node.hasMetrics) strategyParts.push('add metrics instrumentation');
  if (!node.hasTracing) strategyParts.push('add tracing span');
  if ((calibration.fileEvidenceDeficits[node.filePath] ?? 0) > 0) {
    strategyParts.push('close unobserved proof plans from evidence graph');
  }
  if (riskImpactForFile(node.filePath, calibration.fileRiskImpact) > 0) {
    strategyParts.push('prioritize dynamic-risk capability impact');
  }

  const strategy =
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
      calibration.kindPriority[node.kind]?.source ?? 'missing_kind_calibration',
      calibration.riskPriority[node.risk]?.source ?? 'missing_risk_calibration',
    ].join('+'),
    strategy,
  };
}

// ── File leasing ──────────────────────────────────────────────────────────────

/**
 * Acquire a lease on a file to prevent concurrent work on the same unit.
 *
 * Leases are stored as JSON files in `.pulse/leases/` with a 30-minute TTL.
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
  ensureDir(leaseDirPath(rootDir), { recursive: true });
  const leasePath = leaseFilePath(rootDir, filePath);

  // Check existing lease
  if (pathExists(leasePath)) {
    try {
      const existing: FileLease = readJsonFile<FileLease>(leasePath);
      const expiresAt = new Date(existing.expiresAt).getTime();
      if (Date.now() < expiresAt) {
        return false; // Active lease exists
      }
      // Lease expired — we can overwrite
    } catch {
      // Corrupt lease file — overwrite
    }
  }

  const now = new Date();
  const lease: FileLease = {
    filePath,
    unitId,
    iteration,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString(),
    agentId: `pulse-planner-${process.pid ?? 'unknown'}`,
  };

  writeTextFile(leasePath, JSON.stringify(lease, null, 2));
  return true;
}

/**
 * Release a file lease after a planning cycle completes.
 */
function releaseFileLease(rootDir: string, filePath: string): void {
  const leasePath = leaseFilePath(rootDir, filePath);
  try {
    if (pathExists(leasePath)) {
      const fs = require('fs');
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
  const dirPath = leaseDirPath(rootDir);
  if (!pathExists(dirPath)) return;

  try {
    const fs = require('fs');
    const entries = fs.readdirSync(dirPath);
    const agentId = `pulse-planner-${process.pid ?? 'unknown'}`;
    for (const entry of entries) {
      if (!entry.endsWith('.lease.json')) continue;
      const fullPath = path.join(dirPath, entry);
      try {
        const lease: FileLease = readJsonFile<FileLease>(fullPath);
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
  const lines: string[] = [
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
  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  const cycle: DaemonCycle = {
    iteration: state.totalCycles + 1,
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
 * @param options  Override defaults for max iterations.
 * @returns The final autonomy state after the loop terminates.
 */
export function startContinuousDaemon(
  rootDir: string,
  options: { maxCycles?: number } = {},
): ContinuousDaemonState {
  const resolvedRoot = resolveRoot(rootDir);

  const existing = loadAutonomyState(resolvedRoot);
  const now = new Date().toISOString();

  let state: CalibratedDaemonState;

  if (existing && existing.status === 'running') {
    state = existing;
  } else {
    state = {
      generatedAt: now,
      startedAt: existing?.startedAt ?? now,
      totalCycles: 0,
      improvements: 0,
      regressions: 0,
      rollbacks: 0,
      currentScore: 0,
      targetScore: existing?.targetScore ?? 0,
      milestones: [],
      cycles: [],
      status: 'running',
      eta: null,
    };
  }

  installSignalHandlers();

  // Load behavior graph for unit selection
  const behaviorGraph = loadBehaviorGraph(resolvedRoot);

  if (!behaviorGraph || !behaviorGraph.nodes.length) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: 1,
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: 0,
      scoreAfter: 0,
      durationMs: 0,
      startedAt: now,
      finishedAt: now,
      summary: 'No behavior graph available — generate PULSE_BEHAVIOR_GRAPH.json first',
    });
    state.totalCycles = 1;
    saveAutonomyState(resolvedRoot, state);
    uninstallSignalHandlers();
    return state;
  }

  const initialScore = computeCurrentScore(behaviorGraph);
  const calibration = buildDaemonCalibration(resolvedRoot, behaviorGraph, existing);
  const maxCycles = options.maxCycles ?? calibration.maxIterations.value;
  state.currentScore = initialScore;
  state.targetScore = calibration.targetScore.value;
  state.calibration = calibration;

  let consecutiveFailures = 0;

  while (!shutdownRequested && state.status === 'running' && state.totalCycles < maxCycles) {
    const cycleStartedAt = new Date().toISOString();

    // ── Re-read behavior graph each cycle to get fresh state ──
    const freshGraph = loadBehaviorGraph(resolvedRoot);
    if (!freshGraph || !freshGraph.nodes.length) {
      state.status = 'stopped';
      const cycle = recordCycle(
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

    const calibrationHistory = state.cycles.length > 0 ? state : existing;
    const freshCalibration = buildDaemonCalibration(resolvedRoot, freshGraph, calibrationHistory);
    const newScore = computeCurrentScore(freshGraph);
    state.currentScore = newScore;
    state.targetScore = freshCalibration.targetScore.value;
    state.calibration = freshCalibration;

    // Check if certified
    if (state.currentScore >= state.targetScore) {
      state.status = 'certified';
      const cycle = recordCycle(
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
    const recentUnits = new Set<string>();
    const recentCycles = state.cycles.slice(-freshCalibration.cooldownCycles.value);
    for (const cycle of recentCycles) {
      if (cycle.unitId && (cycle.result === 'error' || cycle.result === 'blocked')) {
        recentUnits.add(cycle.unitId);
      }
    }

    // Step 1: Pick highest-value ai_safe unit
    const planned = pickNextUnit(freshGraph, recentUnits, freshCalibration);

    if (!planned) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_PLANNING_FAILURES) {
        state.status = 'stopped';
        const cycle = recordCycle(
          state,
          null,
          'planning',
          'blocked',
          [],
          cycleStartedAt,
          `No ai_safe units available after ${MAX_CONSECUTIVE_PLANNING_FAILURES} attempts`,
        );
        state.cycles.push(cycle);
        state.totalCycles++;
        saveAutonomyState(resolvedRoot, state);
        break;
      }

      consecutiveFailures++;
      const cycle = recordCycle(
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
    const leaseAcquired = acquireFileLease(
      resolvedRoot,
      planned.filePath,
      planned.unitId,
      state.totalCycles + 1,
      freshCalibration.leaseTtlMs.value,
    );

    if (!leaseAcquired) {
      const cycle = recordCycle(
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
    const testPlan = generateTestPlan(planned);

    // Step 4: Validate strategy (planning-level validation)
    const hasStrategy = planned.strategy.length > 0;
    const hasTestSteps = testPlan.includes('Planned validation steps:');

    let cycleResult: DaemonCycleResult;
    let cycleSummary: string;

    if (hasStrategy && hasTestSteps) {
      const materiality = evaluateExecutorCycleMateriality({
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
      consecutiveFailures = 0;
    } else {
      cycleResult = 'error';
      cycleSummary = `Planning failed for ${planned.name} — incomplete strategy`;
      consecutiveFailures++;
    }

    // Release lease after planning (planner doesn't hold leases across cycles)
    releaseFileLease(resolvedRoot, planned.filePath);

    const cycle = recordCycle(
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
      iteration: state.totalCycles + 1,
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: state.currentScore,
      scoreAfter: state.currentScore,
      durationMs: 0,
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
  shutdownRequested = true;
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
  const resolvedRoot = resolveRoot(rootDir);
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
  const improvementCycles = state.cycles.filter((c) => c.result === 'improvement');
  if (improvementCycles.length < 2) return null;

  const totalImprovement = improvementCycles.reduce(
    (sum, c) => sum + Math.max(0, c.scoreAfter - c.scoreBefore),
    0,
  );
  const avgImprovementPerCycle = totalImprovement / improvementCycles.length;

  const totalDurationMs = improvementCycles.reduce((sum, c) => sum + c.durationMs, 0);
  const avgDurationMs = totalDurationMs / improvementCycles.length;

  if (avgImprovementPerCycle <= 0) return null;

  const gap = state.targetScore - state.currentScore;
  if (gap <= 0) return '0 min';

  const cyclesNeeded = Math.ceil(gap / avgImprovementPerCycle);
  const msRemaining = cyclesNeeded * avgDurationMs;
  const minutesRemaining = Math.ceil(msRemaining / 60_000);

  if (minutesRemaining < 60) return `~${minutesRemaining} min`;
  const hours = Math.floor(minutesRemaining / 60);
  const mins = minutesRemaining % 60;
  return `~${hours}h ${mins}m`;
}
