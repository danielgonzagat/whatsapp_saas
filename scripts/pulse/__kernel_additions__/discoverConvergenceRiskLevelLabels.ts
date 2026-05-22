import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

export function discoverConvergenceRiskLevelLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceRiskLevel',
  );
}
