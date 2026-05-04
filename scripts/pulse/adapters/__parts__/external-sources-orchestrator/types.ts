import type {
  PulseCertificationProfile,
  PulseExternalAdapterProofBasis,
  PulseExternalAdapterRequirement,
  PulseExternalAdapterStatus,
  PulseExternalSignalSource,
  PulseSignal,
} from '../../../types';

/**
 * Adapter requiredness profile.
 * - `required`: must be configured for production-grade certification
 * - `optional`: never blocks certification (signal-only)
 * - `profile-dependent`: required for canonical final certification profiles, optional otherwise
 * - `full-product-required`: required only by the full-product profile
 */
export type AdapterRequiredness =
  | 'required'
  | 'optional'
  | 'profile-dependent'
  | 'full-product-required';

/** Profile values accepted by external-signal requiredness resolution. */
export type ExternalSignalProfile = PulseCertificationProfile | 'production-final';

/**
 * Per-adapter requiredness table.
 *
 * For canonical final profiles, the FASE 4 required set is profile-scoped.
 * pulse-core-final keeps Prometheus optional; full-product requires it.
 *
 * Note: codacy is sourced via snapshot adapter and not part of the live orchestrator
 * adapter loop, so it is excluded from this map (handled separately upstream).
 */
export const ADAPTER_REQUIREDNESS: Record<string, AdapterRequiredness> = {
  github: 'required',
  github_actions: 'required',
  codecov: 'profile-dependent',
  sentry: 'profile-dependent',
  datadog: 'profile-dependent',
  prometheus: 'full-product-required',
  dependabot: 'profile-dependent',
  gitnexus: 'optional',
};

/** Return declared adapter requiredness before active-profile resolution. */
export function getAdapterRequiredness(source: string): AdapterRequiredness {
  return ADAPTER_REQUIREDNESS[source] ?? 'optional';
}

/** Normalize legacy profile aliases to the canonical PULSE certification profiles. */
export function normalizeExternalSignalProfile(
  profile: ExternalSignalProfile | string | null | undefined,
): PulseCertificationProfile | undefined {
  if (profile === 'production-final') return 'full-product';
  if (profile === 'core-critical' || profile === 'pulse-core-final' || profile === 'full-product') {
    return profile;
  }
  return undefined;
}

/**
 * Resolve effective requiredness for a given adapter under a profile.
 * Returns true when the adapter is required (blocking) under the active profile.
 */
export function isAdapterRequired(
  source: string,
  profile: ExternalSignalProfile | string | null | undefined,
): boolean {
  const declared = ADAPTER_REQUIREDNESS[source] ?? 'optional';
  const canonicalProfile = normalizeExternalSignalProfile(profile);
  if (declared === 'required') return true;
  if (declared === 'optional') return false;
  if (declared === 'full-product-required') return canonicalProfile === 'full-product';
  return canonicalProfile === 'full-product' || canonicalProfile === 'pulse-core-final';
}

/** External sources config shape. */
export interface ExternalSourcesConfig {
  /** Root dir property. */
  rootDir: string;
  /** Github property. */
  github?: {
    owner: string;
    repo: string;
    token?: string;
  };
  /** Sentry property. */
  sentry?: {
    authToken?: string;
    org?: string;
    project?: string;
  };
  /** Datadog property. */
  datadog?: {
    apiKey?: string;
    appKey?: string;
    site?: string;
  };
  /** Prometheus property. */
  prometheus?: {
    baseUrl?: string;
    bearerToken?: string;
    query?: string;
  };
  /** Codecov property. */
  codecov?: {
    token?: string;
    owner?: string;
    repo?: string;
  };
  /** Dependabot property. */
  dependabot?: {
    token?: string;
    owner?: string;
    repo?: string;
  };
  /**
   * Active profile.
   * When a final profile is active, profile-dependent adapters become required.
   * When undefined or any other value, profile-dependent adapters become optional.
   */
  profile?: string;
  /** Active certification scope. Falls back to profile when omitted. */
  certificationScope?: string;
}

export interface ExternalSourceRunResult {
  source: PulseExternalSignalSource;
  status: PulseExternalAdapterStatus;
  signalCount: number;
  syncedAt: string;
  reason: string;
}

type ExternalSourceCapabilityKind = 'repo' | 'ci' | 'env' | 'tool' | 'config' | 'artifact';

interface ExternalSourceCapabilityEvidence {
  kind: ExternalSourceCapabilityKind;
  key: string;
  present: boolean;
  reason: string;
}

export interface ExternalSourceCapabilityMetadata {
  source: PulseExternalSignalSource;
  discovered: boolean;
  operational: boolean;
  truthAuthority: 'discovered_capability' | 'compat_adapter';
  capabilityKinds: ExternalSourceCapabilityKind[];
  evidence: ExternalSourceCapabilityEvidence[];
  compatRequiredness: AdapterRequiredness;
  compatRequired: boolean;
  missingOperationalRequirements: string[];
}

export interface ConsolidatedExternalSource extends ExternalSourceRunResult {
  requiredness: AdapterRequiredness;
  requirement: PulseExternalAdapterRequirement;
  required: boolean;
  blocking: boolean;
  proofBasis: PulseExternalAdapterProofBasis;
  missingReason: string | null;
  sourceCapability: ExternalSourceCapabilityMetadata;
}

/** Consolidated external state shape. */
export interface ConsolidatedExternalState {
  /** Generated at property. */
  generatedAt: string;
  /** Sources property. */
  sources: ConsolidatedExternalSource[];
  /** Source capability metadata discovered from repo, CI, env, and local tools. */
  sourceCapabilities: ExternalSourceCapabilityMetadata[];
  /** All signals property. */
  allSignals: PulseSignal[];
  /** Signals by source property. */
  signalsBySource: Record<string, PulseSignal[]>;
  /** Critical signals property. */
  criticalSignals: PulseSignal[];
  /** High signals property. */
  highSignals: PulseSignal[];
  /** Total severity property. */
  totalSeverity: number;
  /** Active certification profile property. */
  profile?: string;
  /** Active certification scope property. */
  certificationScope?: string;
}
