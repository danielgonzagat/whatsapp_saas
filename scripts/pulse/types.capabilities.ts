// PULSE — Capability, flow projection, external signals, and parity gap types

export type PulseCapabilityStatus = 'real' | 'partial' | 'latent' | 'phantom';

export type PulseCapabilityMaturityStage =
  | 'foundational'
  | 'connected'
  | 'operational'
  | 'production_ready';

export type PulseDoDStatus = 'done' | 'partial' | 'latent' | 'phantom';

export type PulseFlowProjectionStatus = 'real' | 'partial' | 'latent' | 'phantom';

export type PulseExternalSignalSource =
  | 'github'
  | 'github_actions'
  | 'codacy'
  | 'codecov'
  | 'sentry'
  | 'datadog'
  | 'prometheus'
  | 'dependabot'
  | 'gitnexus';

export type PulseExternalAdapterStatus =
  | 'ready'
  | 'not_available'
  | 'stale'
  | 'invalid'
  | 'optional_not_configured';

export type PulseExternalAdapterRequiredness =
  | 'required'
  | 'optional'
  | 'profile-dependent'
  | 'full-product-required';

export type PulseExternalAdapterRequirement = 'required' | 'optional';

export type PulseExternalAdapterProofBasis =
  | 'codacy_snapshot'
  | 'live_adapter'
  | 'snapshot_artifact';

export type PulseExternalSignalType = string;

export type {
  PulseCapabilityMaturityDimensions,
  PulseCapabilityDoD,
  PulseCapabilityMaturity,
} from './__parts__/types.capabilities/02-maturity-dod';

export type {
  PulseCapability,
  PulseCapabilityStateSummary,
  PulseCapabilityState,
} from './__parts__/types.capabilities/03-capability';

export type {
  PulseFlowProjectionItem,
  PulseFlowProjectionSummary,
  PulseFlowProjection,
} from './__parts__/types.capabilities/04-flow-projection';

export type {
  PulseSignal,
  PulseExternalAdapterSnapshot,
  PulseExternalSignalSummary,
  PulseExternalSignalState,
} from './__parts__/types.capabilities/05-external-signals';

export type {
  PulseParityGap,
  PulseParityGapKind,
  PulseParityGapSeverity,
  PulseParityGapsArtifact,
  PulseParityGapsSummary,
} from './types.capabilities.parity';
