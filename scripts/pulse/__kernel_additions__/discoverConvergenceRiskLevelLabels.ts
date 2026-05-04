import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

export function discoverConvergenceRiskLevelLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceRiskLevel',
  );
}
