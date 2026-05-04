import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseCapabilityMaturityStage` declared in
 * `scripts/pulse/types.capabilities.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverCapabilityMaturityStageLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseCapabilityMaturityStage',
  );
}
