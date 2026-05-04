import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of `PulseAutonomySuggestedStrategy` declared in
 * `scripts/pulse/types.autonomy.ts`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function discoverAutonomySuggestedStrategyLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.autonomy.ts',
    'PulseAutonomySuggestedStrategy',
  );
}
