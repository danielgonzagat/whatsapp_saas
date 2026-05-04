type CapabilityTruthMode = 'real' | 'partial' | 'latent' | 'phantom';
type ArtifactLayer = 'frontend' | 'backend' | 'persistence' | 'worker' | 'external' | 'evidence';
const MAX_PRODUCT_SURFACES = 120;
const MAX_SURFACE_ARTIFACT_IDS = 250;
const MAX_PRODUCT_CAPABILITIES = 400;
const MAX_CAPABILITY_ARTIFACT_IDS = 120;
const MAX_PRODUCT_FLOWS = 300;
export {
  MAX_PRODUCT_SURFACES,
  MAX_SURFACE_ARTIFACT_IDS,
  MAX_PRODUCT_CAPABILITIES,
  MAX_CAPABILITY_ARTIFACT_IDS,
  MAX_PRODUCT_FLOWS,
};
export type { CapabilityTruthMode, ArtifactLayer };
