import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/__parts__/type-contract-labels';

/**
 * Returns the string-literal union members of `PulseExternalSignalSource` declared in
 * `scripts/pulse/__parts__/types.capabilities/01-primitives.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverExternalSignalSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/__parts__/types.capabilities/01-primitives.ts',
    'PulseExternalSignalSource',
  );
}
