// PULSE — Live Codebase Nervous System
// Perfectness Test Harness — Gate Rules (Part 3b)
//
// The canonical 8-gate evaluation rule set.

import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import type { PerfectnessGate } from '../types.perfectness-test';
import {
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
  SCENARIO_EVIDENCE_FILE,
} from './gate-grammar';
import {
  isPassingStatus,
  normalizeProofToken,
  GateEvaluationContext,
  GateEvaluationRule,
  PulseAutonomyState,
  PulseCertState,
  PulseSandboxState,
  GateMetric,
} from './evaluation-helpers';
import { evaluateLongRunEvidence } from './time-engine';

function isFailingStatus(value: string | undefined): boolean {
  return Boolean(value) && !isPassingStatus(value);
}

function targetNumber(context: GateEvaluationContext, fallback: number): number {
  const numericMatch = context.target.match(/\d+(?:\.\d+)?/);
  return numericMatch ? Number(numericMatch[0]) : fallback;
}

function scoreMeetsTarget(context: GateEvaluationContext): boolean {
  return (context.cert?.score ?? deriveZeroValue()) >= targetNumber(context, deriveZeroValue());
}

function allCertificationGatesPass(cert: PulseCertState | null): GateMetric {
  const gateEntries = Object.entries(cert?.gates ?? {});
  const failing = gateEntries.filter(([, gate]) => !isPassingStatus(gate.status));
  return {
    count: gateEntries.length,
    labels: failing.map(([name]) => name),
  };
}

function capabilityRealityMetric(cert: PulseCertState | null): {
  real: number;
  total: number;
} {
  const capabilities = cert?.capabilities ?? [];
  const real = capabilities.filter(
    (capability) => normalizeProofToken(capability.health) === 'real',
  ).length;
  return { real, total: capabilities.length };
}

function runtimeFailureMetric(cert: PulseCertState | null): GateMetric {
  const entries = Object.entries(cert?.gates ?? {});
  const observedFailureEntries = entries.filter(([gateName, gate]) => {
    if (!isFailingStatus(gate.status)) {
      return false;
    }
    const normalizedName = normalizeProofToken(gateName);
    const normalizedReason = normalizeProofToken(gate.reason);
    return (
      normalizedName.includes('critical') ||
      normalizedName.includes('runtime') ||
      normalizedName.includes('error') ||
      normalizedReason.includes('critical') ||
      normalizedReason.includes('runtime') ||
      normalizedReason.includes('error')
    );
  });
  return {
    count: observedFailureEntries.length,
    labels: observedFailureEntries.map(([name]) => name),
  };
}

function rollbackFailureMetric(autonomy: PulseAutonomyState | null): number {
  return (autonomy?.iterations ?? []).filter(
    (iteration) => iteration.rollback && !iteration.recovered,
  ).length;
}

function sandboxViolationMetric(sandbox: PulseSandboxState | null): {
  governanceViolations: number;
  unsafePatches: number;
  workspaceCount: number;
} {
  const governanceViolations = sandbox?.summary?.governanceViolations ?? 0;
  const workspaces = sandbox?.activeWorkspaces ?? [];
  const unsafePatches = workspaces.reduce(
    (count, workspace) => count + (workspace.patches ?? []).filter((patch) => !patch.safe).length,
    0,
  );
  return { governanceViolations, unsafePatches, workspaceCount: workspaces.length };
}

function browserGateStatus(cert: PulseCertState | null): string | undefined {
  const browserEntry = Object.entries(cert?.gates ?? {}).find(([gateName]) =>
    normalizeProofToken(gateName).includes('browser'),
  );
  return browserEntry?.[1].status;
}

function buildUnknownGate(context: GateEvaluationContext): PerfectnessGate {
  return {
    name: context.name,
    description: context.description,
    target: context.target,
    actual: 'unknown gate',
    passed: false,
    evidence: `No evidence predicate matched gate "${context.name}" in the perfectness suite`,
  };
}

function evidencePlanHasSource(context: GateEvaluationContext, source: string): boolean {
  return Boolean(
    context.evidencePlan?.evidenceSources.some(
      (evidenceSource) => evidenceSource.source === source,
    ),
  );
}

function evidencePlanHasField(context: GateEvaluationContext, field: string): boolean {
  return Boolean(
    context.evidencePlan?.evidenceSources.some((evidenceSource) => evidenceSource.field === field),
  );
}

