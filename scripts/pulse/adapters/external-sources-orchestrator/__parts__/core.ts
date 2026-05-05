/**
 * External sources orchestrator — core types, requiredness, and classification.
 */

import type { PulseCertificationProfile } from '../../../types.health';
import type {
  PulseExternalAdapterProofBasis,
  PulseExternalAdapterRequirement,
  PulseExternalAdapterStatus,
  PulseExternalSignalSource,
  PulseSignal,
} from '../../../types.capabilities';
import { deriveZeroValue } from '../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { safeJoin } from '../../../safe-path';
import {
  fullProductProfile,
  pulseCoreFinalProfile,
  fullProductRequiredRequiredness,
  liveAdapterProofBasis,
  notAvailableStatus,
  optionalNotConfiguredStatus,
  optionalRequirement,
  optionalRequiredness,
  profileDependentRequiredness,
  requiredRequirement,
  requiredRequiredness,
  resolveBlockingStatusSet,
  staleStatus,
  invalidStatus,
  readDotEnvFile,
  readEnv,
  readGitHubRemote,
  readGitHubCliToken,
} from './helpers';
import type { ExternalSourceCapabilityEvidence, ExternalSourceCapabilityKind } from './helpers';
import { discoverCertificationProfileLabels } from '../../../dynamic-reality-kernel/__parts__/type-contract-engines';

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
  github: requiredRequiredness() as AdapterRequiredness,
  github_actions: requiredRequiredness() as AdapterRequiredness,
  codecov: profileDependentRequiredness() as AdapterRequiredness,
  sentry: profileDependentRequiredness() as AdapterRequiredness,
  datadog: profileDependentRequiredness() as AdapterRequiredness,
  prometheus: fullProductRequiredRequiredness() as AdapterRequiredness,
  dependabot: profileDependentRequiredness() as AdapterRequiredness,
  gitnexus: optionalRequiredness() as AdapterRequiredness,
};

/** Return declared adapter requiredness before active-profile resolution. */
export function getAdapterRequiredness(source: string): AdapterRequiredness {
  return ADAPTER_REQUIREDNESS[source] ?? (optionalRequiredness() as AdapterRequiredness);
}

