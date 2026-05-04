import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseExternalAdapterProofBasis` declared in
 * `scripts/pulse/types.capabilities.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverExternalAdapterProofBasisLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterProofBasis',
  );
}
