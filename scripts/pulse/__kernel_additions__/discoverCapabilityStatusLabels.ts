import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseCapabilityStatus` declared in
 * `scripts/pulse/types.capabilities.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverCapabilityStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseCapabilityStatus',
  );
}
