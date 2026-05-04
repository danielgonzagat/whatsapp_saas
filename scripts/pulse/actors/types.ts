import type {
  PulseActorEvidence,
  PulseBrowserEvidence,
  PulseCodebaseTruth,
  PulseEnvironment,
  PulseFlowEvidence,
  PulseManifest,
  PulseResolvedManifest,
  PulseRuntimeEvidence,
  PulseSyntheticCoverageEvidence,
  PulseWorldState,
} from '../types';

/** Pulse synthetic run mode type. */
export type PulseSyntheticRunMode = 'customer' | 'operator' | 'admin' | 'shift' | 'soak';

/** Run synthetic actors input shape. */
export interface RunSyntheticActorsInput {
  /** Root dir property. */
  rootDir: string;
  /** Environment property. */
  environment: PulseEnvironment;
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
  /** Codebase truth property. */
  codebaseTruth: PulseCodebaseTruth;
  /** Runtime evidence property. */
  runtimeEvidence: PulseRuntimeEvidence;
  /** Browser evidence property. */
  browserEvidence: PulseBrowserEvidence;
  /** Flow evidence property. */
  flowEvidence: PulseFlowEvidence;
  /** Requested modes property. */
  requestedModes?: PulseSyntheticRunMode[];
  /** Scenario ids property. */
  scenarioIds?: string[];
}

/** Pulse synthetic actor bundle shape. */
export interface PulseSyntheticActorBundle {
  /** Customer property. */
  customer: PulseActorEvidence;
  /** Operator property. */
  operator: PulseActorEvidence;
  /** Admin property. */
  admin: PulseActorEvidence;
  /** Soak property. */
  soak: PulseActorEvidence;
  /** Synthetic coverage property. */
  syntheticCoverage: PulseSyntheticCoverageEvidence;
  /** World state property. */
  worldState: PulseWorldState;
}
