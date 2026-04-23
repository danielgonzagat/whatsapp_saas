/**
 * External sources orchestrator for PULSE v3
 * Runs all 6 adapters in parallel and consolidates signals
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchGitHubSignals } from './github-adapter';
import { fetchSentrySignals } from './sentry-adapter';
import { fetchDatadogSignals } from './datadog-adapter';
import { fetchCodecovSignals } from './codecov-adapter';
import { fetchDependabotSignals } from './dependabot-adapter';
import { fetchGitHubActionsSignals } from './github-actions-adapter';
import type { PulseExternalAdapterStatus, PulseExternalSignalSource, PulseSignal } from '../types';

export interface ExternalSourcesConfig {
  rootDir: string;
  github?: {
    owner: string;
    repo: string;
    token?: string;
  };
  sentry?: {
    authToken?: string;
    org?: string;
    project?: string;
  };
  datadog?: {
    apiKey?: string;
    appKey?: string;
    site?: string;
  };
  codecov?: {
    token?: string;
    owner?: string;
    repo?: string;
  };
  dependabot?: {
    token?: string;
    owner?: string;
    repo?: string;
  };
}

export interface ConsolidatedExternalState {
  generatedAt: string;
  sources: Array<{
    source: PulseExternalSignalSource;
    status: PulseExternalAdapterStatus;
    signalCount: number;
    syncedAt: string;
    reason: string;
  }>;
  allSignals: PulseSignal[];
  signalsBySource: Record<string, PulseSignal[]>;
  criticalSignals: PulseSignal[];
  highSignals: PulseSignal[];
  totalSeverity: number;
}

function readEnv(key: string): string | undefined {
  return process.env[key];
}

function readDotEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;

  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

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

export async function runExternalSourcesOrchestrator(
  config: ExternalSourcesConfig,
): Promise<ConsolidatedExternalState> {
  const generatedAt = new Date().toISOString();
  const sources = [];
  const allSignals: PulseSignal[] = [];
  const signalsBySource: Record<string, PulseSignal[]> = {};
  let totalSeverity = 0;

  // Try to load environment from .env.pulse.local if available
  const envLocal = readDotEnvFile(path.join(config.rootDir, '.env.pulse.local'));
  const envPath = readDotEnvFile(path.join(config.rootDir, '.env'));

  const mergedEnv = { ...process.env, ...envPath, ...envLocal };

  // Run GitHub adapter
  try {
    const githubConfig = {
      owner: config.github?.owner || mergedEnv['GITHUB_OWNER'] || '',
      repo: config.github?.repo || mergedEnv['GITHUB_REPO'] || '',
      token: config.github?.token || mergedEnv['GITHUB_TOKEN'],
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
      owner: config.github?.owner || mergedEnv['GITHUB_OWNER'] || '',
      repo: config.github?.repo || mergedEnv['GITHUB_REPO'] || '',
      token: config.github?.token || mergedEnv['GITHUB_TOKEN'],
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

  // Run Codecov adapter
  try {
    const codecovConfig = {
      token: config.codecov?.token || mergedEnv['CODECOV_TOKEN'],
      owner: config.codecov?.owner || mergedEnv['GITHUB_OWNER'] || '',
      repo: config.codecov?.repo || mergedEnv['GITHUB_REPO'] || '',
    };

    if (codecovConfig.token && codecovConfig.owner && codecovConfig.repo) {
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
        reason: 'Codecov token/owner/repo were not configured for the live adapter.',
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
      token: config.dependabot?.token || mergedEnv['GITHUB_TOKEN'],
      owner: config.dependabot?.owner || mergedEnv['GITHUB_OWNER'] || '',
      repo: config.dependabot?.repo || mergedEnv['GITHUB_REPO'] || '',
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

  const criticalSignals = allSignals.filter((s) => s.severity >= 4);
  const highSignals = allSignals.filter((s) => s.severity >= 3 && s.severity < 4);

  return {
    generatedAt,
    sources,
    allSignals,
    signalsBySource,
    criticalSignals,
    highSignals,
    totalSeverity,
  };
}
