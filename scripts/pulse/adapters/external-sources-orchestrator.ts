export { runExternalSourcesOrchestrator } from './__parts__/external-sources-orchestrator/orchestrator';
export {
  getAdapterRequiredness,
  normalizeExternalSignalProfile,
  isAdapterRequired,
  ADAPTER_REQUIREDNESS,
} from './__parts__/external-sources-orchestrator/types';
export { discoverExternalSourceCapabilities } from './__parts__/external-sources-orchestrator/discovery';
export { classifyLiveExternalSource } from './__parts__/external-sources-orchestrator/classification';
export type {
  AdapterRequiredness,
  ExternalSignalProfile,
  ExternalSourcesConfig,
  ExternalSourceRunResult,
  ExternalSourceCapabilityMetadata,
  ConsolidatedExternalSource,
  ConsolidatedExternalState,
} from './__parts__/external-sources-orchestrator/types';
