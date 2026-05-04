import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseCertificationProfile` declared in
 * `scripts/pulse/types.health.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverCertificationProfileLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseCertificationProfile',
  );
}
