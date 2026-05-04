import type { PerfectnessGate } from '../../types.perfectness-test';
import type {
  GateEvaluationContext,
  GateMetric,
  PulseAutonomyState,
  PulseCertState,
  PulseSandboxState,
  PulseScenarioEvidence,
} from './constants-and-types';
import { PULSE_CERTIFICATE_FILE, SCENARIO_EVIDENCE_FILE } from './constants-and-types';
import { readStateFile } from './state-helpers';

// ────────────────────────────────────────────────────────────────────────────
// Scenario Pass Rate Computation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute the scenario pass rate from scenario evidence.
 *
 * Reads PULSE_SCENARIO_EVIDENCE.json and calculates the ratio
 * of passed scenarios to total executed scenarios.
 *
 * Returns 0 if no evidence is available.
 */
function computeScenarioPassRate(pulseDir: string): {
  rate: number;
  total: number;
  passed: number;
} {
  const evidence = readStateFile<PulseScenarioEvidence>(pulseDir, SCENARIO_EVIDENCE_FILE);

  if (evidence?.scenarios?.length) {
    const total = evidence.scenarios.filter((s) => s.executed !== false).length;
    const passed = evidence.scenarios.filter(
      (s) => s.passStatus === 'pass' || s.passStatus === 'PASS',
    ).length;
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

function normalizeProofToken(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function isPassingStatus(value: string | undefined): boolean {
  const normalized = normalizeProofToken(value);
  return normalized === 'pass' || normalized === 'passed' || normalized === 'certified';
}

function isFailingStatus(value: string | undefined): boolean {
  return Boolean(value) && !isPassingStatus(value);
}

function targetNumber(context: GateEvaluationContext, fallback: number): number {
  const numericMatch = context.target.match(/\d+(?:\.\d+)?/);
  return numericMatch ? Number(numericMatch[0]) : fallback;
}

function scoreMeetsTarget(context: GateEvaluationContext): boolean {
  return (context.cert?.score ?? 0) >= targetNumber(context, 0);
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

export {
  allCertificationGatesPass,
  browserGateStatus,
  buildUnknownGate,
  capabilityRealityMetric,
  computeScenarioPassRate,
  evidencePlanHasField,
  evidencePlanHasSource,
  evidencePlanMentions,
  isFailingStatus,
  isPassingStatus,
  normalizeProofToken,
  rollbackFailureMetric,
  runtimeFailureMetric,
  sandboxViolationMetric,
  scoreMeetsTarget,
  targetNumber,
};
