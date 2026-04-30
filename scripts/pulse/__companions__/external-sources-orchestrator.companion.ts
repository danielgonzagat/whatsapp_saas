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
      'github',
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
      'github_actions',
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
      'codecov',
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
      'sentry',
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
      'datadog',
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
      'prometheus',
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
      'dependabot',
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
      'gitnexus',
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
          'gitnexus',
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

  totalSeverity += await runGitNexusAdapter({
    config,
    allSignals,
    signalsBySource,
    sources,
    generatedAt,
  });

  const criticalSignals = allSignals.filter((s) => s.severity >= 4);
  const highSignals = allSignals.filter((s) => s.severity >= 3 && s.severity < 4);

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

