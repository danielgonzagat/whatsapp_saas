import { execFileSync } from 'child_process';
import type { PulseCertificationProfile, PulseExternalSignalSource } from '../../../types';
import { isDirectory, pathExists, readDir, readTextFile } from '../../../safe-fs';
import { safeJoin } from '../../../safe-path';
import {
  getAdapterRequiredness,
  isAdapterRequired,
  type AdapterRequiredness,
  type ExternalSourceCapabilityMetadata,
} from './types';

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

type ExternalSourceCapabilityKind = 'repo' | 'ci' | 'env' | 'tool' | 'config' | 'artifact';

interface ExternalSourceCapabilityEvidence {
  kind: ExternalSourceCapabilityKind;
  key: string;
  present: boolean;
  reason: string;
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

export { readDotEnvFile, readGitHubRemote, readGitHubCliToken, readCurrentHeadSha, readEnv };
