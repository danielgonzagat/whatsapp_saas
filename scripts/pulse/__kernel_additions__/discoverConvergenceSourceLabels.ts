import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

/**
 * Returns the string-literal union members of `PulseConvergenceSource` declared in
 * `scripts/pulse/types.convergence.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverConvergenceSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceSource',
  );
}
