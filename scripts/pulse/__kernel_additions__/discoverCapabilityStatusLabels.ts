import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/__parts__/type-contract-labels';

/**
 * Returns the string-literal union members of `PulseCapabilityStatus` declared in
 * `scripts/pulse/__parts__/types.capabilities/01-primitives.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverCapabilityStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/__parts__/types.capabilities/01-primitives.ts',
    'PulseCapabilityStatus',
  );
}
