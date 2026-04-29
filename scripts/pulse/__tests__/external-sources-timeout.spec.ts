import { afterEach, describe, expect, it } from 'vitest';

import type { ExternalSourcesConfig } from '../adapters/external-sources-orchestrator';
import { deriveExternalSourcesTimeoutMs } from '../external-sources-timeout';

const TIMEOUT_ENV_KEYS = [
  'PULSE_EXTERNAL_SOURCES_TIMEOUT_MS',
  'PULSE_EXTERNAL_SOURCES_BASE_TIMEOUT_MS',
  'PULSE_EXTERNAL_SOURCE_TIMEOUT_MS',
  'PULSE_EXTERNAL_SOURCES_MAX_TIMEOUT_MS',
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'GITHUB_TOKEN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'DATADOG_API_KEY',
  'DATADOG_APP_KEY',
  'PROMETHEUS_BASE_URL',
  'PULSE_PROMETHEUS_URL',
  'CODECOV_TOKEN',
] as const;

const originalEnv = new Map<string, string | undefined>(
  TIMEOUT_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
  for (const key of TIMEOUT_ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

function clearEnv(): void {
  for (const key of TIMEOUT_ENV_KEYS) {
    delete process.env[key];
  }
}

describe('deriveExternalSourcesTimeoutMs', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('uses an explicit env override when configured', () => {
    clearEnv();
    process.env.PULSE_EXTERNAL_SOURCES_TIMEOUT_MS = '42000';

    expect(deriveExternalSourcesTimeoutMs({ rootDir: '/repo' })).toBe(42_000);
  });

  it('derives budget from configured live sources instead of a fixed 15s cap', () => {
    clearEnv();
    process.env.PULSE_EXTERNAL_SOURCES_BASE_TIMEOUT_MS = '1000';
    process.env.PULSE_EXTERNAL_SOURCE_TIMEOUT_MS = '2000';

    const config: ExternalSourcesConfig = {
      rootDir: '/repo',
      github: {
        owner: 'owner',
        repo: 'repo',
        token: 'token',
      },
      sentry: {
        authToken: 'token',
        org: 'org',
        project: 'project',
      },
      prometheus: {
        baseUrl: 'https://prometheus.example.test',
      },
    };

    expect(deriveExternalSourcesTimeoutMs(config)).toBe(9_000);
  });

  it('honors the max timeout guard after dynamic source derivation', () => {
    clearEnv();
    process.env.PULSE_EXTERNAL_SOURCES_BASE_TIMEOUT_MS = '1000';
    process.env.PULSE_EXTERNAL_SOURCE_TIMEOUT_MS = '5000';
    process.env.PULSE_EXTERNAL_SOURCES_MAX_TIMEOUT_MS = '6000';

    const config: ExternalSourcesConfig = {
      rootDir: '/repo',
      github: {
        owner: 'owner',
        repo: 'repo',
        token: 'token',
      },
      datadog: {
        apiKey: 'api-key',
        appKey: 'app-key',
      },
    };

    expect(deriveExternalSourcesTimeoutMs(config)).toBe(6_000);
  });

  it('does not count partially configured adapters as live source budget', () => {
    clearEnv();
    process.env.PULSE_EXTERNAL_SOURCES_BASE_TIMEOUT_MS = '1000';
    process.env.PULSE_EXTERNAL_SOURCE_TIMEOUT_MS = '2000';

    const config: ExternalSourcesConfig = {
      rootDir: '/repo',
      sentry: {
        authToken: 'token',
      },
      datadog: {
        apiKey: 'api-key',
      },
    };

    expect(deriveExternalSourcesTimeoutMs(config)).toBe(1_000);
  });
});
