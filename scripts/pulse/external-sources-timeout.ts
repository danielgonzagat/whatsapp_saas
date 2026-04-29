import type { ExternalSourcesConfig } from './adapters/external-sources-orchestrator';

const DEFAULT_BASE_BUDGET_MS = 15_000;
const DEFAULT_ADAPTER_BUDGET_MS = 30_000;
const DEFAULT_MAX_BUDGET_MS = 300_000;

function positiveEnvNumber(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasAnyValue(values: Array<string | undefined>): boolean {
  return values.some((value) => Boolean(value && value.trim()));
}

function firstConfiguredValue(values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value && value.trim()));
}

function hasGithubRepositoryConfig(config: ExternalSourcesConfig): boolean {
  const owner = firstConfiguredValue([config.github?.owner, process.env.GITHUB_OWNER]);
  const repo = firstConfiguredValue([config.github?.repo, process.env.GITHUB_REPO]);
  return Boolean(owner && repo);
}

function hasGithubTokenConfig(config: ExternalSourcesConfig): boolean {
  return hasAnyValue([config.github?.token, process.env.GITHUB_TOKEN]);
}

function hasSentryConfig(config: ExternalSourcesConfig): boolean {
  return Boolean(
    firstConfiguredValue([config.sentry?.authToken, process.env.SENTRY_AUTH_TOKEN]) &&
    firstConfiguredValue([config.sentry?.org, process.env.SENTRY_ORG]) &&
    firstConfiguredValue([config.sentry?.project, process.env.SENTRY_PROJECT]),
  );
}

function hasDatadogConfig(config: ExternalSourcesConfig): boolean {
  return Boolean(
    firstConfiguredValue([config.datadog?.apiKey, process.env.DATADOG_API_KEY]) &&
    firstConfiguredValue([config.datadog?.appKey, process.env.DATADOG_APP_KEY]),
  );
}

function countConfiguredExternalSources(config: ExternalSourcesConfig): number {
  let count = 0;
  if (hasGithubRepositoryConfig(config)) {
    count += 1;
  }
  if (hasSentryConfig(config)) {
    count += 1;
  }
  if (hasGithubRepositoryConfig(config) && hasGithubTokenConfig(config)) {
    count += 1;
  }
  if (hasDatadogConfig(config)) {
    count += 1;
  }
  if (
    hasAnyValue([
      config.prometheus?.baseUrl,
      process.env.PROMETHEUS_BASE_URL,
      process.env.PULSE_PROMETHEUS_URL,
    ])
  ) {
    count += 1;
  }
  if (
    firstConfiguredValue([config.codecov?.owner, process.env.GITHUB_OWNER]) &&
    firstConfiguredValue([config.codecov?.repo, process.env.GITHUB_REPO])
  ) {
    count += 1;
  }
  if (
    firstConfiguredValue([config.dependabot?.token, process.env.GITHUB_TOKEN]) &&
    firstConfiguredValue([config.dependabot?.owner, process.env.GITHUB_OWNER]) &&
    firstConfiguredValue([config.dependabot?.repo, process.env.GITHUB_REPO])
  ) {
    count += 1;
  }
  return count;
}

/** Derive a live external-source phase timeout from configured evidence sources. */
export function deriveExternalSourcesTimeoutMs(config: ExternalSourcesConfig): number {
  const explicitTimeout = positiveEnvNumber('PULSE_EXTERNAL_SOURCES_TIMEOUT_MS');
  if (explicitTimeout) return explicitTimeout;

  const baseBudget =
    positiveEnvNumber('PULSE_EXTERNAL_SOURCES_BASE_TIMEOUT_MS') ?? DEFAULT_BASE_BUDGET_MS;
  const adapterBudget =
    positiveEnvNumber('PULSE_EXTERNAL_SOURCE_TIMEOUT_MS') ?? DEFAULT_ADAPTER_BUDGET_MS;
  const maxBudget =
    positiveEnvNumber('PULSE_EXTERNAL_SOURCES_MAX_TIMEOUT_MS') ?? DEFAULT_MAX_BUDGET_MS;
  const configuredSources = countConfiguredExternalSources(config);
  return Math.min(maxBudget, baseBudget + configuredSources * adapterBudget);
}
