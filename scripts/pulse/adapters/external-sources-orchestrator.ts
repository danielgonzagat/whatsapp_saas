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
import { fetchGitNexusSignal } from './gitnexus-adapter';
import type { PulseExternalAdapterStatus, PulseExternalSignalSource, PulseSignal } from '../types';
import { pathExists, readTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';

/**
 * Adapter requiredness profile.
 * - `required`: must be configured for production-grade certification
 * - `optional`: never blocks certification (signal-only)
 * - `profile-dependent`: required when profile === 'production-final', optional otherwise
 */
export type AdapterRequiredness = 'required' | 'optional' | 'profile-dependent';

/**
 * Per-adapter requiredness table.
 *
 * For profile === 'production-final', the canonical FASE 4 required set is:
 * codacy, github, github_actions, codecov, sentry, datadog, dependabot, prometheus.
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
  prometheus: 'profile-dependent',
  dependabot: 'profile-dependent',
  gitnexus: 'optional',
};

/**
 * Resolve effective requiredness for a given adapter under a profile.
 * Returns true when the adapter is required (blocking) under the active profile.
 */
export function isAdapterRequired(source: string, profile: string | undefined): boolean {
  const declared = ADAPTER_REQUIREDNESS[source] ?? 'optional';
  if (declared === 'required') return true;
  if (declared === 'optional') return false;
  return profile === 'production-final';
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
   * When 'production-final', profile-dependent adapters become required.
   * When undefined or any other value, profile-dependent adapters become optional.
   */
  profile?: string;
}

/** Consolidated external state shape. */
export interface ConsolidatedExternalState {
  /** Generated at property. */
  generatedAt: string;
  /** Sources property. */
  sources: Array<{
    source: PulseExternalSignalSource;
    status: PulseExternalAdapterStatus;
    signalCount: number;
    syncedAt: string;
    reason: string;
  }>;
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

/** Run external sources orchestrator. */
export async function runExternalSourcesOrchestrator(
  config: ExternalSourcesConfig,
): Promise<ConsolidatedExternalState> {
  const generatedAt = new Date().toISOString();
  const sources: Array<{
    source: PulseExternalSignalSource;
    status: PulseExternalAdapterStatus;
    signalCount: number;
    syncedAt: string;
    reason: string;
  }> = [];
  const allSignals: PulseSignal[] = [];
  const signalsBySource: Record<string, PulseSignal[]> = {};
  let totalSeverity = 0;

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
      signalsBySource['github'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'github',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} GitHub signal(s) fetched from the live adapter.`
            : 'GitHub live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['github'] = [];
      sources.push({
        source: 'github',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'GitHub owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['github'] = [];
    sources.push({
      source: 'github',
      status: 'invalid',
      signalCount: 0,
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
      signalsBySource['sentry'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'sentry',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} Sentry signal(s) fetched from the live adapter.`
            : 'Sentry live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['sentry'] = [];
      sources.push({
        source: 'sentry',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'Sentry token/org/project were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['sentry'] = [];
    sources.push({
      source: 'sentry',
      status: 'invalid',
      signalCount: 0,
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
      signalsBySource['github_actions'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'github_actions',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} GitHub Actions signal(s) fetched from the live adapter.`
            : 'GitHub Actions live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['github_actions'] = [];
      sources.push({
        source: 'github_actions',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'GitHub Actions token/owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['github_actions'] = [];
    sources.push({
      source: 'github_actions',
      status: 'invalid',
      signalCount: 0,
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
      signalsBySource['datadog'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'datadog',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} Datadog signal(s) fetched from the live adapter.`
            : 'Datadog live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['datadog'] = [];
      sources.push({
        source: 'datadog',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'Datadog API/app keys were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['datadog'] = [];
    sources.push({
      source: 'datadog',
      status: 'invalid',
      signalCount: 0,
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
      signalsBySource['prometheus'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'prometheus',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} Prometheus signal(s) fetched from the live adapter.`
            : 'Prometheus live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, signal) => sum + signal.severity, 0);
    } else {
      signalsBySource['prometheus'] = [];
      sources.push({
        source: 'prometheus',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'Prometheus base URL was not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['prometheus'] = [];
    sources.push({
      source: 'prometheus',
      status: 'invalid',
      signalCount: 0,
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
      signalsBySource['codecov'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'codecov',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} Codecov signal(s) fetched from the live adapter.`
            : 'Codecov live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['codecov'] = [];
      sources.push({
        source: 'codecov',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'Codecov owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['codecov'] = [];
    sources.push({
      source: 'codecov',
      status: 'invalid',
      signalCount: 0,
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
      signalsBySource['dependabot'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'dependabot',
        status: 'ready',
        signalCount: signals.length,
        syncedAt: generatedAt,
        reason:
          signals.length > 0
            ? `${signals.length} Dependabot signal(s) fetched from the live adapter.`
            : 'Dependabot live adapter is configured but returned no actionable signals.',
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['dependabot'] = [];
      sources.push({
        source: 'dependabot',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'Dependabot token/owner/repo were not configured for the live adapter.',
      });
    }
  } catch (error) {
    signalsBySource['dependabot'] = [];
    sources.push({
      source: 'dependabot',
      status: 'invalid',
      signalCount: 0,
      syncedAt: generatedAt,
      reason: 'Dependabot live adapter failed while fetching signals.',
    });
  }

  // Run GitNexus adapter — code graph structural signals
  try {
    const gnSig = await fetchGitNexusSignal(config.rootDir);
    if (gnSig) {
      allSignals.push(gnSig);
      signalsBySource['gitnexus'] = [gnSig];
      sources.push({
        source: 'gitnexus',
        status: gnSig.severity >= 0.8 ? 'stale' : 'ready',
        signalCount: 1,
        syncedAt: generatedAt,
        reason: gnSig.summary,
      });
      totalSeverity += gnSig.severity;
    } else {
      sources.push({
        source: 'gitnexus',
        status: 'not_available',
        signalCount: 0,
        syncedAt: generatedAt,
        reason: 'GitNexus adapter returned no signal.',
      });
    }
  } catch {
    signalsBySource['gitnexus'] = [];
    sources.push({
      source: 'gitnexus',
      status: 'invalid',
      signalCount: 0,
      syncedAt: generatedAt,
      reason: 'GitNexus adapter failed.',
    });
  }

  const criticalSignals = allSignals.filter((s) => s.severity >= 4);
  const highSignals = allSignals.filter((s) => s.severity >= 3 && s.severity < 4);

  // Apply requiredness semantics: optional adapters that are not configured
  // must be reported as `optional_not_configured` so they do not block
  // certification. Required adapters keep `not_available` / `invalid`.
  const profile = config.profile;
  const refinedSources = sources.map((entry) => {
    if (entry.status !== 'not_available') return entry;
    const required = isAdapterRequired(entry.source, profile);
    if (required) return entry;
    return {
      ...entry,
      status: 'optional_not_configured' as PulseExternalAdapterStatus,
      reason: `${entry.source} adapter is optional under profile=${profile || 'default'} and was not configured.`,
    };
  });

  return {
    generatedAt,
    sources: refinedSources,
    allSignals,
    signalsBySource,
    criticalSignals,
    highSignals,
    totalSeverity,
  };
}
