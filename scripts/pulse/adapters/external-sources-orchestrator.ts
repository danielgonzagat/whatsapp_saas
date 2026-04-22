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
import type { PulseSignal } from '../types';

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
    source: string;
    status: 'ready' | 'failed' | 'not-configured';
    signalCount: number;
    syncedAt: string;
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
    const githubConfig = config.github || {
      owner: mergedEnv['GITHUB_OWNER'] || '',
      repo: mergedEnv['GITHUB_REPO'] || '',
      token: mergedEnv['GITHUB_TOKEN'],
    };

    if (githubConfig.owner && githubConfig.repo) {
      const signals = await fetchGitHubSignals(githubConfig);
      signalsBySource['github'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'github',
        status: signals.length > 0 ? 'ready' : 'no-data',
        signalCount: signals.length,
        syncedAt: generatedAt,
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['github'] = [];
      sources.push({
        source: 'github',
        status: 'not-configured',
        signalCount: 0,
        syncedAt: generatedAt,
      });
    }
  } catch (error) {
    signalsBySource['github'] = [];
    sources.push({
      source: 'github',
      status: 'failed',
      signalCount: 0,
      syncedAt: generatedAt,
    });
  }

  // Run Sentry adapter
  try {
    const sentryConfig = config.sentry || {
      authToken: mergedEnv['SENTRY_AUTH_TOKEN'],
      org: mergedEnv['SENTRY_ORG'],
      project: mergedEnv['SENTRY_PROJECT'],
    };

    if (sentryConfig.authToken && sentryConfig.org && sentryConfig.project) {
      const signals = await fetchSentrySignals(sentryConfig);
      signalsBySource['sentry'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'sentry',
        status: signals.length > 0 ? 'ready' : 'no-data',
        signalCount: signals.length,
        syncedAt: generatedAt,
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['sentry'] = [];
      sources.push({
        source: 'sentry',
        status: 'not-configured',
        signalCount: 0,
        syncedAt: generatedAt,
      });
    }
  } catch (error) {
    signalsBySource['sentry'] = [];
    sources.push({
      source: 'sentry',
      status: 'failed',
      signalCount: 0,
      syncedAt: generatedAt,
    });
  }

  // Run GitHub Actions adapter
  try {
    const actionsConfig = config.github || {
      owner: mergedEnv['GITHUB_OWNER'] || '',
      repo: mergedEnv['GITHUB_REPO'] || '',
      token: mergedEnv['GITHUB_TOKEN'],
    };

    if (actionsConfig.owner && actionsConfig.repo) {
      const signals = await fetchGitHubActionsSignals(actionsConfig);
      signalsBySource['github_actions'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'github_actions',
        status: signals.length > 0 ? 'ready' : 'no-data',
        signalCount: signals.length,
        syncedAt: generatedAt,
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['github_actions'] = [];
      sources.push({
        source: 'github_actions',
        status: 'not-configured',
        signalCount: 0,
        syncedAt: generatedAt,
      });
    }
  } catch (error) {
    signalsBySource['github_actions'] = [];
    sources.push({
      source: 'github_actions',
      status: 'failed',
      signalCount: 0,
      syncedAt: generatedAt,
    });
  }

  // Run Datadog adapter
  try {
    const datadogConfig = config.datadog || {
      apiKey: mergedEnv['DATADOG_API_KEY'],
      appKey: mergedEnv['DATADOG_APP_KEY'],
    };

    if (datadogConfig.apiKey && datadogConfig.appKey) {
      const signals = await fetchDatadogSignals(datadogConfig);
      signalsBySource['datadog'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'datadog',
        status: signals.length > 0 ? 'ready' : 'no-data',
        signalCount: signals.length,
        syncedAt: generatedAt,
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['datadog'] = [];
      sources.push({
        source: 'datadog',
        status: 'not-configured',
        signalCount: 0,
        syncedAt: generatedAt,
      });
    }
  } catch (error) {
    signalsBySource['datadog'] = [];
    sources.push({
      source: 'datadog',
      status: 'failed',
      signalCount: 0,
      syncedAt: generatedAt,
    });
  }

  // Run Codecov adapter
  try {
    const codecovConfig = config.codecov || {
      token: mergedEnv['CODECOV_TOKEN'],
      owner: mergedEnv['GITHUB_OWNER'] || '',
      repo: mergedEnv['GITHUB_REPO'] || '',
    };

    if (codecovConfig.token && codecovConfig.owner && codecovConfig.repo) {
      const signals = await fetchCodecovSignals(codecovConfig);
      signalsBySource['codecov'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'codecov',
        status: signals.length > 0 ? 'ready' : 'no-data',
        signalCount: signals.length,
        syncedAt: generatedAt,
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['codecov'] = [];
      sources.push({
        source: 'codecov',
        status: 'not-configured',
        signalCount: 0,
        syncedAt: generatedAt,
      });
    }
  } catch (error) {
    signalsBySource['codecov'] = [];
    sources.push({
      source: 'codecov',
      status: 'failed',
      signalCount: 0,
      syncedAt: generatedAt,
    });
  }

  // Run Dependabot adapter
  try {
    const dependabotConfig = config.dependabot || {
      token: mergedEnv['GITHUB_TOKEN'],
      owner: mergedEnv['GITHUB_OWNER'] || '',
      repo: mergedEnv['GITHUB_REPO'] || '',
    };

    if (dependabotConfig.token && dependabotConfig.owner && dependabotConfig.repo) {
      const signals = await fetchDependabotSignals(dependabotConfig);
      signalsBySource['dependabot'] = signals;
      allSignals.push(...signals);
      sources.push({
        source: 'dependabot',
        status: signals.length > 0 ? 'ready' : 'no-data',
        signalCount: signals.length,
        syncedAt: generatedAt,
      });
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      signalsBySource['dependabot'] = [];
      sources.push({
        source: 'dependabot',
        status: 'not-configured',
        signalCount: 0,
        syncedAt: generatedAt,
      });
    }
  } catch (error) {
    signalsBySource['dependabot'] = [];
    sources.push({
      source: 'dependabot',
      status: 'failed',
      signalCount: 0,
      syncedAt: generatedAt,
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
