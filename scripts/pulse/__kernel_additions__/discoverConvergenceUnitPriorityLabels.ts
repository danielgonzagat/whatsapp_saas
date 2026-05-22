import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

/**
 * Returns the string-literal union members of `PulseConvergenceUnitPriority` declared in
 * `scripts/pulse/types.convergence.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverConvergenceUnitPriorityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitPriority',
  );
}
