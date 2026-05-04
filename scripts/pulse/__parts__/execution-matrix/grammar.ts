import type {
  PulseCapabilityState,
  PulseExecutionChainSet,
  PulseExecutionEvidence,
  PulseExecutionMatrixObservedEvidence,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathSource,
  PulseExecutionMatrixPathStatus,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralNode,
} from '../../types';

export interface BuildExecutionMatrixInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  executionChains: PulseExecutionChainSet;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}

export type MatrixEvidence = PulseExecutionMatrixObservedEvidence;
export type MatrixArtifactGrammar = MatrixEvidence['source'];
export type StructuralGraphKind = PulseStructuralNode['kind'];
export type MatrixChainRole = PulseExecutionMatrixPath['chain'][number]['role'];
export type MatrixPathRisk = PulseExecutionMatrixPath['risk'];

export function terminalStatusGrammar(): PulseExecutionMatrixPathStatus[] {
  return [
    'observed_pass',
    'observed_fail',
    'untested',
    'observation_only',
    'blocked_human_required',
    'unreachable',
    'inferred_only',
    'not_executable',
  ];
}

export function matrixSourceGrammar(): PulseExecutionMatrixPathSource[] {
  return ['execution_chain', 'capability', 'flow', 'structural_node', 'scope_file'];
}

export function artifactGrammar(source: MatrixArtifactGrammar | 'static'): string {
  return {
    runtime: 'PULSE_RUNTIME_EVIDENCE.json',
    browser: 'PULSE_BROWSER_EVIDENCE.json',
    flow: 'PULSE_FLOW_EVIDENCE.json',
    actor: 'PULSE_SCENARIO_EVIDENCE.json',
    external: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
    static: 'PULSE_CERTIFICATE.json',
  }[source];
}

export function sameGrammar<T extends string | number | null | undefined>(
  value: T,
  expected: T,
): boolean {
  return value === expected;
}

export function differsGrammar<T extends string | number | null | undefined>(
  value: T,
  expected: T,
): boolean {
  return value !== expected;
}

export function hasItemsGrammar(value: { length: number }): boolean {
  return value.length > 0;
}

export function normalizeExecutionMode(
  mode: PulseExecutionMatrixPath['executionMode'] | undefined,
  risk: PulseExecutionMatrixPath['risk'],
): PulseExecutionMatrixPath['executionMode'] {
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'observation_only';
  }
  if (mode === 'governed_validation' || risk === 'high' || risk === 'critical') {
    return 'governed_validation';
  }
  return mode ?? 'ai_safe';
}
