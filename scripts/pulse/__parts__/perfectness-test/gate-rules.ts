import type { PerfectnessGate } from '../../types.perfectness-test';
import type { GateEvaluationContext, GateEvaluationRule } from './constants-and-types';
import {
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
  SCENARIO_EVIDENCE_FILE,
} from './constants-and-types';
import {
  allCertificationGatesPass,
  browserGateStatus,
  capabilityRealityMetric,
  evidencePlanHasField,
  evidencePlanHasSource,
  evidencePlanMentions,
  isPassingStatus,
  rollbackFailureMetric,
  runtimeFailureMetric,
  sandboxViolationMetric,
  scoreMeetsTarget,
  targetNumber,
} from './scenario-helpers';
import { evaluateLongRunEvidence } from './time-utils';

const GATE_EVALUATION_RULES: GateEvaluationRule[] = [
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
        const passed = context.scenarioData.rate >= targetNumber(context, 0);
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

export { GATE_EVALUATION_RULES };
