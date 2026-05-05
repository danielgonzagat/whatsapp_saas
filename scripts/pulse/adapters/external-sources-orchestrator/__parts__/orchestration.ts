/**
 * External sources orchestrator — main execution loop
 * Runs all external adapters and consolidates signals into a single state report.
 */

import type { PulseSignal } from '../../types';
import { deriveZeroValue } from '../../dynamic-reality-kernel';
import { fetchGitHubSignals } from '../../github-adapter';
import { fetchSentrySignals } from '../../sentry-adapter';
import { fetchDatadogSignals } from '../../datadog-adapter';
import { fetchPrometheusSignals } from '../../prometheus-adapter';
import { fetchCodecovSignals } from '../../codecov-adapter';
import { fetchDependabotSignals } from '../../dependabot-adapter';
import { fetchGitHubActionsSignals } from '../../github-actions-adapter';
import { runGitNexusAdapter } from '../../gitnexus-adapter';
import {
  readyStatus,
  githubSource,
  sentrySource,
  githubActionsSource,
  datadogSource,
  prometheusSource,
  codecovSource,
  dependabotSource,
  readCurrentHeadSha,
  fourThreshold,
  threeThreshold,
} from './helpers';
import {
  buildOrchestrationContext,
  normalizeExternalSignalProfile,
  classifyLiveExternalSource,
  sourceCapability,
  pushSourceErrorResult,
  pushSourceNotAvailableResult,
} from './core';
import type {
  ExternalSourcesConfig,
  ExternalSourceRunResult,
  ConsolidatedExternalState,
} from './core';
import { discoverExternalSourceCapabilities } from './capability';

/** Run external sources orchestrator. */
export async function runExternalSourcesOrchestrator(
  config: ExternalSourcesConfig,
): Promise<ConsolidatedExternalState> {
  const ctx = buildOrchestrationContext(config);
  const sources: ExternalSourceRunResult[] = [];
  const allSignals: PulseSignal[] = [];
  const signalsBySource: Record<string, PulseSignal[]> = {};
  let totalSeverity = deriveZeroValue();

  const { generatedAt, mergedEnv, githubOwner, githubRepo, githubToken } = ctx;

  // Run GitHub adapter
  try {
    const gc = { owner: githubOwner, repo: githubRepo, token: githubToken };
    if (gc.owner && gc.repo) {
      const signals = await fetchGitHubSignals(gc);
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
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        githubSource(),
        'GitHub owner/repo were not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      githubSource(),
      'GitHub live adapter failed while fetching signals.',
      generatedAt,
    );
  }

  // Run Sentry adapter
  try {
    const sc = {
      authToken: config.sentry?.authToken || mergedEnv['SENTRY_AUTH_TOKEN'],
      org: config.sentry?.org || mergedEnv['SENTRY_ORG'],
      project: config.sentry?.project || mergedEnv['SENTRY_PROJECT'],
    };
    if (sc.authToken && sc.org && sc.project) {
      const signals = await fetchSentrySignals(sc);
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
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        sentrySource(),
        'Sentry token/org/project were not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      sentrySource(),
      'Sentry live adapter failed while fetching signals.',
      generatedAt,
    );
  }

  // Run GitHub Actions adapter
  try {
    const ac = {
      owner: githubOwner,
      repo: githubRepo,
      token: githubToken,
      currentHeadSha: readCurrentHeadSha(config.rootDir),
    };
    if (ac.token && ac.owner && ac.repo) {
      const signals = await fetchGitHubActionsSignals(ac);
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
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        githubActionsSource(),
        'GitHub Actions token/owner/repo were not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      githubActionsSource(),
      'GitHub Actions live adapter failed while fetching signals.',
      generatedAt,
    );
  }

  // Run Datadog adapter
  try {
    const dc = {
      apiKey: config.datadog?.apiKey || mergedEnv['DATADOG_API_KEY'],
      appKey: config.datadog?.appKey || mergedEnv['DATADOG_APP_KEY'],
      site: config.datadog?.site || mergedEnv['DATADOG_SITE'],
    };
    if (dc.apiKey && dc.appKey) {
      const signals = await fetchDatadogSignals(dc);
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
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        datadogSource(),
        'Datadog API/app keys were not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      datadogSource(),
      'Datadog live adapter failed while fetching signals.',
      generatedAt,
    );
  }

  // Run Prometheus adapter
  try {
    const pc = {
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
    if (pc.baseUrl) {
      const signals = await fetchPrometheusSignals(pc);
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
      totalSeverity += signals.reduce((sum, s) => sum + s.severity, 0);
    } else {
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        prometheusSource(),
        'Prometheus base URL was not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      prometheusSource(),
      'Prometheus live adapter failed while fetching signals.',
      generatedAt,
    );
  }

  // Run Codecov adapter
  try {
    const cc = {
      token: config.codecov?.token || mergedEnv['CODECOV_TOKEN'],
      owner: config.codecov?.owner || mergedEnv['GITHUB_OWNER'] || githubOwner,
      repo: config.codecov?.repo || mergedEnv['GITHUB_REPO'] || githubRepo,
    };
    if (cc.owner && cc.repo) {
      const signals = await fetchCodecovSignals(cc);
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
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        codecovSource(),
        'Codecov owner/repo were not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      codecovSource(),
      'Codecov live adapter failed while fetching signals.',
      generatedAt,
    );
  }

  // Run Dependabot adapter
  try {
    const dc = {
      token: config.dependabot?.token || mergedEnv['GITHUB_TOKEN'] || githubToken,
      owner: config.dependabot?.owner || mergedEnv['GITHUB_OWNER'] || githubOwner,
      repo: config.dependabot?.repo || mergedEnv['GITHUB_REPO'] || githubRepo,
    };
    if (dc.token && dc.owner && dc.repo) {
      const signals = await fetchDependabotSignals(dc);
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
      pushSourceNotAvailableResult(
        signalsBySource,
        sources,
        dependabotSource(),
        'Dependabot token/owner/repo were not configured for the live adapter.',
        generatedAt,
      );
    }
  } catch (_error) {
    pushSourceErrorResult(
      signalsBySource,
      sources,
      dependabotSource(),
      'Dependabot live adapter failed while fetching signals.',
      generatedAt,
    );
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
      gitHubRemote: ctx.gitHubRemote,
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
