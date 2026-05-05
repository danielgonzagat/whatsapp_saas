import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/__parts__/type-contract-labels';

export function discoverAutonomySuggestedStrategyLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.autonomy.ts',
    'PulseAutonomySuggestedStrategy',
  );
}
