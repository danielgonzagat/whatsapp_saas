import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

export function discoverAutonomySuggestedStrategyLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.autonomy.ts',
    'PulseAutonomySuggestedStrategy',
  );
}
