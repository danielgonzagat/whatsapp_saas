import type {
  PulseActorEvidence,
  PulseFlowEvidence,
  PulseInvariantEvidence,
  PulseRuntimeProbe,
  PulseWorldState,
} from './types';
import { getRuntimeResolution } from './parsers/runtime-utils';

function compactReason(value: string, max: number = 500): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

/** Build timed out runtime probe. */
export function buildTimedOutRuntimeProbe(probeId: string): PulseRuntimeProbe {
  const resolution = getRuntimeResolution();
  const target =
    probeId === 'backend-health'
      ? `${resolution.backendUrl}/health/system`
      : probeId === 'auth-session'
        ? `${resolution.backendUrl}/auth/login`
        : probeId === 'ad-rules'
          ? `${resolution.backendUrl}/ad-rules`
          : probeId === 'frontend-reachability'
            ? resolution.frontendUrl
            : resolution.dbSource || 'database';

  return {
    probeId,
    target,
    required: true,
    executed: false,
    status: 'missing_evidence',
    failureClass: 'missing_evidence',
    summary: `Runtime probe ${probeId} timed out before evidence could be collected.`,
    artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json', 'PULSE_RUNTIME_PROBES.json'],
  };
}

/** Build failed runtime probe. */
export function buildFailedRuntimeProbe(probeId: string, error: unknown): PulseRuntimeProbe {
  const resolution = getRuntimeResolution();
  const target =
    probeId === 'backend-health'
      ? `${resolution.backendUrl}/health/system`
      : probeId === 'auth-session'
        ? `${resolution.backendUrl}/auth/login`
        : probeId === 'ad-rules'
          ? `${resolution.backendUrl}/ad-rules`
          : probeId === 'frontend-reachability'
            ? resolution.frontendUrl
            : resolution.dbSource || 'database';

  return {
    probeId,
    target,
    required: true,
    executed: false,
    status: 'missing_evidence',
    failureClass: 'missing_evidence',
    summary: compactReason(
      `Runtime probe ${probeId} failed before returning structured evidence: ${String((error as Error)?.message || error || 'unknown failure')}`,
    ),
    artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json', 'PULSE_RUNTIME_PROBES.json'],
  };
}

/** Build timed out flow evidence. */
export function buildTimedOutFlowEvidence(flowIds: string[]): PulseFlowEvidence {
  const declared = [...flowIds];
  return {
    declared,
    executed: [],
    missing: declared,
    passed: [],
    failed: [],
    accepted: [],
    artifactPaths: declared.length > 0 ? ['PULSE_FLOW_EVIDENCE.json'] : [],
    summary:
      declared.length > 0
        ? 'Declared flow execution timed out before evidence could be collected.'
        : 'No flow specs were requested.',
    results: declared.map((flowId) => ({
      flowId,
      status: 'missing_evidence' as const,
      executed: false,
      accepted: false,
      failureClass: 'missing_evidence' as const,
      summary: `Flow ${flowId} did not complete before the flow phase timed out.`,
      artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
    })),
  };
}

/** Build timed out invariant evidence. */
export function buildTimedOutInvariantEvidence(invariantIds: string[]): PulseInvariantEvidence {
  const declared = [...invariantIds];
  return {
    declared,
    evaluated: [],
    missing: declared,
    passed: [],
    failed: [],
    accepted: [],
    artifactPaths: declared.length > 0 ? ['PULSE_INVARIANT_EVIDENCE.json'] : [],
    summary:
      declared.length > 0
        ? 'Declared invariant execution timed out before evidence could be collected.'
        : 'No invariant specs were requested.',
    results: declared.map((invariantId) => ({
      invariantId,
      status: 'missing_evidence' as const,
      evaluated: false,
      accepted: false,
      failureClass: 'missing_evidence' as const,
      summary: `Invariant ${invariantId} did not complete before the invariant phase timed out.`,
      artifactPaths: ['PULSE_INVARIANT_EVIDENCE.json'],
    })),
  };
}

/** Build timed out actor evidence. */
export function buildTimedOutActorEvidence(
  kind: PulseActorEvidence['actorKind'],
  scenarioIds: string[],
): PulseActorEvidence {
  const artifactName =
    kind === 'customer'
      ? 'PULSE_CUSTOMER_EVIDENCE.json'
      : kind === 'operator'
        ? 'PULSE_OPERATOR_EVIDENCE.json'
        : kind === 'admin'
          ? 'PULSE_ADMIN_EVIDENCE.json'
          : 'PULSE_SOAK_EVIDENCE.json';

  return {
    actorKind: kind,
    declared: scenarioIds,
    executed: [],
    missing: scenarioIds,
    passed: [],
    failed: [],
    artifactPaths:
      scenarioIds.length > 0
        ? [artifactName, 'PULSE_WORLD_STATE.json', 'PULSE_SCENARIO_COVERAGE.json']
        : [],
    summary:
      scenarioIds.length > 0
        ? `${kind} scenarios timed out before synthetic evidence could be collected.`
        : `No ${kind} scenarios were requested.`,
    results: scenarioIds.map((scenarioId) => ({
      scenarioId,
      actorKind: kind === 'soak' ? 'system' : kind,
      scenarioKind: 'single-session',
      critical: true,
      requested: true,
      runner: 'derived',
      status: 'missing_evidence',
      executed: false,
      failureClass: 'missing_evidence',
      summary: `Scenario ${scenarioId} did not complete before the synthetic actor phase timed out.`,
      artifactPaths: [artifactName, 'PULSE_WORLD_STATE.json', 'PULSE_SCENARIO_COVERAGE.json'],
      specsExecuted: [],
      durationMs: 0,
      worldStateTouches: [],
      moduleKeys: [],
      routePatterns: [],
    })),
  };
}

/** Build timed out world state. */
export function buildTimedOutWorldState(
  backendUrl: string | undefined,
  frontendUrl: string | undefined,
  scenarioIds: string[],
): PulseWorldState {
  return {
    generatedAt: new Date().toISOString(),
    backendUrl,
    frontendUrl,
    actorProfiles: [],
    executedScenarios: [],
    pendingAsyncExpectations: scenarioIds,
    entities: {},
    asyncExpectationsStatus: scenarioIds.map((scenarioId) => ({
      scenarioId,
      expectation: 'phase-timeout',
      status: 'timed_out' as const,
    })),
    artifactsByScenario: Object.fromEntries(
      scenarioIds.map((scenarioId) => [scenarioId, ['PULSE_WORLD_STATE.json']]),
    ),
    sessions: [],
  };
}
