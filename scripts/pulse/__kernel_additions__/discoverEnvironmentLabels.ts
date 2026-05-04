import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseEnvironment` declared in
 * `scripts/pulse/types.health.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverEnvironmentLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseEnvironment',
  );
}
