import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/__parts__/type-contract-labels';

export function discoverExternalAdapterRequirementLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/__parts__/types.capabilities/01-primitives.ts',
    'PulseExternalAdapterRequirement',
  );
}
