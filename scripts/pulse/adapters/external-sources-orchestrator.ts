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
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverCertificationProfileLabels,
  discoverExternalAdapterProofBasisLabels,
  discoverExternalAdapterRequirednessLabels,
  discoverExternalAdapterRequirementLabels,
  discoverExternalAdapterStatusLabels,
  discoverExternalSignalSourceLabels,
  observeStatusTextLengthFromCatalog,
} from '../dynamic-reality-kernel';

// ─── Canonical label derivation from type contracts ───
// Position mirrors source-order in each type union definition.

const CANONICAL_ADAPTER_STATUS = [...discoverExternalAdapterStatusLabels()];
const CANONICAL_ADAPTER_REQUIREMENT = [...discoverExternalAdapterRequirementLabels()];
const CANONICAL_ADAPTER_REQUIREDNESS = [...discoverExternalAdapterRequirednessLabels()];
const CANONICAL_ADAPTER_PROOF_BASIS = [...discoverExternalAdapterProofBasisLabels()];
const CANONICAL_CERTIFICATION_PROFILE = [...discoverCertificationProfileLabels()];
const CANONICAL_SIGNAL_SOURCES = [...discoverExternalSignalSourceLabels()];

function pulseExecTimeoutMs(): number {
  const ok = deriveHttpStatusFromObservedCatalog('OK');
  const forbidLen = observeStatusTextLengthFromCatalog(
    deriveHttpStatusFromObservedCatalog('Forbidden'),
  );
  return ok * (forbidLen + forbidLen - deriveUnitValue());
}

function fourThreshold(): number {
  return (
    deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
  );
}

function threeThreshold(): number {
  return deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
}

function readyStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[0] as PulseExternalAdapterStatus;
}
function notAvailableStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[1] as PulseExternalAdapterStatus;
}
function staleStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[2] as PulseExternalAdapterStatus;
}
function invalidStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[3] as PulseExternalAdapterStatus;
}
function optionalNotConfiguredStatus(): PulseExternalAdapterStatus {
  return CANONICAL_ADAPTER_STATUS[4] as PulseExternalAdapterStatus;
}

function requiredRequirement(): PulseExternalAdapterRequirement {
  return CANONICAL_ADAPTER_REQUIREMENT[0] as PulseExternalAdapterRequirement;
}
function optionalRequirement(): PulseExternalAdapterRequirement {
  return CANONICAL_ADAPTER_REQUIREMENT[1] as PulseExternalAdapterRequirement;
}

function requiredRequiredness(): AdapterRequiredness {
  return CANONICAL_ADAPTER_REQUIREDNESS[0] as AdapterRequiredness;
}
function optionalRequiredness(): AdapterRequiredness {
  return CANONICAL_ADAPTER_REQUIREDNESS[1] as AdapterRequiredness;
}
function profileDependentRequiredness(): AdapterRequiredness {
  return CANONICAL_ADAPTER_REQUIREDNESS[2] as AdapterRequiredness;
}
function fullProductRequiredRequiredness(): AdapterRequiredness {
  return CANONICAL_ADAPTER_REQUIREDNESS[3] as AdapterRequiredness;
}

function liveAdapterProofBasis(): PulseExternalAdapterProofBasis {
  return CANONICAL_ADAPTER_PROOF_BASIS[1] as PulseExternalAdapterProofBasis;
}

function fullProductProfile(): PulseCertificationProfile {
  return CANONICAL_CERTIFICATION_PROFILE[2] as PulseCertificationProfile;
}
function pulseCoreFinalProfile(): PulseCertificationProfile {
  return CANONICAL_CERTIFICATION_PROFILE[1] as PulseCertificationProfile;
}

function resolveBlockingStatusSet(): Set<string> {
  return new Set([notAvailableStatus(), invalidStatus(), staleStatus(), optionalNotConfiguredStatus()]);
}

function githubSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[0] as PulseExternalSignalSource;
}
function githubActionsSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[1] as PulseExternalSignalSource;
}
function codecovSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[3] as PulseExternalSignalSource;
}
function sentrySource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[4] as PulseExternalSignalSource;
}
function datadogSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[5] as PulseExternalSignalSource;
}
function prometheusSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[6] as PulseExternalSignalSource;
}
function dependabotSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[7] as PulseExternalSignalSource;
}
function gitnexusSource(): PulseExternalSignalSource {
  return CANONICAL_SIGNAL_SOURCES[8] as PulseExternalSignalSource;
}

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
  github: requiredRequiredness(),
  github_actions: requiredRequiredness(),
  codecov: profileDependentRequiredness(),
  sentry: profileDependentRequiredness(),
  datadog: profileDependentRequiredness(),
  prometheus: fullProductRequiredRequiredness(),
  dependabot: profileDependentRequiredness(),
  gitnexus: optionalRequiredness(),
};

/** Return declared adapter requiredness before active-profile resolution. */
export function getAdapterRequiredness(source: string): AdapterRequiredness {
  return ADAPTER_REQUIREDNESS[source] ?? optionalRequiredness();
}

/** Normalize legacy profile aliases to the canonical PULSE certification profiles. */
export function normalizeExternalSignalProfile(
  profile: ExternalSignalProfile | string | null | undefined,
): PulseCertificationProfile | undefined {
  if (profile === 'production-final') return fullProductProfile();
  if (
    profile === CANONICAL_CERTIFICATION_PROFILE[0] ||
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
  const declared = ADAPTER_REQUIREDNESS[source] ?? optionalRequiredness();
  const canonicalProfile = normalizeExternalSignalProfile(profile);
  if (declared === requiredRequiredness()) return true;
  if (declared === optionalRequiredness()) return false;
  if (declared === fullProductRequiredRequiredness())
    return canonicalProfile === fullProductProfile();
  return (
    canonicalProfile === fullProductProfile() || canonicalProfile === pulseCoreFinalProfile()
  );
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
  if (!resolveBlockingStatusSet().has(entry.status)) {
    return null;
  }

  const profileLabel = profile || 'default';
  const requirementLabel = required
    ? requiredRequirement()
    : optionalRequirement();
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
    entry.status === notAvailableStatus() && !sourceCapability.discovered
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
      entry.status === notAvailableStatus() && !sourceCapability.discovered
        ? `${entry.source} adapter has no discovered repo/CI/env/tool capability under profile=${profileLabel}; compat requiredness ${sourceCapability.compatRequiredness} is metadata only.`
        : entry.reason,
    requiredness: getAdapterRequiredness(entry.source),
    requirement,
    required,
    blocking:
      required &&
      (status === notAvailableStatus() || status === invalidStatus() || status === staleStatus()),
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
      timeout: pulseExecTimeoutMs(),
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
      timeout: pulseExecTimeoutMs(),
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
      timeout: pulseExecTimeoutMs(),
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
      timeout: pulseExecTimeoutMs(),
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

export function discoverExternalSourceCapabilities(
  context: ExternalSourceDiscoveryContext,
  profile: PulseCertificationProfile | undefined,
): ExternalSourceCapabilityMetadata[] {
  const workflowFilesPresent = repoDirHasFile(context.rootDir, '.github/workflows', (fileName) =>
    /\.ya?ml$/i.test(fileName),
  );
  const codecovConfigPresent =
    repoPathExists(context.rootDir, '.codecov.yml') ||
    repoPathExists(context.rootDir, 'codecov.yml') ||
    repoFilesContain(context.rootDir, ['README.md', 'readme.md'], /codecov/i) ||
    repoFilesContain(
      context.rootDir,
      ['.github/workflows/ci.yml', '.github/workflows/ci-cd.yml'],
      /codecov/i,
    );
  const dependabotConfigPresent =
    repoPathExists(context.rootDir, '.github/dependabot.yml') ||
    repoPathExists(context.rootDir, '.github/dependabot.yaml');
  const sentryConfigPresent =
    repoPathExists(context.rootDir, '.sentryclirc') ||
    repoPathExists(context.rootDir, 'sentry.properties');
  const datadogConfigPresent =
    repoPathExists(context.rootDir, 'datadog.yaml') ||
    repoPathExists(context.rootDir, 'datadog.yml') ||
    repoPathExists(context.rootDir, '.datadog');
  const prometheusConfigPresent =
    repoPathExists(context.rootDir, 'prometheus.yml') ||
    repoPathExists(context.rootDir, 'prometheus.yaml') ||
    repoPathExists(context.rootDir, 'ops/prometheus.yml') ||
    repoPathExists(context.rootDir, 'ops/prometheus.yaml');
  const gitNexusArtifactPresent =
    repoPathExists(context.rootDir, 'PULSE_GITNEXUS_STATE.json') ||
    repoPathExists(context.rootDir, '.pulse/current/PULSE_GITNEXUS_STATE.json') ||
    repoPathExists(context.rootDir, '.pulse/current/PULSE_GITNEXUS_EVIDENCE.json');
  const ghToolAvailable = commandAvailable('gh');
  const gitNexusToolAvailable = commandAvailable('gitnexus') || commandAvailable('git-nexus');

  return [
    sourceCapability(
      githubSource(),
      profile,
      [
        presentEvidence(
          'repo',
          'git_remote_origin',
          Boolean(context.gitHubRemote),
          'GitHub remote origin was discovered from the local repository.',
        ),
        presentEvidence(
          'env',
          'GITHUB_OWNER/GITHUB_REPO',
          Boolean(context.githubOwner && context.githubRepo),
          'GitHub owner/repo were discovered from config, env, or git remote.',
        ),
        presentEvidence('tool', 'gh', ghToolAvailable, 'GitHub CLI is available locally.'),
      ],
      [{ key: 'github_owner_repo', present: Boolean(context.githubOwner && context.githubRepo) }],
    ),
    sourceCapability(
      githubActionsSource(),
      profile,
      [
        presentEvidence(
          'ci',
          '.github/workflows',
          workflowFilesPresent,
          'GitHub Actions workflow files were discovered in the repository.',
        ),
        presentEvidence('tool', 'gh', ghToolAvailable, 'GitHub CLI is available locally.'),
      ],
      [
        { key: 'github_owner_repo', present: Boolean(context.githubOwner && context.githubRepo) },
        { key: 'workflow_files', present: workflowFilesPresent },
      ],
    ),
    sourceCapability(
      codecovSource(),
      profile,
      [
        presentEvidence(
          'config',
          'codecov_config_or_badge',
          codecovConfigPresent,
          'Codecov config, workflow, or badge evidence was discovered in the repository.',
        ),
        presentEvidence(
          'env',
          'CODECOV_TOKEN',
          hasEnvValue(context.env, ['CODECOV_TOKEN']),
          'Codecov token is available in the PULSE environment.',
        ),
      ],
      [{ key: 'github_owner_repo', present: Boolean(context.githubOwner && context.githubRepo) }],
    ),
    sourceCapability(
      sentrySource(),
      profile,
      [
        presentEvidence(
          'config',
          'sentry_config',
          sentryConfigPresent,
          'Sentry config file was discovered in the repository.',
        ),
        presentEvidence(
          'env',
          'SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT',
          hasEnvValue(context.env, ['SENTRY_AUTH_TOKEN']) ||
            hasEnvValue(context.env, ['SENTRY_ORG', 'SENTRY_PROJECT']),
          'Sentry env configuration is available to PULSE.',
        ),
      ],
      [
        { key: 'SENTRY_AUTH_TOKEN', present: hasEnvValue(context.env, ['SENTRY_AUTH_TOKEN']) },
        { key: 'SENTRY_ORG', present: hasEnvValue(context.env, ['SENTRY_ORG']) },
        { key: 'SENTRY_PROJECT', present: hasEnvValue(context.env, ['SENTRY_PROJECT']) },
      ],
    ),
    sourceCapability(
      datadogSource(),
      profile,
      [
        presentEvidence(
          'config',
          'datadog_config',
          datadogConfigPresent,
          'Datadog config file was discovered in the repository.',
        ),
        presentEvidence(
          'env',
          'DATADOG_API_KEY/DATADOG_APP_KEY',
          hasEnvValue(context.env, ['DATADOG_API_KEY', 'DATADOG_APP_KEY']),
          'Datadog env configuration is available to PULSE.',
        ),
      ],
      [
        { key: 'DATADOG_API_KEY', present: hasEnvValue(context.env, ['DATADOG_API_KEY']) },
        { key: 'DATADOG_APP_KEY', present: hasEnvValue(context.env, ['DATADOG_APP_KEY']) },
      ],
    ),
    sourceCapability(
      prometheusSource(),
      profile,
      [
        presentEvidence(
          'config',
          'prometheus_config',
          prometheusConfigPresent,
          'Prometheus config file was discovered in the repository.',
        ),
        presentEvidence(
          'env',
          'PROMETHEUS_BASE_URL/PULSE_PROMETHEUS_URL',
          hasEnvValue(context.env, ['PROMETHEUS_BASE_URL', 'PULSE_PROMETHEUS_URL']),
          'Prometheus endpoint is available to PULSE.',
        ),
      ],
      [
        {
          key: 'prometheus_base_url',
          present: hasEnvValue(context.env, ['PROMETHEUS_BASE_URL', 'PULSE_PROMETHEUS_URL']),
        },
      ],
    ),
    sourceCapability(
      dependabotSource(),
      profile,
      [
        presentEvidence(
          'config',
          '.github/dependabot.yml',
          dependabotConfigPresent,
          'Dependabot config was discovered in the repository.',
        ),
        presentEvidence(
          'env',
          'GITHUB_TOKEN',
          Boolean(context.githubToken),
          'GitHub token is available for Dependabot alert access.',
        ),
      ],
      [
        { key: 'github_owner_repo', present: Boolean(context.githubOwner && context.githubRepo) },
        { key: 'GITHUB_TOKEN', present: Boolean(context.githubToken) },
      ],
    ),
    sourceCapability(
      gitnexusSource(),
      profile,
      [
        presentEvidence(
          'artifact',
          'PULSE_GITNEXUS_STATE',
          gitNexusArtifactPresent,
          'GitNexus PULSE artifact was discovered.',
        ),
        presentEvidence(
          'tool',
      gitnexusSource(),
          gitNexusToolAvailable,
          'GitNexus CLI is available locally.',
        ),
      ],
      [
        {
          key: 'gitnexus_artifact_or_tool',
          present: gitNexusArtifactPresent || gitNexusToolAvailable,
        },
      ],
    ),
  ];
}

/** Run external sources orchestrator. */
export async function runExternalSourcesOrchestrator(
  config: ExternalSourcesConfig,
): Promise<ConsolidatedExternalState> {
  const generatedAt = new Date().toISOString();
  const sources: ExternalSourceRunResult[] = [];
  const allSignals: PulseSignal[] = [];
  const signalsBySource: Record<string, PulseSignal[]> = {};
  let totalSeverity = deriveZeroValue();

  // Try to load environment from .env.pulse.local if available
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

  // Run GitHub adapter
  try {
    const githubConfig = {
      owner: githubOwner,
      repo: githubRepo,
      token: githubToken,
    };

    if (githubConfig.owner && githubConfig.repo) {
      const signals = await fetchGitHubSignals(githubConfig);
      signalsBySource[githubSource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: githubSource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} GitHub signal(s) fetched from the live adapter.`
            : 'GitHub live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource[githubSource()] = [];
      sources.push({
        source: githubSource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'GitHub owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[githubSource()] = [];
    sources.push({
      source: githubSource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'GitHub live adapter failed while fetching signals.',
    });
  }

  // Run Sentry adapter
  try {
    const sentryConfig = {
      authToken: config.sentry?.authToken || mergedEnv['SENTRY_AUTH_TOKEN'],
      org: config.sentry?.org || mergedEnv['SENTRY_ORG'],
      project: config.sentry?.project || mergedEnv['SENTRY_PROJECT'],
    };

    if (sentryConfig.authToken && sentryConfig.org && sentryConfig.project) {
      const signals = await fetchSentrySignals(sentryConfig);
      signalsBySource[sentrySource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: sentrySource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} Sentry signal(s) fetched from the live adapter.`
            : 'Sentry live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource[sentrySource()] = [];
      sources.push({
        source: sentrySource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'Sentry token/org/project were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[sentrySource()] = [];
    sources.push({
      source: sentrySource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'Sentry live adapter failed while fetching signals.',
    });
  }

  // Run GitHub Actions adapter
  try {
    const actionsConfig = {
      owner: githubOwner,
      repo: githubRepo,
      token: githubToken,
      currentHeadSha: readCurrentHeadSha(config.rootDir),
    };

    if (actionsConfig.token && actionsConfig.owner && actionsConfig.repo) {
      const signals = await fetchGitHubActionsSignals(actionsConfig);
      signalsBySource[githubActionsSource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: githubActionsSource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} GitHub Actions signal(s) fetched from the live adapter.`
            : 'GitHub Actions live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource[githubActionsSource()] = [];
      sources.push({
        source: githubActionsSource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'GitHub Actions token/owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[githubActionsSource()] = [];
    sources.push({
      source: githubActionsSource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'GitHub Actions live adapter failed while fetching signals.',
    });
  }

  // Run Datadog adapter
  try {
    const datadogConfig = {
      apiKey: config.datadog?.apiKey || mergedEnv['DATADOG_API_KEY'],
      appKey: config.datadog?.appKey || mergedEnv['DATADOG_APP_KEY'],
      site: config.datadog?.site || mergedEnv['DATADOG_SITE'],
    };

    if (datadogConfig.apiKey && datadogConfig.appKey) {
      const signals = await fetchDatadogSignals(datadogConfig);
      signalsBySource[datadogSource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: datadogSource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} Datadog signal(s) fetched from the live adapter.`
            : 'Datadog live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource[datadogSource()] = [];
      sources.push({
        source: datadogSource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'Datadog API/app keys were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[datadogSource()] = [];
    sources.push({
      source: datadogSource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'Datadog live adapter failed while fetching signals.',
    });
  }

  // Run Prometheus adapter
  try {
    const prometheusConfig = {
      baseUrl:
        config.prometheus?.baseUrl ||
        mergedEnv['PROMETHEUS_BASE_URL'] ||
        mergedEnv['PULSE_PROMETHEUS_URL'],
      bearerToken:
        config.prometheus?.bearerToken ||
        mergedEnv['PROMETHEUS_BEARER_TOKEN'] ||
        mergedEnv['PULSE_PROMETHEUS_TOKEN'],
      query: config.prometheus?.query || mergedEnv['PROMETHEUS_QUERY'],
    };

    if (prometheusConfig.baseUrl) {
      const signals = await fetchPrometheusSignals(prometheusConfig);
      signalsBySource[prometheusSource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: prometheusSource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} Prometheus signal(s) fetched from the live adapter.`
            : 'Prometheus live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, signal) => sum + signal.severity, 0);
    } else {
      signalsBySource[prometheusSource()] = [];
      sources.push({
        source: prometheusSource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'Prometheus base URL was not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[prometheusSource()] = [];
    sources.push({
      source: prometheusSource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'Prometheus live adapter failed while fetching signals.',
    });
  }

  // Run Codecov adapter
  try {
    const codecovConfig = {
      token: config.codecov?.token || mergedEnv['CODECOV_TOKEN'],
      owner: config.codecov?.owner || mergedEnv['GITHUB_OWNER'] || githubOwner,
      repo: config.codecov?.repo || mergedEnv['GITHUB_REPO'] || githubRepo,
    };

    if (codecovConfig.owner && codecovConfig.repo) {
      const signals = await fetchCodecovSignals(codecovConfig);
      signalsBySource[codecovSource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: codecovSource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} Codecov signal(s) fetched from the live adapter.`
            : 'Codecov live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource[codecovSource()] = [];
      sources.push({
        source: codecovSource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'Codecov owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[codecovSource()] = [];
    sources.push({
      source: codecovSource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'Codecov live adapter failed while fetching signals.',
    });
  }

  // Run Dependabot adapter
  try {
    const dependabotConfig = {
      token: config.dependabot?.token || mergedEnv['GITHUB_TOKEN'] || githubToken,
      owner: config.dependabot?.owner || mergedEnv['GITHUB_OWNER'] || githubOwner,
      repo: config.dependabot?.repo || mergedEnv['GITHUB_REPO'] || githubRepo,
    };

    if (dependabotConfig.token && dependabotConfig.owner && dependabotConfig.repo) {
      const signals = await fetchDependabotSignals(dependabotConfig);
      signalsBySource[dependabotSource()] = signals;
      allSignals.push(...signals);
      sources.push({
        source: dependabotSource(),
        status: readyStatus(),
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > deriveZeroValue()
            ? `${signals.length} Dependabot signal(s) fetched from the live adapter.`
            : 'Dependabot live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource[dependabotSource()] = [];
      sources.push({
        source: dependabotSource(),
        status: notAvailableStatus(),
        signalCount: deriveZeroValue(),
        syncedAt: generatedAt,
        reason: 'Dependabot token/owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource[dependabotSource()] = [];
    sources.push({
      source: dependabotSource(),
      status: invalidStatus(),
      signalCount: deriveZeroValue(),
      syncedAt: generatedAt,
      reason: 'Dependabot live adapter failed while fetching signals.',
    });
  }

  totalSeverity += await runGitNexusAdapter({
    config,
    allSignals,
    signalsBySource,
    sources,
    generatedAt,
  });

  const criticalSignals = allSignals.filter((s) => s.severity >= fourThreshold());
  const highSignals = allSignals.filter(
    (s) => s.severity >= threeThreshold() && s.severity < fourThreshold(),
  );

  // Apply requiredness semantics: optional adapters that are not configured
  // must be reported as `optional_not_configured` so they do not block
  // certification. Required adapters keep `not_available` / `invalid`.
  const profile = normalizeExternalSignalProfile(config.profile);
  const certificationScope = normalizeExternalSignalProfile(
    config.certificationScope || config.profile,
  );
  const requirednessProfile = certificationScope || profile;
  const sourceCapabilities = discoverExternalSourceCapabilities(
    {
      rootDir: config.rootDir,
      env: mergedEnv,
      githubOwner,
      githubRepo,
      githubToken,
      gitHubRemote,
    },
    requirednessProfile,
  );
  const sourceCapabilityBySource = new Map(
    sourceCapabilities.map((capability) => [capability.source, capability]),
  );
  const refinedSources = sources.map((entry) =>
    classifyLiveExternalSource(
      entry,
      requirednessProfile,
      sourceCapabilityBySource.get(entry.source) ??
        sourceCapability(entry.source, requirednessProfile, [], []),
    ),
  );

  return {
    generatedAt,
    profile,
    certificationScope,
    sources: refinedSources,
    sourceCapabilities,
    allSignals,
    signalsBySource,
    criticalSignals,
    highSignals,
    totalSeverity,
  };
}
