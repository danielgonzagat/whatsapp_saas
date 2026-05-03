import type { PulseExecutionMatrixPath } from '../../types';
import type {
  PathClassification,
  PathCoverageExecutionMode,
  PathCoverageExpectedEvidence,
  PathCoverageEntry,
  PathCoverageStructuralSafetyClassification,
  PathCoverageTerminalProof,
  PathCoverageArtifactLink,
} from '../../types.path-coverage-engine';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return risk === 'critical';
}

function isHighOrCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return risk === 'high' || risk === 'critical';
}

export function getEvidenceMode(
  classification: PathClassification,
): PathCoverageEntry['evidenceMode'] {
  if (classification === 'observed_pass' || classification === 'observed_fail') {
    return 'observed';
  }
  if (classification === 'probe_blueprint_generated') {
    return 'blueprint';
  }
  return 'inferred';
}

export function normalizeCoverageExecutionMode(
  mode: PulseExecutionMatrixPath['executionMode'],
  risk: PathCoverageEntry['risk'],
): PathCoverageExecutionMode {
  if (mode === 'governed_validation') {
    return 'governed_validation';
  }
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'governed_validation';
  }
  return isHighOrCriticalRisk(risk) ? 'governed_validation' : 'ai_safe';
}

export function buildTerminalReason(
  mp: PulseExecutionMatrixPath,
  classification: PathClassification,
  safeToExecute: boolean,
): string {
  if (classification === 'observed_pass') {
    return summarizeObservedEvidence(mp, 'passed') ?? 'Path has passing observed runtime evidence.';
  }
  if (classification === 'observed_fail') {
    return summarizeObservedEvidence(mp, 'failed') ?? 'Path has failing observed runtime evidence.';
  }
  if (classification === 'unreachable') {
    return mp.breakpoint?.reason ?? 'Path is unreachable from the discovered execution graph.';
  }
  if (classification === 'not_executable') {
    return mp.breakpoint?.reason ?? 'Path is classified as non-executable inventory.';
  }
  if (classification === 'probe_blueprint_generated') {
    const mode = normalizeCoverageExecutionMode(mp.executionMode, mp.risk);
    const routeOrEntry = mp.routePatterns[0] ?? mp.entrypoint.filePath ?? mp.entrypoint.nodeId;
    const machineProofDebt = findSyntheticMachineProofDebt(mp);
    if (machineProofDebt) {
      return `${machineProofDebt.summary} Generated ${mode} probe blueprint must execute or terminally classify the scenario before product capability evidence can be claimed.`;
    }
    return safeToExecute
      ? `Unobserved ${mp.risk} path has ${routeOrEntry ?? 'a discovered entrypoint'} and is terminalized as a ${mode} probe blueprint until runtime evidence executes.`
      : 'Unobserved path maps to a protected governance surface and remains inferred without executable coverage.';
  }
  if (mp.breakpoint?.reason) {
    return mp.breakpoint.reason;
  }
  return 'Path lacks pass/fail runtime evidence and has no executable probe blueprint entrypoint yet.';
}

export function buildExpectedEvidence(
  mp: PulseExecutionMatrixPath,
): PathCoverageExpectedEvidence[] {
  const expected = mp.requiredEvidence.map((requirement) => ({
    kind: requirement.kind,
    required: requirement.required,
    reason: requirement.reason,
  }));

  if (expected.some((item) => item.kind === 'runtime')) {
    return appendScenarioMachineExpectedEvidence(mp, expected);
  }

  return appendScenarioMachineExpectedEvidence(mp, [
    ...expected,
    {
      kind: 'runtime',
      required: true,
      reason:
        'Generated probe blueprint must execute and publish pass/fail evidence before this path can count as observed.',
    },
  ]);
}

function appendScenarioMachineExpectedEvidence(
  mp: PulseExecutionMatrixPath,
  expected: PathCoverageExpectedEvidence[],
): PathCoverageExpectedEvidence[] {
  const machineProofDebt = findSyntheticMachineProofDebt(mp);
  if (!machineProofDebt) {
    return expected;
  }
  return [
    ...expected,
    {
      kind: 'e2e',
      required: true,
      reason:
        'Customer/soak synthetic missing evidence must be executed or classified by the PULSE machine before it can satisfy scenario proof.',
    },
  ];
}

