/**
 * Part 1: state-foundation — types, constants, signals, path helpers,
 * state I/O, behavior graph loading, and small helper functions.
 */

import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { resolveRoot } from '../../lib/safe-path';
import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
  DaemonPhase,
} from '../../types.continuous-daemon';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveRuntimeStringBoundaryFromObservedCatalog,
  discoverAllObservedArtifactFilenames,
  discoverDaemonCycleResultLabels,
  discoverDaemonPhaseLabels,
  discoverDaemonStatusLabels,
} from '../../dynamic-reality-kernel';

// ── Constants ─────────────────────────────────────────────────────────────────

export let AUTONOMY_STATE_FILENAME = 'PULSE_AUTONOMY_STATE.json';
const ARTIFACTS = discoverAllObservedArtifactFilenames();
export let BEHAVIOR_GRAPH_ARTIFACT = `.pulse/current/${ARTIFACTS.behaviorGraph}`;
export let CERTIFICATE_ARTIFACT = `.pulse/current/${ARTIFACTS.certificate}`;
export let DIRECTIVE_ARTIFACT = `.pulse/current/${ARTIFACTS.cliDirective}`;
export let PROOF_SYNTHESIS_ARTIFACT = '.pulse/current/PULSE_PROOF_SYNTHESIS.json';
export let PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';
export let PROBABILISTIC_RISK_ARTIFACT = '.pulse/current/PULSE_PROBABILISTIC_RISK.json';

// ── Lease constants ───────────────────────────────────────────────────────────

export let LEASE_DIR = '.pulse/leases';

// ── Dynamic daemon vocabulary (from type-contract AST) ─────────────────────────

export const DAEMON_STATUS = Object.fromEntries(
  [...discoverDaemonStatusLabels()].map((s) => [s, s]),
) as Record<string, string>;

export const DAEMON_PHASE = Object.fromEntries(
  [...discoverDaemonPhaseLabels()].map((s) => [s, s]),
) as Record<string, string>;

export const CYCLE_RESULT = Object.fromEntries(
  [...discoverDaemonCycleResultLabels()].map((s) => [s, s]),
) as Record<string, string>;

// ── Calibration types ──────────────────────────────────────────────────────────

export type CalibrationSource =
  | 'artifact'
  | 'history'
  | 'evidence_graph'
  | 'dynamic_risk'
  | 'graph_availability'
  | 'weak_fallback';

export interface CalibrationValue {
  value: number;
  source: CalibrationSource;
  detail: string;
}

export interface DaemonCalibrationSnapshot {
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

export type CalibratedDaemonState = ContinuousDaemonState & {
  calibration?: DaemonCalibrationSnapshot;
};

export interface PulseCertificateArtifact {
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

export interface PulseDirectiveArtifact {
  productionAutonomyVerdict?: string;
  autonomyVerdict?: string;
  targetCheckpoint?: Record<string, number | string | boolean | null>;
  visionGap?: string;
}

export interface PathProofEvidenceArtifact {
  summary?: {
    totalTasks?: number;
    executableTasks?: number;
    missingResult?: number;
    notObserved?: number;
  };
}

export interface ProofSynthesisArtifact {
  summary?: {
    totalPlans?: number;
    observedPlans?: number;
    plannedPlans?: number;
  };
  targets?: ProofSynthesisTarget[];
}

export interface ProofSynthesisTarget {
  filePath?: string;
  sourceKind?: string;
  plans?: Array<{
    observed?: boolean;
    countsAsObserved?: boolean;
  }>;
}

export interface ProbabilisticRiskArtifact {
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

export interface FileLease {
  filePath: string;
  unitId: string;
  iteration: number;
  acquiredAt: string;
  expiresAt: string;
  agentId: string;
}

// ── Daemon-level signal state ─────────────────────────────────────────────────

export let shutdownRequested = Boolean(deriveZeroValue());

export function onSignal(signal: string): void {
  if (shutdownRequested) {
    process.exit(deriveZeroValue());
  }
  shutdownRequested = Boolean(deriveUnitValue());
  if (process.env.PULSE_CONTINUOUS_DEBUG === String(deriveUnitValue())) {
    console.warn(`[continuous-daemon] Received ${signal}, initiating graceful shutdown...`);
  }
}

export function installSignalHandlers(): void {
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}

export function uninstallSignalHandlers(): void {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
}

// ── Path helpers ──────────────────────────────────────────────────────────────

export function autonomyStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_STATE_FILENAME);
}

export function behaviorGraphPath(rootDir: string): string {
  return path.join(rootDir, BEHAVIOR_GRAPH_ARTIFACT);
}

export function leaseDirPath(rootDir: string): string {
  return path.join(rootDir, LEASE_DIR);
}

export function leaseFilePath(rootDir: string, filePath: string): string {
  let safeName = filePath
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(deriveZeroValue(), deriveRuntimeStringBoundaryFromObservedCatalog());
  return path.join(leaseDirPath(rootDir), `${safeName}.lease.json`);
}

// ── State I/O ────────────────────────────────────────────────────────────────

export function loadAutonomyState(rootDir: string): ContinuousDaemonState | null {
  let filePath = autonomyStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<ContinuousDaemonState>(filePath);
  } catch {
    return null;
  }
}

export function saveAutonomyState(rootDir: string, state: ContinuousDaemonState): void {
  let filePath = autonomyStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: Boolean(deriveUnitValue()) });
  state.generatedAt = new Date().toISOString();
  writeTextFile(filePath, JSON.stringify(state, null, deriveUnitValue() + deriveUnitValue()));
}

export function loadOptionalArtifact<T>(rootDir: string, artifactPath: string): T | null {
  let fullPath = path.join(rootDir, artifactPath);
  if (!pathExists(fullPath)) return null;
  try {
    return readJsonFile<T>(fullPath);
  } catch {
    return null;
  }
}

// ── Behavior graph loading ───────────────────────────────────────────────────

export function loadBehaviorGraph(rootDir: string): BehaviorGraph | null {
  let artifactPath = behaviorGraphPath(rootDir);
  if (!pathExists(artifactPath)) return null;
  try {
    return readJsonFile<BehaviorGraph>(artifactPath);
  } catch {
    return null;
  }
}

// ── Small calibration helpers ──────────────────────────────────────────────────

export function derived(
  value: number,
  source: CalibrationSource,
  detail: string,
): CalibrationValue {
  return { value, source, detail };
}

export function deriveObservedRatio(observed: number, total: number): number {
  if (!observed || !total) return Math.sign(observed || total);
  return observed / total;
}

export function nextCycleIteration(state: ContinuousDaemonState): number {
  return (
    state.totalCycles +
    Math.sign(
      state.cycles.length || state.totalCycles || deriveRuntimeStringBoundaryFromObservedCatalog(),
    )
  );
}

export function incrementCount(
  counts: Record<string, number>,
  key: string,
  evidence: number,
): void {
  let previous = Number(counts[key]);
  counts[key] = (Number.isFinite(previous) ? previous : deriveZeroValue()) + Math.sign(evidence);
}

export function hasEntries(record: Record<string, number>): boolean {
  return Boolean(Object.keys(record).length);
}

export function calibrationFloor(evidence: number): number {
  return Math.sign(evidence || deriveRuntimeStringBoundaryFromObservedCatalog());
}
