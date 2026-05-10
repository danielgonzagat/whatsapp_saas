// PULSE — Live Codebase Nervous System
// Perfectness Test Harness — Perfectness Evaluation (Part 6)
//
// Full perfectness evaluation, summary generation, and recommended actions.

import * as path from 'path';

import { ensureDir, writeTextFile } from '../safe-fs';
import type {
  PerfectnessGate,
  PerfectnessResult,
  PerfectnessVerdict,
} from '../types.perfectness-test';
import {
  ARTIFACT_FILE_NAME,
  PERFECTNESS_EVALUATION_KERNEL_GRAMMAR,
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
} from './gate-grammar';
import {
  computeVerdict,
  evaluateGate,
  isAutonomousApproved,
} from './gate-execution';
import { PulseAutonomyState, PulseCertState } from './evaluation-helpers';
import { computeHoursSince, evaluateLongRunEvidence, readStateFile } from './time-engine';

// ────────────────────────────────────────────────────────────────────────────
// Summary Generation
// ────────────────────────────────────────────────────────────────────────────

function buildSummary(
  verdict: PerfectnessVerdict,
  passed: number,
  total: number,
  scoreDelta: number,
): string {
  const deltaSign = scoreDelta >= 0 ? '+' : '';
  switch (verdict) {
    case 'PERFECT':
      return `PERFECT — all ${total} gates passed. Score change: ${deltaSign}${scoreDelta}. The system is ready for full autonomy.`;
    case 'ALMOST_PERFECT':
      return `ALMOST_PERFECT — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. Minor gaps remain; autonomous work is approved with caution.`;
    case 'NEEDS_WORK':
      return `NEEDS_WORK — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. Significant gaps detected; keep working through governed validation.`;
    case 'FAILED':
      return `FAILED — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. The system is not ready for autonomous operation.`;
    default:
      return `${verdict} — ${passed}/${total} gates passed.`;
  }
}

function buildRecommendedActions(verdict: PerfectnessVerdict, gates: PerfectnessGate[]): string[] {
  const failedGates = gates.filter((g) => !g.passed);
  const actions: string[] = [];

  switch (verdict) {
    case 'PERFECT':
      actions.push('System is fully approved for continuous autonomous operation.');
      actions.push('Risk 3 destructive operations remain outside autonomous mutation scope.');
      break;
    case 'ALMOST_PERFECT':
      actions.push('Autonomous operation approved with caution.');
      actions.push('Monitor failed gates closely.');
      for (const g of failedGates) {
        actions.push(`Address gate "${g.name}": ${g.actual}`);
      }
      break;
    case 'NEEDS_WORK':
      actions.push('Autonomous operation remains in governed validation mode.');
      for (const g of failedGates) {
        actions.push(`Fix gate "${g.name}": expected ${g.target}, got ${g.actual}`);
      }
      break;
    case 'FAILED':
      actions.push(
        'Autonomous operation failed; rollback_and_stop or retry_sandbox is required before continuing.',
      );
      for (const g of failedGates) {
        actions.push(`CRITICAL: gate "${g.name}" failed — ${g.evidence}`);
      }
      break;
  }

  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Full Perfectness Evaluation
// ────────────────────────────────────────────────────────────────────────────

export function evaluatePerfectness(rootDir: string, startTime: string): PerfectnessResult {
  const pulseDir = path.join(rootDir, '.pulse', 'current');

  const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
  const startScore = cert?.score ?? 0;

  const auto = readStateFile<PulseAutonomyState>(pulseDir, PULSE_AUTONOMY_STATE_FILE);
  const totalIterations = auto?.totalIterations ?? 0;
  const acceptedIterations = auto?.acceptedIterations ?? 0;
  const rejectedIterations = auto?.rejectedIterations ?? 0;
  const rollbacks = auto?.rollbacks ?? 0;
  const longRunEvidence = evaluateLongRunEvidence(startTime, auto);

  const gates: PerfectnessGate[] = PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.map((def) =>
    evaluateGate(def.name, rootDir, startScore, startTime),
  );

  const verdict = computeVerdict(gates);
  const scoreEnd = cert?.score ?? startScore;
  const scoreDelta = scoreEnd - startScore;
  const passed = gates.filter((g) => g.passed).length;
  const autonomousApproved = isAutonomousApproved(verdict);

  const result: PerfectnessResult = {
    startedAt: startTime,
    finishedAt: new Date().toISOString(),
    durationHours: computeHoursSince(startTime),
    totalIterations,
    acceptedIterations,
    rejectedIterations,
    rollbacks,
    scoreStart: startScore,
    scoreEnd,
    verdict,
    gates,
    longRunEvidence,
    summary: buildSummary(
      verdict,
      passed,
      PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.length,
      scoreDelta,
    ),
    recommendedActions: buildRecommendedActions(verdict, gates),
    autonomousApproved,
  };

  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(result, null, 2));

  return result;
}
