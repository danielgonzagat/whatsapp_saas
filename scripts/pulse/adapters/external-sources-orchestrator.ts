/**
 * External sources orchestrator for PULSE v3
 * Runs all external adapters in parallel and consolidates signals
 */

import { execFileSync } from 'child_process';
import { fetchGitHubSignals } from './github-adapter';
import { fetchSentrySignals } from './sentry-adapter';
import { fetchDatadogSignals } from './datadog-adapter';
import { fetchPrometheusSignals } from './prometheus-adapter';
import { fetchCodecovSignals } from './codecov-adapter';
import { fetchDependabotSignals } from './dependabot-adapter';
import { fetchGitHubActionsSignals } from './github-actions-adapter';
import { fetchGitNexusSignal, runGitNexusAdapter } from './gitnexus-adapter';
import type {
  PulseCertificationProfile,
  PulseExternalAdapterProofBasis,
  PulseExternalAdapterRequirement,
  PulseExternalAdapterStatus,
  PulseExternalSignalSource,
  PulseSignal,
} from '../types';
import { isDirectory, pathExists, readDir, readTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';

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

function buildLiveMissingReason(
  entry: ExternalSourceRunResult,
  required: boolean,
  proofBasis: PulseExternalAdapterProofBasis,
  profile: PulseCertificationProfile | undefined,
  sourceCapability: ExternalSourceCapabilityMetadata,
): string | null {
  if (
    entry.status !== 'not_available' &&
    entry.status !== 'invalid' &&
    entry.status !== 'stale' &&
    entry.status !== 'optional_not_configured'
  ) {
    return null;
  }

  const profileLabel = profile || 'default';
  const requirementLabel = required ? 'required' : 'optional';
  const disposition = required ? 'blocking external proof closure' : 'tracked as non-blocking';
  return `${entry.source} is ${requirementLabel} under profile=${profileLabel}; proofBasis=${proofBasis}; status=${entry.status}; sourceCapability=${sourceCapability.truthAuthority}; operational=${sourceCapability.operational}; ${disposition}. ${entry.reason}`;
}

export function classifyLiveExternalSource(
  entry: ExternalSourceRunResult,
  profile: PulseCertificationProfile | undefined,
  sourceCapability: ExternalSourceCapabilityMetadata,
): ConsolidatedExternalSource {
  const required = sourceCapability.discovered;
  const status: PulseExternalAdapterStatus =
    entry.status === 'not_available' && !sourceCapability.discovered
      ? 'optional_not_configured'
      : entry.status;
  const proofBasis: PulseExternalAdapterProofBasis = 'live_adapter';
  const requirement: PulseExternalAdapterRequirement = required ? 'required' : 'optional';
  const profileLabel = profile || 'default';
  const classifiedEntry = {
    ...entry,
    status,
    reason:
      entry.status === 'not_available' && !sourceCapability.discovered
        ? `${entry.source} adapter has no discovered repo/CI/env/tool capability under profile=${profileLabel}; compat requiredness ${sourceCapability.compatRequiredness} is metadata only.`
        : entry.reason,
    requiredness: getAdapterRequiredness(entry.source),
    requirement,
    required,
    blocking:
      required && (status === 'not_available' || status === 'invalid' || status === 'stale'),
    proofBasis,
    sourceCapability,
  };

  return {
    ...classifiedEntry,
    missingReason: buildLiveMissingReason(
      classifiedEntry,
      required,
      proofBasis,
      profile,
      sourceCapability,
    ),
  };
}

function readEnv(key: string): string | undefined {
  return process.env[key];
}

function readDotEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!pathExists(envPath)) {
    return result;
  }

  const content = readTextFile(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    if (key) {
      result[key.trim()] = valueParts
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

function parseGitHubRemoteUrl(value: string): { owner: string; repo: string } | null {
  const trimmed = value.trim();
  const match =
    trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i) ||
    trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function readGitHubRemote(rootDir: string): { owner: string; repo: string } | null {
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    });
    return parseGitHubRemoteUrl(remoteUrl);
  } catch {
    return null;
  }
}

function readCurrentHeadSha(rootDir: string): string | undefined {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    }).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

function readGitHubCliToken(): string | undefined {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function commandAvailable(command: string, args: string[] = ['--version']): boolean {
  try {
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 3_000,
    });
    return true;
  } catch {
    return false;
  }
}

function repoPathExists(rootDir: string, relativePath: string): boolean {
  return pathExists(safeJoin(rootDir, relativePath));
}

function repoDirHasFile(
  rootDir: string,
  relativePath: string,
  predicate: (fileName: string) => boolean,
): boolean {
  const dirPath = safeJoin(rootDir, relativePath);
  if (!pathExists(dirPath) || !isDirectory(dirPath)) {
    return false;
  }
  return readDir(dirPath).some(predicate);
}

function repoFilesContain(rootDir: string, relativePaths: string[], pattern: RegExp): boolean {
  return relativePaths.some((relativePath) => {
    const filePath = safeJoin(rootDir, relativePath);
    if (!pathExists(filePath)) {
      return false;
    }
    try {
      return pattern.test(readTextFile(filePath, 'utf8'));
    } catch {
      return false;
    }
  });
}

function hasEnvValue(env: Record<string, string | undefined>, keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]));
}

function presentEvidence(
  kind: ExternalSourceCapabilityKind,
  key: string,
  present: boolean,
  reason: string,
): ExternalSourceCapabilityEvidence {
  return { kind, key, present, reason };
}

interface ExternalSourceDiscoveryContext {
  rootDir: string;
  env: Record<string, string | undefined>;
  githubOwner: string;
  githubRepo: string;
  githubToken?: string;
  gitHubRemote: { owner: string; repo: string } | null;
}

function sourceCapability(
  source: PulseExternalSignalSource,
  profile: PulseCertificationProfile | undefined,
  evidence: ExternalSourceCapabilityEvidence[],
  operationalRequirements: Array<{ key: string; present: boolean }>,
): ExternalSourceCapabilityMetadata {
  const presentEvidenceItems = evidence.filter((item) => item.present);
  const missingOperationalRequirements = operationalRequirements
    .filter((requirement) => !requirement.present)
    .map((requirement) => requirement.key);
  const discovered = presentEvidenceItems.length > 0;
  const compatRequiredness = getAdapterRequiredness(source);
  return {
    source,
    discovered,
    operational: discovered && missingOperationalRequirements.length === 0,
    truthAuthority: discovered ? 'discovered_capability' : 'compat_adapter',
    capabilityKinds: [...new Set(presentEvidenceItems.map((item) => item.kind))],
    evidence,
    compatRequiredness,
    compatRequired: isAdapterRequired(source, profile),
    missingOperationalRequirements,
  };
}
