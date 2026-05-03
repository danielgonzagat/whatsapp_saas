import type { PureFunctionCandidate } from '../../types.property-tester';

export type CandidateCategory = PureFunctionCandidate['category'];

export interface DiscoveredExport {
  functionName: string;
  params: string[];
  hasReturnType: boolean;
  categoryHint: CandidateCategory | null;
}

export interface EndpointDescriptor {
  method: string;
  path: string;
  filePath: string;
  requiresAuth?: boolean;
  requiresTenant?: boolean;
  rateLimit?: unknown;
  requestSchema?: unknown;
  responseSchema?: unknown;
}

export type EndpointRisk = 'high' | 'medium' | 'low';
export type ProofInputType =
  | 'none'
  | 'path_parameter'
  | 'query_parameter'
  | 'request_body'
  | 'schema';
export type EntrypointType = 'read_endpoint' | 'state_endpoint' | 'external_receiver';
export type StateEffect = 'read_only' | 'state_mutation' | 'destructive_mutation';
export type HttpStatusText =
  | 'OK'
  | 'Created'
  | 'Payment Required'
  | 'Bad Request'
  | 'Unauthorized'
  | 'Forbidden'
  | 'Not Found'
  | 'Payload Too Large'
  | 'Unprocessable Entity'
  | 'Too Many Requests';

export interface EndpointProofProfile {
  inputTypes: Set<ProofInputType>;
  entrypointType: EntrypointType;
  stateEffect: StateEffect;
  hasExternalEffect: boolean;
  hasSchema: boolean;
  runtimeExposure: 'public' | 'protected' | 'unknown';
}

export interface PropertyExecutionResult {
  status: 'passed' | 'failed' | 'not_executed';
  failures: number;
  durationMs: number;
  counterexample: { input: unknown; expected: unknown; actual: unknown } | null;
}
