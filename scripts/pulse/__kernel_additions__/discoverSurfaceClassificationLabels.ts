import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseSurfaceClassification` declared in
 * `scripts/pulse/types.evidence.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverSurfaceClassificationLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'PulseSurfaceClassification',
  );
}
