/**
 * External sources orchestrator — capability discovery
 * Scans repo, CI, env, and tool surfaces to detect which external sources are available.
 */

import type { PulseCertificationProfile } from '../../types';
import { deriveZeroValue } from '../../dynamic-reality-kernel';
import {
  commandAvailable,
  repoPathExists,
  repoDirHasFile,
  repoFilesContain,
  hasEnvValue,
  presentEvidence,
  githubSource,
  githubActionsSource,
  codecovSource,
  sentrySource,
  datadogSource,
  prometheusSource,
  dependabotSource,
  gitnexusSource,
} from './helpers';
import type { ExternalSourceDiscoveryContext } from './helpers';
import { sourceCapability } from './core';
import type { ExternalSourceCapabilityMetadata } from './core';

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
