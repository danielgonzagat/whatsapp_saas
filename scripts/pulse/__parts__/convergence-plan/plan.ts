import type {
  PulseConvergencePlan,
  PulseGateName,
} from '../../types';
import type { BuildPulseConvergencePlanInput } from './kernel';
import {
  SCENARIO_STATUSES,
  UNIT_EXECUTION_MODES,
  UNIT_KINDS,
  UNIT_PRIORITIES,
} from './kernel';
import {
  applyDerivedPriorities,
  compactText,
  compareByObservedPressure,
  countUnitState,
  isSameState,
  normalizeConvergenceUnit,
  uniqueStrings,
  humanize,
} from './utils';
import {
  buildCapabilityUnits,
  buildCodacyStaticUnits,
  buildExecutionMatrixUnits,
  buildExternalUnits,
  buildFlowUnits,
  buildGenericGateUnits,
  buildNoHardcodedRealityUnits,
  buildParityGapUnits,
  buildScenarioUnits,
  buildScopeUnits,
  buildSecurityUnit,
  buildStaticUnit,
  collectCoveredGateNames,
} from './builders';

export function buildConvergencePlan(input: BuildPulseConvergencePlanInput): PulseConvergencePlan {
  let evidenceDerivedUnits = [
    ...buildExternalUnits(input),
    ...buildExecutionMatrixUnits(input),
    ...buildScopeUnits(input),
    ...buildParityGapUnits(input),
    ...buildCapabilityUnits(input),
    ...buildFlowUnits(input),
    ...buildScenarioUnits(input),
    ...buildSecurityUnit(input),
    ...buildNoHardcodedRealityUnits(input),
    ...buildCodacyStaticUnits(input),
    ...buildStaticUnit(input),
  ];
  let queue = [
    ...evidenceDerivedUnits,
    ...buildGenericGateUnits(input, collectCoveredGateNames(evidenceDerivedUnits)),
  ]
    .sort(compareByObservedPressure)
    .map((unit, index) => ({
      ...normalizeConvergenceUnit(unit),
      order: index + 1,
    }));
  let orderedQueue = applyDerivedPriorities(queue);

  let scenarioKind = [...UNIT_KINDS].find((k) => k.includes('scenario'))!;
  let securityKind = [...UNIT_KINDS].find((k) => k.includes('security'))!;
  let staticKind = [...UNIT_KINDS].find((k) => k.includes('static'))!;
  let runtimeKind = [...UNIT_KINDS].find((k) => k.includes('runtime'))!;
  let changeKind = [...UNIT_KINDS].find((k) => k.includes('change'))!;
  let dependencyKind = [...UNIT_KINDS].find((k) => k.includes('dependency'))!;
  let scopeKind = [...UNIT_KINDS].find((k) => k.includes('scope'))!;
  let gateKind = [...UNIT_KINDS].find((k) => k.includes('gate'))!;
  let p0 = [...UNIT_PRIORITIES].find((p) => p.includes('P0'))!;
  let p1 = [...UNIT_PRIORITIES].find((p) => p.includes('P1'))!;
  let p2 = [...UNIT_PRIORITIES].find((p) => p.includes('P2'))!;
  let p3 = [...UNIT_PRIORITIES].find((p) => p.includes('P3'))!;
  let observationOnlyMode = [...UNIT_EXECUTION_MODES].find((m) => m.includes('observation_only'))!;
  let failStatus = [...SCENARIO_STATUSES].find((s) => s.includes('fail'))!;
  let satisfiedStatus = [...SCENARIO_STATUSES].find((s) => s.includes('satisfied'))!;
  return {
    generatedAt: input.certification.timestamp,
    commitSha: input.certification.commitSha,
    status: input.certification.status,
    humanReplacementStatus: input.certification.humanReplacementStatus,
    blockingTier: input.certification.blockingTier,
    summary: {
      totalUnits: orderedQueue.length,
      scenarioUnits: countUnitState(orderedQueue, (unit) => unit.kind, scenarioKind),
      securityUnits: countUnitState(orderedQueue, (unit) => unit.kind, securityKind),
      staticUnits: countUnitState(orderedQueue, (unit) => unit.kind, staticKind),
      runtimeUnits: countUnitState(orderedQueue, (unit) => unit.kind, runtimeKind),
      changeUnits: countUnitState(orderedQueue, (unit) => unit.kind, changeKind),
      dependencyUnits: countUnitState(orderedQueue, (unit) => unit.kind, dependencyKind),
      scopeUnits: countUnitState(orderedQueue, (unit) => unit.kind, scopeKind),
      gateUnits: countUnitState(orderedQueue, (unit) => unit.kind, gateKind),
      humanRequiredUnits: 0,
      observationOnlyUnits: orderedQueue.filter(
        (unit) => unit.executionMode === observationOnlyMode,
      ).length,
      priorities: {
        P0: orderedQueue.filter((unit) => unit.priority === p0).length,
        P1: orderedQueue.filter((unit) => unit.priority === p1).length,
        P2: orderedQueue.filter((unit) => unit.priority === p2).length,
        P3: orderedQueue.filter((unit) => unit.priority === p3).length,
      },
      failingGates: (Object.keys(input.certification.gates) as PulseGateName[]).filter((gateName) =>
        isSameState(input.certification.gates[gateName].status, failStatus),
      ),
      pendingAsyncExpectations:
        input.certification.evidenceSummary.worldState.asyncExpectationsStatus
          .filter((entry) => entry.status !== satisfiedStatus)
          .map((entry) => `${entry.scenarioId}:${entry.expectation}`)
          .sort(),
    },
    queue: orderedQueue,
  };
}

