import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseModuleState` declared in
 * `scripts/pulse/types.health.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverModuleStateLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.health.ts',
    'PulseModuleState',
  );
}
