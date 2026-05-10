// PULSE — Live Codebase Nervous System
// Perfectness Test Harness — Evaluation Helpers (Part 3a)
//
// Internal types and core utility helpers for gate evaluation.

import { pathExists, readJsonFile } from '../../safe-fs';
import { discoverPropertyPassedStatusFromTypeEvidence } from '../../dynamic-reality-kernel/catalog-arithmetic';
import type { GateEvidencePlan, PerfectnessGate } from '../../types.perfectness-test';
import { PULSE_CERTIFICATE_FILE, SCENARIO_EVIDENCE_FILE } from './gate-grammar';
import { readStateFile } from './time-engine';

// ────────────────────────────────────────────────────────────────────────────
// State File Interfaces
// ────────────────────────────────────────────────────────────────────────────

export interface PulseCertState {
  score?: number;
  certified?: boolean;
  status?: string;
  gates?: Record<string, { status?: string; reason?: string }>;
  capabilities?: Array<{ health?: string }>;
}

export interface PulseAutonomyState {
  iterations?: Array<{
    accepted: boolean;
    rollback?: boolean;
    recovered?: boolean;
  }>;
  startedAt?: string;
  generatedAt?: string;
  totalIterations?: number;
  acceptedIterations?: number;
  rejectedIterations?: number;
  rollbacks?: number;
  status?: string;
  cycles?: Array<{
    startedAt?: string;
    finishedAt?: string;
    phase?: string;
    result?: string;
    unitId?: string | null;
    filesChanged?: string[];
    scoreBefore?: number;
    scoreAfter?: number;
  }>;
}

export interface PulseSandboxState {
  summary?: {
    totalDestructiveActions?: number;
    governanceViolations?: number;
  };
  activeWorkspaces?: Array<{
    patches?: Array<{ safe: boolean }>;
  }>;
  protectedFiles?: string[];
}

export interface PulseScenarioEvidence {
  scenarios?: Array<{
    passStatus?: string;
    passRate?: number;
    executed?: boolean;
  }>;
  summary?: {
    passRate?: number;
    totalExecuted?: number;
    totalPassed?: number;
  };
}

export type GateEvaluationContext = {
  name: string;
  description: string;
  target: string;
  evidencePlan: GateEvidencePlan | null;
  pulseDir: string;
  startScore: number;
  startTime: string;
  cert: PulseCertState | null;
  autonomy: PulseAutonomyState | null;
  sandbox: PulseSandboxState | null;
  scenarioData: ReturnType<typeof computeScenarioPassRate>;
};

export type GateEvaluationRule = {
  supports: (context: GateEvaluationContext) => boolean;
  evaluate: (context: GateEvaluationContext) => PerfectnessGate;
};

export type GateMetric = {
  count: number;
  labels: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// Utility Helpers
// ────────────────────────────────────────────────────────────────────────────

export function normalizeProofToken(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

const _passedStatuses = discoverPropertyPassedStatusFromTypeEvidence();

export function isPassingStatus(value: string | undefined): boolean {
  const normalized = normalizeProofToken(value);
  return (
    _passedStatuses.has(normalized) ||
    [..._passedStatuses].some((s) => s.startsWith(normalized)) ||
    normalized === 'certified'
  );
}

export function computeScenarioPassRate(pulseDir: string): {
  rate: number;
  total: number;
  passed: number;
} {
  const evidence = readStateFile<PulseScenarioEvidence>(pulseDir, SCENARIO_EVIDENCE_FILE);

  if (evidence?.scenarios?.length) {
    const total = evidence.scenarios.filter((s) => s.executed !== false).length;
    const passed = evidence.scenarios.filter((s) => isPassingStatus(s.passStatus)).length;
    return {
      rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      total,
      passed,
    };
  }

  if (evidence?.summary) {
    return {
      rate: Math.round(evidence.summary.passRate ?? 0),
      total: evidence.summary.totalExecuted ?? 0,
      passed: evidence.summary.totalPassed ?? 0,
    };
  }

  return { rate: 0, total: 0, passed: 0 };
}
