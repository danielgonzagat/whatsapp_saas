import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

/**
 * Returns the string-literal union members of `PulseFlowProjectionStatus` declared in
 * `scripts/pulse/types.capabilities/01-primitives.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverFlowProjectionStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities/01-primitives.ts',
    'PulseFlowProjectionStatus',
  );
}
