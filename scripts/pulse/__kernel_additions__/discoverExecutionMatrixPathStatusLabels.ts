import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseExecutionMatrixPathStatus` declared in
 * `scripts/pulse/types.execution-matrix.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverExecutionMatrixPathStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-matrix.ts',
    'PulseExecutionMatrixPathStatus',
  );
}