/** Normalize legacy profile aliases to the canonical PULSE certification profiles. */
export function normalizeExternalSignalProfile(
  profile: ExternalSignalProfile | string | null | undefined,
): PulseCertificationProfile | undefined {
  const canonicalProfiles = [...discoverCertificationProfileLabels()];
  if (profile === 'production-final') return fullProductProfile();
  if (
    profile === canonicalProfiles[0] ||
    profile === pulseCoreFinalProfile() ||
    profile === fullProductProfile()
  ) {
    return profile as PulseCertificationProfile;
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
  const declared = ADAPTER_REQUIREDNESS[source] ?? (optionalRequiredness() as AdapterRequiredness);
  const canonicalProfile = normalizeExternalSignalProfile(profile);
  if (declared === (requiredRequiredness() as AdapterRequiredness)) return true;
  if (declared === (optionalRequiredness() as AdapterRequiredness)) return false;
  if (declared === (fullProductRequiredRequiredness() as AdapterRequiredness))
    return canonicalProfile === fullProductProfile();
  return canonicalProfile === fullProductProfile() || canonicalProfile === pulseCoreFinalProfile();
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

export function buildLiveMissingReason(
  entry: ExternalSourceRunResult,
  required: boolean,
  proofBasis: PulseExternalAdapterProofBasis,
  profile: PulseCertificationProfile | undefined,
  sourceCapabilityMeta: ExternalSourceCapabilityMetadata,
): string | null {
  if (!resolveBlockingStatusSet().has(entry.status)) {
    return null;
  }

  const profileLabel = profile || 'default';
  const requirementLabel = required ? requiredRequirement() : optionalRequirement();
  const disposition = required ? 'blocking external proof closure' : 'tracked as non-blocking';
  return `${entry.source} is ${requirementLabel} under profile=${profileLabel}; proofBasis=${proofBasis}; status=${entry.status}; sourceCapability=${sourceCapabilityMeta.truthAuthority}; operational=${sourceCapabilityMeta.operational}; ${disposition}. ${entry.reason}`;
}

export function classifyLiveExternalSource(
  entry: ExternalSourceRunResult,
  profile: PulseCertificationProfile | undefined,
  sourceCapabilityMeta: ExternalSourceCapabilityMetadata,
): ConsolidatedExternalSource {
  const required = sourceCapabilityMeta.discovered;
  const status: PulseExternalAdapterStatus =
    entry.status === notAvailableStatus() && !sourceCapabilityMeta.discovered
      ? optionalNotConfiguredStatus()
      : entry.status;
  const proofBasis: PulseExternalAdapterProofBasis = liveAdapterProofBasis();
  const requirement: PulseExternalAdapterRequirement = required
    ? requiredRequirement()
    : optionalRequirement();
  const profileLabel = profile || 'default';
  const classifiedEntry = {
    ...entry,
    status,
    reason:
      entry.status === notAvailableStatus() && !sourceCapabilityMeta.discovered
        ? `${entry.source} adapter has no discovered repo/CI/env/tool capability under profile=${profileLabel}; compat requiredness ${sourceCapabilityMeta.compatRequiredness} is metadata only.`
        : entry.reason,
    requiredness: getAdapterRequiredness(entry.source),
    requirement,
    required,
    blocking:
      required &&
      (status === notAvailableStatus() || status === invalidStatus() || status === staleStatus()),
    proofBasis,
    sourceCapability: sourceCapabilityMeta,
  };

  return {
    ...classifiedEntry,
    missingReason: buildLiveMissingReason(
      classifiedEntry,
      required,
      proofBasis,
      profile,
      sourceCapabilityMeta,
    ),
  };
}

export function sourceCapability(
  source: PulseExternalSignalSource,
  profile: PulseCertificationProfile | undefined,
  evidence: ExternalSourceCapabilityEvidence[],
  operationalRequirements: Array<{ key: string; present: boolean }>,
): ExternalSourceCapabilityMetadata {
  const presentEvidenceItems = evidence.filter((item) => item.present);
  const missingOperationalRequirements = operationalRequirements
    .filter((requirement) => !requirement.present)
    .map((requirement) => requirement.key);
  const discovered = presentEvidenceItems.length > deriveZeroValue();
  const compatRequiredness = getAdapterRequiredness(source);
  return {
    source,
    discovered,
    operational: discovered && missingOperationalRequirements.length === deriveZeroValue(),
    truthAuthority: discovered ? 'discovered_capability' : 'compat_adapter',
    capabilityKinds: [...new Set(presentEvidenceItems.map((item) => item.kind))],
    evidence,
    compatRequiredness,
    compatRequired: isAdapterRequired(source, profile),
    missingOperationalRequirements,
  };
}

export function pushSourceErrorResult(
  sourceMap: Record<string, PulseSignal[]>,
  sourceList: ExternalSourceRunResult[],
  source: PulseExternalSignalSource,
  reason: string,
  generatedAt: string,
): void {
  sourceMap[source] = [];
  sourceList.push({
    source,
    status: invalidStatus(),
    signalCount: deriveZeroValue(),
    syncedAt: generatedAt,
    reason,
  });
}

export function pushSourceNotAvailableResult(
  sourceMap: Record<string, PulseSignal[]>,
  sourceList: ExternalSourceRunResult[],
  source: PulseExternalSignalSource,
  reason: string,
  generatedAt: string,
): void {
  sourceMap[source] = [];
  sourceList.push({
    source,
    status: notAvailableStatus(),
    signalCount: deriveZeroValue(),
    syncedAt: generatedAt,
    reason,
  });
}

export function buildOrchestrationContext(config: ExternalSourcesConfig): {
  generatedAt: string;
  mergedEnv: Record<string, string | undefined>;
  gitHubRemote: { owner: string; repo: string } | null;
  githubOwner: string;
  githubRepo: string;
  githubToken: string | undefined;
} {
  const generatedAt = new Date().toISOString();

  const envLocal = readDotEnvFile(safeJoin(config.rootDir, '.env.pulse.local'));
  const envPath = readDotEnvFile(safeJoin(config.rootDir, '.env'));

  const mergedEnv = { ...process.env, ...envPath, ...envLocal };
  const gitHubRemote = readGitHubRemote(config.rootDir);
  const githubOwner =
    config.github?.owner || mergedEnv['GITHUB_OWNER'] || gitHubRemote?.owner || '';
  const githubRepo = config.github?.repo || mergedEnv['GITHUB_REPO'] || gitHubRemote?.repo || '';
  const githubToken =
    config.github?.token ||
    mergedEnv['GITHUB_TOKEN'] ||
    readEnv('GITHUB_TOKEN') ||
    readGitHubCliToken();

  return { generatedAt, mergedEnv, gitHubRemote, githubOwner, githubRepo, githubToken };
}