export function renderConvergencePlanMarkdown(plan: PulseConvergencePlan): string {
  let lines: string[] = [];

  lines.push('# PULSE CONVERGENCE PLAN');
  lines.push('');
  lines.push(`- Generated: ${plan.generatedAt}`);
  lines.push(`- Commit: ${plan.commitSha}`);
  lines.push(`- Status: ${plan.status}`);
  lines.push(`- Human Replacement: ${plan.humanReplacementStatus}`);
  lines.push(`- Blocking Tier: ${plan.blockingTier !== null ? plan.blockingTier : 'None'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Queue length: ${plan.summary.totalUnits}`);
  lines.push(`- Scenario units: ${plan.summary.scenarioUnits}`);
  lines.push(`- Security units: ${plan.summary.securityUnits}`);
  lines.push(`- Runtime units: ${plan.summary.runtimeUnits}`);
  lines.push(`- Change units: ${plan.summary.changeUnits}`);
  lines.push(`- Dependency units: ${plan.summary.dependencyUnits}`);
  lines.push(`- Gate units: ${plan.summary.gateUnits}`);
  lines.push(`- Static units: ${plan.summary.staticUnits}`);
  lines.push(`- Scope units: ${plan.summary.scopeUnits}`);
  lines.push(
    `- Priorities: P0=${plan.summary.priorities.P0}, P1=${plan.summary.priorities.P1}, P2=${plan.summary.priorities.P2}, P3=${plan.summary.priorities.P3}`,
  );
  lines.push(
    `- Failing gates: ${plan.summary.failingGates.length > 0 ? plan.summary.failingGates.join(', ') : 'None'}`,
  );
  lines.push(`- Pending async expectations: ${plan.summary.pendingAsyncExpectations.length}`);
  lines.push('');
  lines.push('## Queue');
  lines.push('');
  lines.push('| Order | Priority | Lane | Kind | Mode | Unit | Opened By |');
  lines.push('|-------|----------|------|------|------|------|-----------|');
  for (let unit of plan.queue) {
    let openedBy =
      uniqueStrings([...unit.gateNames, ...unit.scenarioIds, ...unit.asyncExpectations]).join(
        ', ',
      ) || '\u2014';
    lines.push(
      `| ${unit.order} | ${unit.priority} | ${unit.ownerLane} | ${unit.kind.toUpperCase()} | ${unit.executionMode.toUpperCase()} | ${compactText(unit.title, 80)} | ${compactText(openedBy, 120)} |`,
    );
  }
  lines.push('');

  for (let unit of plan.queue) {
    lines.push(`## ${unit.order}. [${unit.priority}] ${unit.title}`);
    lines.push('');
    lines.push(`- Kind: ${unit.kind}`);
    lines.push(`- Status: ${unit.status}`);
    lines.push(`- Source: ${unit.source}`);
    lines.push(`- Execution Mode: ${unit.executionMode}`);
    lines.push(`- Lane: ${unit.ownerLane}`);
    lines.push(`- Failure Class: ${unit.failureClass}`);
    lines.push(`- Summary: ${unit.summary}`);
    lines.push(`- Target State: ${unit.targetState}`);
    lines.push(`- Gates: ${unit.gateNames.length > 0 ? unit.gateNames.join(', ') : '\u2014'}`);
    lines.push(`- Scenarios: ${unit.scenarioIds.length > 0 ? unit.scenarioIds.join(', ') : '\u2014'}`);
    lines.push(`- Modules: ${unit.moduleKeys.length > 0 ? unit.moduleKeys.join(', ') : '\u2014'}`);
    lines.push(`- Routes: ${unit.routePatterns.length > 0 ? unit.routePatterns.join(', ') : '\u2014'}`);
    lines.push(`- Flows: ${unit.flowIds.length > 0 ? unit.flowIds.join(', ') : '\u2014'}`);
    lines.push(
      `- Async Expectations: ${unit.asyncExpectations.length > 0 ? unit.asyncExpectations.join(', ') : '\u2014'}`,
    );
    lines.push(
      `- Finding Events: ${unit.breakTypes.length > 0 ? unit.breakTypes.join(', ') : '\u2014'}`,
    );
    lines.push(
      `- Related Files: ${unit.relatedFiles.length > 0 ? unit.relatedFiles.join(', ') : '\u2014'}`,
    );
    lines.push(
      `- Artifacts: ${unit.artifactPaths.length > 0 ? unit.artifactPaths.join(', ') : '\u2014'}`,
    );
    lines.push(
      `- Validation Artifacts: ${unit.validationArtifacts.length > 0 ? unit.validationArtifacts.join(', ') : '\u2014'}`,
    );
    lines.push('- Exit Criteria:');
    if (unit.exitCriteria.length === 0) {
      lines.push('  - None');
    } else {
      for (let criterion of unit.exitCriteria) {
        lines.push(`  - ${criterion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
