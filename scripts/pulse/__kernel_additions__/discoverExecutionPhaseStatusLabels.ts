import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseExecutionPhaseStatus` declared in
 * `scripts/pulse/types.evidence.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverExecutionPhaseStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'PulseExecutionPhaseStatus',
  );
}
