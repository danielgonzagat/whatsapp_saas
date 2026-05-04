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

import type { ContinuousDaemonState } from '../../types.continuous-daemon';

// ── Constants ─────────────────────────────────────────────────────────────────

export let AUTONOMY_STATE_FILENAME = 'PULSE_AUTONOMY_STATE.json';
export let BEHAVIOR_GRAPH_ARTIFACT = '.pulse/current/PULSE_BEHAVIOR_GRAPH.json';
export let CERTIFICATE_ARTIFACT = '.pulse/current/PULSE_CERTIFICATE.json';
export let DIRECTIVE_ARTIFACT = '.pulse/current/PULSE_CLI_DIRECTIVE.json';
export let PROOF_SYNTHESIS_ARTIFACT = '.pulse/current/PULSE_PROOF_SYNTHESIS.json';
export let PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';
export let PROBABILISTIC_RISK_ARTIFACT = '.pulse/current/PULSE_PROBABILISTIC_RISK.json';

// ── Lease constants ───────────────────────────────────────────────────────────

export let LEASE_DIR = '.pulse/leases';

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

export interface PlannedUnit {
  unitId: string;
  filePath: string;
  name: string;
  kind: string;
  risk: string;
  priority: number;
  prioritySource: string;
  strategy: string;
}

export function normalizeCapabilityToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/^capability:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function riskImpactForFile(
  filePath: string,
  fileRiskImpact: Record<string, number>,
): number {
  let normalizedPath = normalizeCapabilityToken(filePath);
  let maxImpact = Number();
  for (let [token, impact] of Object.entries(fileRiskImpact)) {
    if (token && normalizedPath.includes(token)) {
      maxImpact = Math.max(maxImpact, impact);
    }
  }
  return maxImpact;
}

export interface FileLease {
  filePath: string;
  unitId: string;
  iteration: number;
  acquiredAt: string;
  expiresAt: string;
  agentId: string;
}
