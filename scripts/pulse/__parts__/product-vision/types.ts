import type {
  PulseCapabilityState,
  PulseCertification,
  PulseCodacyEvidence,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseParityGapsArtifact,
  PulseResolvedManifest,
  PulseScopeState,
} from '../../types';

export interface BuildProductVisionInput {
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  certification: PulseCertification;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  resolvedManifest: PulseResolvedManifest;
  parityGaps: PulseParityGapsArtifact;
  externalSignalState?: PulseExternalSignalState;
}
