import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseConvergenceOwnerLane` declared in
 * `scripts/pulse/types.gate-failure.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverConvergenceOwnerLaneLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.gate-failure.ts',
    'PulseConvergenceOwnerLane',
  );
}
