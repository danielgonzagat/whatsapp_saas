import type {
  PulseStructuralGraph,
  PulseScopeState,
  PulseResolvedManifest,
  PulseProductGraph,
} from '../../types';
import { mapToExtendedMode } from './helpers';
import { discoverSurfaces } from './surfaces';
import { discoverCapabilities } from './capabilities';
import { discoverFlows, findOrphanedArtifactIds } from './flows';

export interface BuildProductModelInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  resolvedManifest: PulseResolvedManifest;
}

export function buildProductModel(input: BuildProductModelInput): PulseProductGraph {
  const { structuralGraph, scopeState, resolvedManifest } = input;
  const surfaces = discoverSurfaces(structuralGraph, scopeState, resolvedManifest);
  const capabilities = discoverCapabilities(
    structuralGraph,
    surfaces,
    scopeState,
    resolvedManifest,
  );
  const flows = discoverFlows(capabilities, structuralGraph, resolvedManifest);
  const orphanedArtifactIds = findOrphanedArtifactIds(structuralGraph, capabilities);
  return {
    surfaces,
    capabilities,
    flows,
    orphanedArtifactIds,
    phantomCapabilities: capabilities
      .filter((c) => mapToExtendedMode(c.truthMode) === 'phantom')
      .map((c) => c.id),
    latentCapabilities: capabilities
      .filter((c) => mapToExtendedMode(c.truthMode) === 'latent')
      .map((c) => c.id),
  };
}