function findSyntheticMachineProofDebt(
  mp: PulseExecutionMatrixPath,
): PulseExecutionMatrixPath['observedEvidence'][number] | null {
  return (
    mp.observedEvidence.find(
      (entry) =>
        entry.source === 'actor' &&
        entry.status === 'missing' &&
        entry.summary.includes('PULSE machine work'),
    ) ?? null
  );
}

export function buildStructuralSafetyClassification(
  mp: PulseExecutionMatrixPath,
  safeToExecute: boolean,
  protectedSurface: boolean,
  executionMode: PathCoverageExecutionMode,
): PathCoverageStructuralSafetyClassification {
  const reason = protectedSurface
    ? 'Path references protected governance infrastructure and is retained as inferred coverage.'
    : `Path risk is ${mp.risk}; next probe route is ${executionMode} based on structural risk and entrypoint metadata.`;

  return {
    risk: mp.risk,
    safeToExecute,
    executionMode,
    protectedSurface,
    reason,
  };
}

export function buildTerminalProof(
  mp: PulseExecutionMatrixPath,
  classification: PathClassification,
  probeFilePath: string | null,
): PathCoverageTerminalProof {
  if (classification === 'observed_pass' || classification === 'observed_fail') {
    return {
      status: 'observed',
      breakpoint: mp.breakpoint,
      validationCommand: mp.validationCommand,
      reason: 'Path already has observed pass/fail evidence; rerun validation to refresh it.',
    };
  }

  if (classification === 'probe_blueprint_generated' && probeFilePath) {
    const machineProofDebt = findSyntheticMachineProofDebt(mp);
    return {
      status: 'blueprint_ready',
      breakpoint: mp.breakpoint,
      validationCommand: `${mp.validationCommand} # execute generated probe blueprint ${probeFilePath}`,
      reason: machineProofDebt
        ? `${machineProofDebt.summary} Generated probe blueprint is actionable proof debt until the scenario is executed or classified.`
        : 'Path has a generated probe blueprint that can produce observed terminal evidence when executed.',
    };
  }

  if (classification === 'unreachable' || classification === 'not_executable') {
    return {
      status: 'terminal_reasoned',
      breakpoint: mp.breakpoint,
      validationCommand: mp.validationCommand,
      reason:
        'Path cannot produce runtime evidence until its breakpoint recovery reconnects it to an executable route, chain, or scenario.',
    };
  }

  if (classification === 'inferred_only' && hasPreciseBreakpoint(mp)) {
    return {
      status: 'terminal_reasoned',
      breakpoint: mp.breakpoint,
      validationCommand: mp.validationCommand,
      reason:
        'Path remains inferred, but the matrix provides a precise terminal breakpoint and recovery target.',
    };
  }

  return {
    status: 'inferred_gap',
    breakpoint: mp.breakpoint,
    validationCommand: mp.validationCommand,
    reason:
      'Path lacks observed evidence and still needs a precise breakpoint or generated probe blueprint.',
  };
}

function hasPreciseBreakpoint(mp: PulseExecutionMatrixPath): boolean {
  const breakpoint = mp.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}

export function buildArtifactLinks(
  mp: PulseExecutionMatrixPath,
  probeFilePath: string | null,
): PathCoverageArtifactLink[] {
  const links: PathCoverageArtifactLink[] = [
    {
      artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json',
      relationship: 'source_matrix',
    },
    {
      artifactPath: '.pulse/current/PULSE_PATH_COVERAGE.json',
      relationship: 'coverage_state',
    },
  ];

  if (probeFilePath) {
    links.push({
      artifactPath: probeFilePath,
      relationship: 'probe_blueprint',
    });
  }

  for (const artifactPath of unique(mp.observedEvidence.map((item) => item.artifactPath))) {
    links.push({
      artifactPath,
      relationship: 'observed_evidence',
    });
  }

  return links;
}

function summarizeObservedEvidence(
  mp: PulseExecutionMatrixPath,
  status: 'passed' | 'failed',
): string | null {
  const evidence = mp.observedEvidence.find((item) => item.status === status);
  if (!evidence) {
    return null;
  }
  return `${evidence.source} evidence in ${evidence.artifactPath}: ${evidence.summary}`;
}
