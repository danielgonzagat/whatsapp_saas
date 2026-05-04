import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseConvergenceProductImpact` declared in
 * `scripts/pulse/types.convergence.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverConvergenceProductImpactLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceProductImpact',
  );
}