function evidencePlanMentions(context: GateEvaluationContext, token: string): boolean {
  const normalized = normalizeProofToken(token);
  return Boolean(
    context.evidencePlan?.evidenceSources.some((evidenceSource) =>
      normalizeProofToken(evidenceSource.interpretation).includes(normalized),
    ) || normalizeProofToken(context.target).includes(normalized),
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Gate Evaluation Rules
// ══════════════════════════════════════════════════════════════════════════════

export const GATE_EVALUATION_RULES: GateEvaluationRule[] = [
  {
    supports: (context) =>
      evidencePlanHasField(context, 'certified') && evidencePlanHasField(context, 'gates'),
    evaluate: (context) => {
      const certified = context.cert?.certified === true || isPassingStatus(context.cert?.status);
      const gateMetric = allCertificationGatesPass(context.cert);
      const passed = certified && scoreMeetsTarget(context) && gateMetric.count > 0;
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `certified=${certified}, score=${context.cert?.score ?? 0}, failingGates=${gateMetric.labels.length}`,
        passed,
        evidence: `${PULSE_CERTIFICATE_FILE} — certified=${certified}, score=${context.cert?.score ?? 0}, ${gateMetric.count} gates evaluated`,
      };
    },
  },
  {
    supports: (context) => evidencePlanHasField(context, 'capabilities'),
    evaluate: (context) => {
      const capabilityMetric = capabilityRealityMetric(context.cert);
      const allCapabilitiesReal =
        capabilityMetric.total > 0 && capabilityMetric.real === capabilityMetric.total;
      const passed = scoreMeetsTarget(context) || allCapabilitiesReal;
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `score=${context.cert?.score ?? 0}, capabilities=${capabilityMetric.real}/${capabilityMetric.total} real`,
        passed,
        evidence: `${PULSE_CERTIFICATE_FILE} — score=${context.cert?.score ?? 0}, ${capabilityMetric.real}/${capabilityMetric.total} capabilities are real`,
      };
    },
  },
  {
    supports: (context) => evidencePlanHasSource(context, SCENARIO_EVIDENCE_FILE),
    evaluate: (context) => {
      if (context.scenarioData.total > 0) {
        const passed = context.scenarioData.rate >= targetNumber(context, deriveZeroValue());
        return {
          name: context.name,
          description: context.description,
          target: context.target,
          actual: `scenario pass rate = ${context.scenarioData.rate}% (${context.scenarioData.passed}/${context.scenarioData.total})`,
          passed,
          evidence: `${SCENARIO_EVIDENCE_FILE} — ${context.scenarioData.passed}/${context.scenarioData.total} scenarios passed (${context.scenarioData.rate}%)`,
        };
      }

      const status = browserGateStatus(context.cert);
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `scenario evidence not found; browser gate = ${status ?? 'missing'}`,
        passed: isPassingStatus(status),
        evidence: `Fallback: ${PULSE_CERTIFICATE_FILE} browser gate status=${status ?? 'not found'} (no scenario evidence file)`,
      };
    },
  },
  {
    supports: (context) => evidencePlanMentions(context, 'critical errors'),
    evaluate: (context) => {
      const failureMetric = runtimeFailureMetric(context.cert);
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `critical/runtime gate failures = ${failureMetric.count}${failureMetric.labels.length > 0 ? ` (${failureMetric.labels.join(', ')})` : ''}`,
        passed: failureMetric.count === 0,
        evidence: `${PULSE_CERTIFICATE_FILE} — ${failureMetric.count} critical/runtime gate failures found`,
      };
    },
  },
  {
    supports: (context) =>
      evidencePlanHasField(context, 'score') && evidencePlanMentions(context, 'score start'),
    evaluate: (context) => {
      const scoreEnd = context.cert?.score ?? 0;
      const delta = scoreEnd - context.startScore;
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `start=${context.startScore}, end=${scoreEnd} (Δ${delta >= 0 ? '+' : ''}${delta})`,
        passed: delta >= 0,
        evidence: `${PULSE_CERTIFICATE_FILE} — startScore=${context.startScore}, endScore=${scoreEnd}, delta=${delta >= 0 ? '+' : ''}${delta}`,
      };
    },
  },
  {
    supports: (context) => evidencePlanHasSource(context, PULSE_AUTONOMY_STATE_FILE),
    evaluate: (context) => {
      const rollbackCount = context.autonomy?.rollbacks ?? 0;
      const unrecoveredRollbacks = rollbackFailureMetric(context.autonomy);
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `rollbacks=${rollbackCount}, unrecovered=${unrecoveredRollbacks}`,
        passed: unrecoveredRollbacks === 0,
        evidence: `${PULSE_AUTONOMY_STATE_FILE} — ${unrecoveredRollbacks} unrecovered of ${rollbackCount} total rollbacks`,
      };
    },
  },
  {
    supports: (context) => evidencePlanHasSource(context, PULSE_SANDBOX_STATE_FILE),
    evaluate: (context) => {
      const metric = sandboxViolationMetric(context.sandbox);
      const totalViolations = metric.governanceViolations + metric.unsafePatches;
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `governance violations=${metric.governanceViolations}, unsafe patches=${metric.unsafePatches}`,
        passed: totalViolations === 0,
        evidence: `${PULSE_SANDBOX_STATE_FILE} — ${metric.governanceViolations} governance violations, ${metric.unsafePatches} unsafe patches across ${metric.workspaceCount} workspaces`,
      };
    },
  },
  {
    supports: (context) => evidencePlanHasSource(context, 'system_clock'),
    evaluate: (context) => {
      const longRun = evaluateLongRunEvidence(context.startTime, context.autonomy);
      return {
        name: context.name,
        description: context.description,
        target: context.target,
        actual: `${longRun.observedHours.toFixed(1)}h observed, cycles=${longRun.cycleCount}, maxGap=${longRun.maxGapHours.toFixed(1)}h, status=${longRun.status}`,
        passed: longRun.passed,
        evidence: `${PULSE_AUTONOMY_STATE_FILE} + system clock — ${longRun.reason}`,
      };
    },
  },
];
