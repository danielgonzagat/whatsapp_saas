import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

export function discoverExternalAdapterRequirementLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterRequirement',
  );
}
