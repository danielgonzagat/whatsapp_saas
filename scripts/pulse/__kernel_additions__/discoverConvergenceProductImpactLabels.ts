import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

export function discoverConvergenceProductImpactLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceProductImpact',
  );
}
