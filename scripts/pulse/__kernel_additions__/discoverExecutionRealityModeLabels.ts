import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseExecutionRealityMode` declared in
 * `scripts/pulse/types.execution-reality-audit.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverExecutionRealityModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-reality-audit.ts',
    'PulseExecutionRealityMode',
  );
}
